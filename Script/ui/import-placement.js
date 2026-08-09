

var placementMode = {
  active: false,
  zone: null,
  mesh: null,           // THREE.Group: preview mesh in scene
  planeHelper: null,    // invisible XZ plane for raycasting
  raycaster: null,
  dragging: false,
  isReposition: false   // true when repositioning an already-confirmed zone
};
var IMPORT_LIMIT = 5;
var importN = 0;


function bakeImportedHeightmap(srcState){
  var savedNoise=gNoise, savedRough=STATE.rough, savedSeed=STATE.seed, savedFlow=gFlowMap;
  try{
    var impSeed = srcState.seed!=null ? srcState.seed : 0;
    gNoise = new SimplexNoise(impSeed);
    STATE.rough = srcState.rough!=null ? srcState.rough : 0.5;
    STATE.seed  = impSeed;

    var res  = Math.max(16, Math.min(256, srcState.res||80));
    var GRID = res+1, VC = GRID*GRID;
    var eqFn = getEquationFn(srcState.eq || 'fbm(x,y,6)*3');
    var scl  = srcState.scale!=null ? srcState.scale : 1.0;
    var amp  = srcState.amp!=null   ? srcState.amp   : 2.0;
    
    var mapArea = srcState.mapArea!=null ? srcState.mapArea : 1.0;
    var s = SURF/res;
    var srcHalfWorld = (SURF/2)*scl*mapArea; // source project's own world units, for its regions below
    var hmap = new Float32Array(VC);

    var layerFns=[];
    if(srcState.layers && srcState.layers.length){
      srcState.layers.forEach(function(l){
        if(!l.on) return;
        var lf=null; try{ lf=getEquationFn(l.eq); }catch(e){}
        if(lf) layerFns.push({fn:lf, blend:l.blend||'add', op:l.op!=null?l.op:1.0});
      });
    }

    
    var activeRegions=[];
    if(srcState.regions && srcState.regions.length){
      srcState.regions.forEach(function(rgn){
        if(!rgn.on) return;
        var rfn=null; try{ rfn=getEquationFn(rgn.eq); }catch(e){}
        if(!rfn) return;
        activeRegions.push({
          fn:rfn,
          rx:(rgn.x||0)*srcHalfWorld, ry:(rgn.y||0)*srcHalfWorld,
          rr:Math.max(0.05, rgn.radius||0.5)*srcHalfWorld,
          strength:rgn.strength||1.0, blend:rgn.blend||'blend'
        });
      });
    }

    var riverOn   = !!srcState.riverOn;
    var riverWarp = srcState.riverWarp!=null  ? srcState.riverWarp  : 0.8;
    var riverDep  = srcState.riverDepth!=null ? srcState.riverDepth : 0.6;

    for(var j=0;j<GRID;j++){
      for(var i=0;i<GRID;i++){
        var wx=(i-res/2)*s*scl*mapArea, wy=(j-res/2)*s*scl*mapArea;
        var h=eqFn(wx,wy,0)*amp;
        for(var li=0; li<layerFns.length; li++){
          var lay=layerFns[li];
          var lh=lay.fn(wx,wy,0)*lay.op;
          if(lay.blend==='add') h+=lh;
          else if(lay.blend==='multiply') h*=(1+lh*.3);
          else if(lay.blend==='subtract') h-=lh;
          else if(lay.blend==='replace') h=h*(1-lay.op)+lay.fn(wx,wy,0)*lay.op;
        }
        for(var rgi=0; rgi<activeRegions.length; rgi++){
          var ar=activeRegions[rgi];
          var ddx=wx-ar.rx, ddy=wy-ar.ry;
          var dd=Math.sqrt(ddx*ddx+ddy*ddy);
          if(dd>=ar.rr) continue;
          var tt=1.0-dd/ar.rr;
          var mask=tt*tt*(3-2*tt);
          var rh=ar.fn(wx,wy,0)*ar.strength;
          if(ar.blend==='add')          h += rh*mask;
          else if(ar.blend==='blend')   h  = h*(1-mask)+rh*mask;
          else if(ar.blend==='replace') h  = h*(1-mask*0.9)+rh*(mask*0.9);
          else if(ar.blend==='multiply')h *= (1.0+(rh-h)*mask*0.4);
        }
        if(riverOn){
          var rwx=wx+riverWarp*sn(wx*0.5+3.1,wy*0.5+1.7);
          var rwy=wy+riverWarp*sn(wx*0.5+8.4,wy*0.5+4.3);
          var rv=Math.abs(sn(rwx*0.7,rwy*0.7));
          if(rv<0.18) h -= riverDep*(0.18-rv)/0.18;
        }
        hmap[j*GRID+i]=h;
      }
    }

    var etype = srcState.erosionType || 'none';
    if(etype==='laplacian' && (srcState.erosion||0)>0.01){
      hmap = erode(hmap, GRID, srcState.erosion);
    } else if(etype==='thermal'){
      hmap = erodeThermally(hmap, GRID, srcState.talusAngle||30, srcState.thermIters||20);
    } else if(etype==='hydraulic'){
      var r1 = erodeHydraulic(hmap, GRID, {
        droplets:srcState.droplets||3000, inertia:srcState.inertia||0.05,
        eroRate:srcState.eroRate||0.3, depRate:srcState.depRate||0.3, evap:srcState.evap||0.02
      });
      hmap = r1.hmap;
    } else if(etype==='both'){
      hmap = erodeThermally(hmap, GRID, srcState.talusAngle||30, Math.floor((srcState.thermIters||20)*.5));
      var r2 = erodeHydraulic(hmap, GRID, {
        droplets:Math.floor((srcState.droplets||3000)*.5), inertia:srcState.inertia||0.05,
        eroRate:srcState.eroRate||0.3, depRate:srcState.depRate||0.3, evap:srcState.evap||0.02
      });
      hmap = r2.hmap;
    }

    return {
      hmap:hmap, GRID:GRID, s:s,
      worldSize: SURF*scl*mapArea,
      seaLevel: srcState.seaLevel||0
    };
  } finally {
    gNoise = savedNoise;
    STATE.rough = savedRough;
    STATE.seed = savedSeed;
    gFlowMap = savedFlow;
  }
}


function applyImportedZones(hmap, GRID, s, mapArea, scl){
  if(!STATE.importedTerrains || !STATE.importedTerrains.length) return;
  var res = GRID-1;
  var halfWorld = (SURF/2) * scl * mapArea;
  for(var zi=0; zi<STATE.importedTerrains.length; zi++){
    var zone = STATE.importedTerrains[zi];
    if(!zone.on || !zone.hmap) continue;
    var zGRID=zone.gridRes, zRes=zGRID-1;
    var effSize=zone.worldSize*(zone.impScale||1.0)*(zone.impMapArea||1.0);
    var zHalf=effSize/2;
    if(!(zHalf>0)) continue;
    var feather=Math.max(0.02,Math.min(0.45, zone.feather!=null?zone.feather:0.1));
    var maskStart=1-feather;
    var zx=(zone.x||0)*halfWorld, zy=(zone.y||0)*halfWorld;

    for(var j=0;j<GRID;j++){
      for(var i=0;i<GRID;i++){
        var wx=(i-res/2)*s*scl*mapArea, wy=(j-res/2)*s*scl*mapArea;
        var lx=wx-zx, ly=wy-zy;
        if(Math.abs(lx)>zHalf || Math.abs(ly)>zHalf) continue;

        var gi=(lx/zHalf)*(zRes/2)+zRes/2;
        var gj=(ly/zHalf)*(zRes/2)+zRes/2;
        gi=Math.max(0,Math.min(zRes-0.001,gi));
        gj=Math.max(0,Math.min(zRes-0.001,gj));
        var ix=Math.floor(gi), iy=Math.floor(gj);
        var fx=gi-ix, fy=gj-iy;
        if(ix>=zGRID-1) ix=zGRID-2;
        if(iy>=zGRID-1) iy=zGRID-2;
        var h00=zone.hmap[iy*zGRID+ix],     h10=zone.hmap[iy*zGRID+ix+1];
        var h01=zone.hmap[(iy+1)*zGRID+ix], h11=zone.hmap[(iy+1)*zGRID+ix+1];
        var zh=h00*(1-fx)*(1-fy)+h10*fx*(1-fy)+h01*(1-fx)*fy+h11*fx*fy;

        var edgeDist=Math.max(Math.abs(lx),Math.abs(ly))/zHalf;
        var mask = edgeDist<=maskStart ? 1 : 1-smoothstepFn(maskStart,1.0,edgeDist);

        var idx=j*GRID+i;
        hmap[idx]=hmap[idx]*(1-mask)+zh*mask;
      }
    }
  }
}



function getHalfWorld(){
  return (20/2)*(STATE.scale||1.0)*(STATE.mapArea||1.0);
}

// Build a live THREE.js preview group for an imported zone's heightmap
function buildImportPreviewMesh(zone){
  var zGRID=zone.gridRes, zRes=zGRID-1;
  var worldSize=zone.worldSize;

  // Find height range for visual centering
  var hmin=Infinity, hmax=-Infinity;
  for(var k=0;k<zone.hmap.length;k++){
    if(zone.hmap[k]<hmin) hmin=zone.hmap[k];
    if(zone.hmap[k]>hmax) hmax=zone.hmap[k];
  }
  var hRange=hmax-hmin||1;

  var geo=new THREE.BufferGeometry();
  var positions=new Float32Array(zGRID*zGRID*3);
  var indices=[];
  var step=worldSize/zRes;
  var half=worldSize/2;

  for(var j=0;j<zGRID;j++){
    for(var i=0;i<zGRID;i++){
      var idx=j*zGRID+i;
      positions[idx*3  ]=i*step-half;
      positions[idx*3+1]=zone.hmap[idx];
      positions[idx*3+2]=j*step-half;
    }
  }
  for(var j=0;j<zRes;j++){
    for(var i=0;i<zRes;i++){
      var a=j*zGRID+i, b=a+1, c=a+zGRID, d=c+1;
      indices.push(a,b,d); indices.push(a,d,c);
    }
  }
  geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  var group=new THREE.Group();

  
  var solidMat=new THREE.MeshPhongMaterial({
    color:0xdda830, emissive:0x331800,
    transparent:true, opacity:0.52,
    side:THREE.DoubleSide, depthWrite:false,
    toneMapped:false
  });
  group.add(new THREE.Mesh(geo,solidMat));

  // Gold wireframe overlay
  var wireMat=new THREE.MeshBasicMaterial({
    color:0xffe066, wireframe:true,
    transparent:true, opacity:0.28,
    toneMapped:false
  });
  group.add(new THREE.Mesh(geo,wireMat));

  // Footprint plane at seaLevel — shows coverage on world
  var fpGeo=new THREE.PlaneGeometry(worldSize,worldSize);
  fpGeo.rotateX(-Math.PI/2);
  var fpMat=new THREE.MeshBasicMaterial({
    color:0xeebb55, transparent:true, opacity:0.07,
    side:THREE.DoubleSide, depthWrite:false,
    toneMapped:false
  });
  var fpMesh=new THREE.Mesh(fpGeo,fpMat);
  fpMesh.position.y=zone.seaLevel||0;
  group.add(fpMesh);

  // Glowing edge border (XZ footprint)
  var borderPts=[
    new THREE.Vector3(-half,zone.seaLevel||0,-half),
    new THREE.Vector3( half,zone.seaLevel||0,-half),
    new THREE.Vector3( half,zone.seaLevel||0, half),
    new THREE.Vector3(-half,zone.seaLevel||0, half),
    new THREE.Vector3(-half,zone.seaLevel||0,-half)
  ];
  var borderGeo=new THREE.BufferGeometry().setFromPoints(borderPts);
  var borderMat=new THREE.LineBasicMaterial({color:0xffdd44, toneMapped:false});
  group.add(new THREE.Line(borderGeo,borderMat));

  // Bounding box on the 3D terrain shape
  var bboxGeo=new THREE.EdgesGeometry(
    new THREE.BoxGeometry(worldSize, hRange, worldSize)
  );
  var bboxMat=new THREE.LineBasicMaterial({color:0xffcc22, toneMapped:false});
  var bbox=new THREE.LineSegments(bboxGeo,bboxMat);
  bbox.position.y=(hmin+hmax)/2;
  group.add(bbox);

  // Corner posts — 4 vertical lines from ground to terrain peak
  var postMat=new THREE.LineBasicMaterial({color:0xffcc22,transparent:true,opacity:0.4, toneMapped:false});
  [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(function(c){
    var pts=[
      new THREE.Vector3(c[0]*half,zone.seaLevel||0,c[1]*half),
      new THREE.Vector3(c[0]*half,hmax,c[1]*half)
    ];
    var pg=new THREE.BufferGeometry().setFromPoints(pts);
    group.add(new THREE.Line(pg,postMat));
  });

  return group;
}

// Update the placement HUD with current zone position and effective size
function updatePlacementHUD(){
  var zone=placementMode.zone; if(!zone) return;
  var hw=getHalfWorld();
  var wx=(zone.x||0)*hw, wz=(zone.y||0)*hw;
  var xEl=document.getElementById('iph-coord-x');
  var zEl=document.getElementById('iph-coord-z');
  if(xEl) xEl.innerHTML=wx.toFixed(1)+'<span style="font-size:9px;color:var(--t3)">u</span>';
  if(zEl) zEl.innerHTML=wz.toFixed(1)+'<span style="font-size:9px;color:var(--t3)">u</span>';
  // Map extents info
  var totalWorld=hw*2;
  var msEl=document.getElementById('iph-mapsize');
  if(msEl) msEl.textContent=totalWorld.toFixed(1)+'u × '+totalWorld.toFixed(1)+'u';
  // Effective size = base * scale * mapArea
  var eff=(zone.impScale||1.0)*(zone.impMapArea||1.0);
  var effSize=zone.worldSize*eff;
  var pct=Math.round((effSize/totalWorld)*100);
  var covEl=document.getElementById('iph-coverage');
  if(covEl) covEl.textContent=pct+'% of map';
  var esEl=document.getElementById('iph-effsize');
  if(esEl) esEl.textContent=effSize.toFixed(1)+'u × '+effSize.toFixed(1)+'u';
}

// Raycast mouse to the XZ plane and move the preview mesh there
function placementRaycast(clientX, clientY){
  if(!placementMode.raycaster||!placementMode.planeHelper||!renderer) return null;
  var rect=renderer.domElement.getBoundingClientRect();
  var mouse=new THREE.Vector2(
    ((clientX-rect.left)/rect.width)*2-1,
    -((clientY-rect.top)/rect.height)*2+1
  );
  placementMode.raycaster.setFromCamera(mouse,camera);
  var hits=placementMode.raycaster.intersectObject(placementMode.planeHelper);
  return hits.length>0 ? hits[0].point : null;
}

function movePlacedTerrain(clientX, clientY){
  if(!placementMode.active||!placementMode.mesh) return;
  var pt=placementRaycast(clientX,clientY);
  if(!pt) return;
  var hw=getHalfWorld();
  // Clamp to map bounds
  var nx=Math.max(-hw,Math.min(hw,pt.x));
  var nz=Math.max(-hw,Math.min(hw,pt.z));
  placementMode.zone.x=parseFloat((nx/hw).toFixed(3));
  placementMode.zone.y=parseFloat((nz/hw).toFixed(3));
  placementMode.mesh.position.set(nx,0,nz);
  updatePlacementHUD();
  // Sync sliders in the zone row (if already rendered for re-position flow)
  var row=document.getElementById('impz-'+placementMode.zone.id);
  if(row){
    var xi=row.querySelector('.impz-x'), yi=row.querySelector('.impz-y');
    var xv=row.querySelector('.impz-xv'), yv=row.querySelector('.impz-yv');
    if(xi) xi.value=placementMode.zone.x;
    if(yi) yi.value=placementMode.zone.y;
    if(xv) xv.textContent=placementMode.zone.x.toFixed(2)+' ('+nx.toFixed(1)+'u)';
    if(yv) yv.textContent=placementMode.zone.y.toFixed(2)+' ('+nz.toFixed(1)+'u)';
  }
}

// ENTER placement mode — called after baking a new import
function enterPlacementMode(zone, isReposition){
  if(!scene){
    // Scene not ready — fall back to old behaviour
    if(!isReposition){ STATE.importedTerrains.push(zone); renderImportedZoneRow(zone); }
    updateImportedCountBadge();
    toast('Terrain Added','"'+zone.name+'" added. Adjust X/Y sliders and click Generate.');
    return;
  }
  if(placementMode.active) exitPlacementMode(false);

  placementMode.active=true;
  placementMode.zone=zone;
  placementMode.dragging=false;
  placementMode.isReposition=!!isReposition;

  // Build and show preview mesh
  var grp=buildImportPreviewMesh(zone);
  var hw=getHalfWorld();
  grp.position.set((zone.x||0)*hw, 0, (zone.y||0)*hw);
  scene.add(grp);
  placementMode.mesh=grp;

  // Invisible plane at y=avgTerrain for raycasting
  var rayY=0;
  if(heightCache){
    var sum=0; var n=Math.min(100,heightCache.hmap.length);
    for(var k=0;k<n;k++) sum+=heightCache.hmap[k]; rayY=sum/n;
  }
  var plGeo=new THREE.PlaneGeometry(4000,4000);
  plGeo.rotateX(-Math.PI/2);
  var plMat=new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide});
  placementMode.planeHelper=new THREE.Mesh(plGeo,plMat);
  placementMode.planeHelper.position.y=rayY;
  scene.add(placementMode.planeHelper);
  placementMode.raycaster=new THREE.Raycaster();

  // Show placement HUD
  var hud=document.getElementById('import-placement-hud');
  if(hud){
    var nm=document.getElementById('iph-name'); if(nm) nm.textContent=zone.name;
    var sz=document.getElementById('iph-size');
    if(sz) sz.textContent=zone.worldSize.toFixed(1)+'u × '+zone.worldSize.toFixed(1)+'u';
    // Restore scale/mapArea sliders
    var scSl=document.getElementById('iph-scale');
    var scVl=document.getElementById('iph-scale-v');
    var maSl=document.getElementById('iph-maparea');
    var maVl=document.getElementById('iph-maparea-v');
    if(scSl){ scSl.value=zone.impScale||1; }
    if(scVl){ var sv=zone.impScale||1; scVl.textContent=sv.toFixed(2).replace(/\.?0+$/,'')+'×'; }
    if(maSl){ maSl.value=zone.impMapArea||1; }
    if(maVl){ maVl.textContent=((zone.impMapArea||1).toFixed(1))+'×'; }
    var fsl=document.getElementById('iph-feather');
    var fvl=document.getElementById('iph-feather-v');
    if(fsl){ fsl.value=zone.feather||0.1; }
    if(fvl){ fvl.textContent=Math.round((zone.feather||0.1)*100)+'%'; }
    updatePlacementHUD();
    hud.classList.add('open');
  }

  // Apply initial scale to the preview mesh
  updatePlacementPreviewScale();

  // Collapse the bottom UI so viewport is fully visible
  var uiPanel=document.getElementById('terrain-ui');
  if(uiPanel) uiPanel.classList.add('collapsed');
  document.body.style.cursor='crosshair';
}

// EXIT placement mode — confirmed = place it, else cancel
function exitPlacementMode(confirmed){
  if(!placementMode.active) return;

  var zone=placementMode.zone;
  var isRepos=placementMode.isReposition;

  // Cleanup 3D preview objects
  if(placementMode.mesh){ scene.remove(placementMode.mesh); placementMode.mesh=null; }
  if(placementMode.planeHelper){ scene.remove(placementMode.planeHelper); placementMode.planeHelper=null; }

  placementMode.active=false;
  placementMode.dragging=false;
  placementMode.zone=null;
  placementMode.isReposition=false;

  var hud=document.getElementById('import-placement-hud');
  if(hud) hud.classList.remove('open');

  var uiPanel=document.getElementById('terrain-ui');
  if(uiPanel) uiPanel.classList.remove('collapsed');
  document.body.style.cursor='';
  document.body.classList.remove('placement-drag');

  if(confirmed && zone){
    if(!isRepos){
      // First-time placement: add to state and render the row
      STATE.importedTerrains.push(zone);
      updateImportedCountBadge();
      renderImportedZoneRow(zone);
    } else {
      // Re-position: just update the existing row's sliders
      syncImportedZoneRow(zone);
    }
    var hw=getHalfWorld();
    var wx=(zone.x||0)*hw, wz=(zone.y||0)*hw;
    toast('Terrain Placed','"'+zone.name+'" placed at X:'+wx.toFixed(1)+'u, Z:'+wz.toFixed(1)+'u. Generating world…');
    generate();
  } else {
    // Cancelled — discard the temporary zone (if new import)
    if(!isRepos && zone){
      STATE.importedTerrains=STATE.importedTerrains.filter(function(z){return z.id!==zone.id;});
      updateImportedCountBadge();
    }
    toast('Import Cancelled','Terrain placement discarded.');
  }
}

// Re-enter placement mode for an already-confirmed zone (from the "Move" button)
function reenterPlacementMode(zone){
  enterPlacementMode(zone,true);
}

// Update sliders in an existing rendered zone row
function syncImportedZoneRow(zone){
  var row=document.getElementById('impz-'+zone.id); if(!row) return;
  var hw=getHalfWorld();
  var wx=(zone.x||0)*hw, wz=(zone.y||0)*hw;
  var xi=row.querySelector('.impz-x'), yi=row.querySelector('.impz-y');
  var xv=row.querySelector('.impz-xv'), yv=row.querySelector('.impz-yv');
  var sci=row.querySelector('.impz-sc'), scv=row.querySelector('.impz-scv');
  var mai=row.querySelector('.impz-ma'), mav=row.querySelector('.impz-mav');
  var esEl=row.querySelector('.impz-effsize');
  if(xi) xi.value=zone.x;
  if(yi) yi.value=zone.y;
  if(xv) xv.textContent=zone.x.toFixed(2)+' ('+wx.toFixed(1)+'u)';
  if(yv) yv.textContent=zone.y.toFixed(2)+' ('+wz.toFixed(1)+'u)';
  if(sci) sci.value=zone.impScale||1;
  if(scv) scv.textContent=(zone.impScale||1).toFixed(2).replace(/\.?0+$/,'')+'×';
  if(mai) mai.value=zone.impMapArea||1;
  if(mav) mav.textContent=(zone.impMapArea||1).toFixed(1)+'×';
  if(esEl){ var es=zone.worldSize*(zone.impScale||1)*(zone.impMapArea||1); esEl.textContent=es.toFixed(1)+'u'; }
  var wp=row.querySelector('.impz-world-pos');
  if(wp) wp.textContent='X '+wx.toFixed(1)+'u  Z '+wz.toFixed(1)+'u';
}

// Scale the preview mesh XZ to reflect impScale * impMapArea (heights stay fixed)
function updatePlacementPreviewScale(){
  if(!placementMode.mesh||!placementMode.zone) return;
  var eff=(placementMode.zone.impScale||1.0)*(placementMode.zone.impMapArea||1.0);
  placementMode.mesh.scale.set(eff,1,eff);
  // Refresh the effective-size readout in the HUD
  var effSize=placementMode.zone.worldSize*eff;
  var esEl=document.getElementById('iph-effsize');
  if(esEl) esEl.textContent=effSize.toFixed(1)+'u × '+effSize.toFixed(1)+'u';
  updatePlacementHUD();
}

// Wire up the placement HUD buttons (called once on DOM ready)
function initPlacementHUD(){
  var confirm=document.getElementById('iph-confirm');
  var cancel=document.getElementById('iph-cancel');
  var featherSlider=document.getElementById('iph-feather');
  var featherVal=document.getElementById('iph-feather-v');
  var scaleSlider=document.getElementById('iph-scale');
  var scaleVal=document.getElementById('iph-scale-v');
  var mapAreaSlider=document.getElementById('iph-maparea');
  var mapAreaVal=document.getElementById('iph-maparea-v');

  if(confirm) confirm.addEventListener('click',function(){ exitPlacementMode(true); });
  if(cancel)  cancel.addEventListener('click',function(){ exitPlacementMode(false); });

  if(featherSlider){
    featherSlider.addEventListener('input',function(e){
      var v=parseFloat(e.target.value);
      if(placementMode.zone) placementMode.zone.feather=v;
      if(featherVal) featherVal.textContent=Math.round(v*100)+'%';
    });
  }
  if(scaleSlider){
    scaleSlider.addEventListener('input',function(e){
      var v=parseFloat(e.target.value);
      if(placementMode.zone) placementMode.zone.impScale=v;
      if(scaleVal) scaleVal.textContent=v.toFixed(2).replace(/\.?0+$/,'')+'×';
      updatePlacementPreviewScale();
    });
  }
  if(mapAreaSlider){
    mapAreaSlider.addEventListener('input',function(e){
      var v=parseFloat(e.target.value);
      if(placementMode.zone) placementMode.zone.impMapArea=v;
      if(mapAreaVal) mapAreaVal.textContent=v.toFixed(1)+'×';
      updatePlacementPreviewScale();
    });
  }
  // Escape key cancels placement; Enter confirms
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape' && placementMode.active) exitPlacementMode(false);
    if(e.key==='Enter' && placementMode.active){ e.preventDefault(); exitPlacementMode(true); }
  });
}

function openImportModal(){
  $('import-modal').classList.add('open');
  loadImportableMaps();
}
function hideImportModal(){ $('import-modal').classList.remove('open'); }

function loadImportableMaps(){
  var list=$('import-list');
  if(!list) return;
  list.innerHTML='<div style="text-align:center;padding:20px;color:var(--t3);font-family:var(--fm);font-size:11px">Loading…</div>';
  getAllMaps(function(maps){
    var saved = maps.slice();
    saved.sort(function(a,b){return (b.updatedAt||0)-(a.updatedAt||0);});
    list.innerHTML='';
    if(!saved.length){
      list.innerHTML='<div style="text-align:center;padding:26px 10px;color:var(--t3);font-family:var(--fd);font-size:10.5px;line-height:1.7">No saved maps yet.<br>Save a map first, then come back here to import it.</div>';
      return;
    }
    var atLimit = STATE.importedTerrains.length>=IMPORT_LIMIT;
    saved.forEach(function(proj){
      var row=document.createElement('div');
      row.className='imp-row';
      var eq=(proj.state&&proj.state.eq)||'—';
      var eqShort=eq.length>34?eq.slice(0,32)+'…':eq;
      var thumb=proj.thumbnail||'';
      var already = STATE.importedTerrains.some(function(z){return z.sourceId===proj.id;});
      var disabled = already || atLimit;
      var lbl = already ? 'Imported' : (atLimit ? 'Limit Reached' : 'Import');
      row.innerHTML=
        '<div class="imp-thumb">'+(thumb?'<img src="'+thumb+'" alt="">':'<div class="imp-thumb-ph">🗺️</div>')+'</div>'+
        '<div class="imp-info">'+
          '<div class="imp-name">'+escH(proj.name)+'</div>'+
          '<div class="imp-meta">Seed '+((proj.state&&proj.state.seed)!=null?proj.state.seed:'—')+' &middot; '+escH(eqShort)+'</div>'+
        '</div>'+
        '<button class="btn sm '+(disabled?'':'am')+' imp-pick"'+(disabled?' disabled style="opacity:.4;cursor:not-allowed"':'')+'>'+lbl+'</button>';
      if(!disabled){
        row.querySelector('.imp-pick').addEventListener('click',function(){
          importSavedMap(proj);
        });
      }
      list.appendChild(row);
    });
  });
}

function importSavedMap(proj){
  if(STATE.importedTerrains.length >= IMPORT_LIMIT){
    toast('Import Limit Reached','You can import up to '+IMPORT_LIMIT+' terrains. Remove one to import another.');
    return;
  }
  hideImportModal();
  // Brief delay to let the modal close animation play before the heavy bake
  setTimeout(function(){
    try{
      toast('Baking Terrain…','Reconstructing "'+proj.name+'" at its exact original size…');
      var baked = bakeImportedHeightmap(proj.state||{});
      var n = STATE.importedTerrains.length;
      var angle = n*(Math.PI*2/5);
      var dist = n>0 ? 0.32 : 0;
      var zone = {
        id:'imp'+(++importN),
        sourceId:proj.id,
        name:proj.name,
        seed:(proj.state&&proj.state.seed)!=null?proj.state.seed:0,
        x: parseFloat((dist*Math.cos(angle)).toFixed(2)),
        y: parseFloat((dist*Math.sin(angle)).toFixed(2)),
        feather:0.1,
        impScale:1.0,
        impMapArea:1.0,
        on:true,
        hmap:baked.hmap, gridRes:baked.GRID, s:baked.s,
        worldSize:baked.worldSize, seaLevel:baked.seaLevel,
        waterAlpha:(proj.state&&proj.state.wAlpha!=null)?proj.state.wAlpha:0.6,
        waterColor:(proj.state&&proj.state.colors&&proj.state.colors.shallow)||'#3d8fd4'
      };
      // ── NEW: Enter Blender-style interactive placement ───────────
      // The zone is NOT added to STATE.importedTerrains yet.
      // enterPlacementMode shows the 3D preview and lets the user drag.
      // exitPlacementMode(true) = confirm → adds zone + generates.
      enterPlacementMode(zone, false);
    }catch(e){
      toast('Import Failed', e.message||String(e));
    }
  }, 80);
}

function renderImportedZoneRow(zone){
  var con=$('rgn-con');
  if(!con) return;
  var empty=con.querySelector('.rgn-empty');
  if(empty) empty.remove();

  var row=document.createElement('div');
  row.className='rgn-row imp-zone-row';
  row.id='impz-'+zone.id;

  var hw=getHalfWorld();
  var wx=(zone.x||0)*hw, wz=(zone.y||0)*hw;
  var impSc=zone.impScale||1.0, impMa=zone.impMapArea||1.0;
  var effSize=zone.worldSize*impSc*impMa;

  row.innerHTML=
    '<div class="rgn-row-head">'+
      '<span class="rgn-idx" style="color:var(--go)">IMP</span>'+
      '<div class="tog on" id="impt-'+zone.id+'" style="cursor:pointer;flex-shrink:0" title="Enable/disable imported terrain"></div>'+
      '<span style="flex:1;font-family:var(--fd);font-size:9.5px;font-weight:600;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escH(zone.name)+'</span>'+
      '<span class="impz-world-pos" title="World position">X '+wx.toFixed(1)+'u  Z '+wz.toFixed(1)+'u</span>'+
      '<button class="impz-move" title="Re-enter placement mode to reposition this terrain">'+
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>'+
        'Move'+
      '</button>'+
      '<button class="btn sm er impz-del" style="padding:4px 7px;flex-shrink:0">'+
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'+
      '</button>'+
    '</div>'+
    '<div class="rgn-row-sliders">'+
      '<div class="rgn-sl"><span class="slbl">X Pos</span><input type="range" class="impz-x" min="-1" max="1" step="0.01" value="'+zone.x+'"><span class="svs impz-xv">'+zone.x.toFixed(2)+' ('+wx.toFixed(1)+'u)</span></div>'+
      '<div class="rgn-sl"><span class="slbl">Z Pos</span><input type="range" class="impz-y" min="-1" max="1" step="0.01" value="'+zone.y+'"><span class="svs impz-yv">'+zone.y.toFixed(2)+' ('+wz.toFixed(1)+'u)</span></div>'+
      '<div class="rgn-sl"><span class="slbl">Scale</span><input type="range" class="impz-sc" min="0.25" max="2" step="0.25" value="'+impSc+'"><span class="svs impz-scv">'+impSc.toFixed(2).replace(/\.?0+$/,'')+'×</span></div>'+
      '<div class="rgn-sl"><span class="slbl">Map Area</span><input type="range" class="impz-ma" min="1" max="4" step="0.5" value="'+impMa+'"><span class="svs impz-mav">'+impMa.toFixed(1)+'×</span></div>'+
      '<div class="rgn-sl"><span class="slbl">Blend</span><input type="range" class="impz-f" min="0.02" max="0.4" step="0.02" value="'+zone.feather+'"><span class="svs impz-fv">'+Math.round(zone.feather*100)+'%</span></div>'+
      '<div class="rgn-sl"><span class="slbl" style="color:var(--t3)">Eff. Size</span><span class="svs impz-effsize" style="color:var(--go)">'+effSize.toFixed(1)+'u</span></div>'+
    '</div>';

  // Toggle enable/disable
  var togEl=row.querySelector('#impt-'+zone.id);
  togEl.addEventListener('click',function(){
    zone.on=!zone.on;
    togEl.classList.toggle('on',zone.on);
  });

  // X slider — shows both fraction and world units
  row.querySelector('.impz-x').addEventListener('input',function(e){
    zone.x=parseFloat(e.target.value);
    var wu=(zone.x*getHalfWorld()).toFixed(1);
    row.querySelector('.impz-xv').textContent=zone.x.toFixed(2)+' ('+wu+'u)';
    row.querySelector('.impz-world-pos').textContent='X '+wu+'u  Z '+((zone.y||0)*getHalfWorld()).toFixed(1)+'u';
  });

  // Z slider (displayed as Y internally, Z in world)
  row.querySelector('.impz-y').addEventListener('input',function(e){
    zone.y=parseFloat(e.target.value);
    var wu=(zone.y*getHalfWorld()).toFixed(1);
    row.querySelector('.impz-yv').textContent=zone.y.toFixed(2)+' ('+wu+'u)';
    row.querySelector('.impz-world-pos').textContent='X '+((zone.x||0)*getHalfWorld()).toFixed(1)+'u  Z '+wu+'u';
  });

  // Feather/blend slider — shows as percentage
  row.querySelector('.impz-f').addEventListener('input',function(e){
    zone.feather=parseFloat(e.target.value);
    row.querySelector('.impz-fv').textContent=Math.round(zone.feather*100)+'%';
  });

  // Scale slider — 0.25x to 2x; updates effective size display
  row.querySelector('.impz-sc').addEventListener('input',function(e){
    zone.impScale=parseFloat(e.target.value);
    row.querySelector('.impz-scv').textContent=zone.impScale.toFixed(2).replace(/\.?0+$/,'')+'×';
    var es=zone.worldSize*(zone.impScale||1)*(zone.impMapArea||1);
    row.querySelector('.impz-effsize').textContent=es.toFixed(1)+'u';
  });

  // Map Area slider — 1x to 4x; updates effective size display
  row.querySelector('.impz-ma').addEventListener('input',function(e){
    zone.impMapArea=parseFloat(e.target.value);
    row.querySelector('.impz-mav').textContent=zone.impMapArea.toFixed(1)+'×';
    var es=zone.worldSize*(zone.impScale||1)*(zone.impMapArea||1);
    row.querySelector('.impz-effsize').textContent=es.toFixed(1)+'u';
  });

  // Move button — re-enters Blender-style placement mode
  row.querySelector('.impz-move').addEventListener('click',function(){
    reenterPlacementMode(zone);
  });

  // Delete
  row.querySelector('.impz-del').addEventListener('click',function(){
    STATE.importedTerrains=STATE.importedTerrains.filter(function(z){return z.id!==zone.id;});
    row.remove();
    updateImportedCountBadge();
    if(!STATE.regions.length && !STATE.importedTerrains.length){
      var c=$('rgn-con');
      if(c) c.innerHTML='<div class="rgn-empty">No zones yet — add or import one below</div>';
    }
  });

  con.appendChild(row);
}

function updateImportedCountBadge(){
  var b=$('imp-count-badge');
  if(b) b.textContent=STATE.importedTerrains.length+'/'+IMPORT_LIMIT;
  var btn=$('btn-import-terrain');
  if(btn){
    var atLimit=STATE.importedTerrains.length>=IMPORT_LIMIT;
    btn.style.opacity=atLimit?'.55':'';
  }
}

