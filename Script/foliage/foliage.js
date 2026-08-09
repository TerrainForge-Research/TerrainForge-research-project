var treeCount=0, rockCount=0;
var treeLODList=[]; // every THREE.LOD tree instance — updated each frame by distance to camera


var _treeGeoFull=null, _treeGeoMed=null, _billboardTex=null;
var biomeTreeMats=null, biomeSpriteMats=null;
function buildTreeBillboardTexture(){
  var cv=document.createElement('canvas'); cv.width=64; cv.height=96;
  var ctx=cv.getContext('2d');
  ctx.fillStyle='#503423';
  ctx.fillRect(28,72,8,22); // trunk
  ctx.fillStyle='#ffffff';  // white so SpriteMaterial.color can tint per-biome
  function tri(cx,cy,w,h){ ctx.beginPath(); ctx.moveTo(cx,cy-h); ctx.lineTo(cx-w/2,cy); ctx.lineTo(cx+w/2,cy); ctx.closePath(); ctx.fill(); }
  tri(32,42,46,32); tri(32,58,38,26); tri(32,74,30,20); // layered conifer silhouette
  var tex=new THREE.CanvasTexture(cv);
  tex.needsUpdate=true;
  return tex;
}
function ensureTreeAssets(){
  if(_treeGeoFull) return;
  _treeGeoFull=buildTreeGeo();                      // ConeGeometry(0.7,2,7) — full detail
  _treeGeoMed =new THREE.ConeGeometry(0.75,1.9,4);   // low-poly "pyramid" tree
  _billboardTex=buildTreeBillboardTexture();
  biomeTreeMats={
    forest: new THREE.MeshLambertMaterial({color:linHex(0x2d6b24)}),
    taiga:  new THREE.MeshLambertMaterial({color:linHex(0x234d46)}),
    arid:   new THREE.MeshLambertMaterial({color:linHex(0x9a9450)}),
    rain:   new THREE.MeshLambertMaterial({color:linHex(0x0f4420)})
  };
  biomeSpriteMats={
    forest: new THREE.SpriteMaterial({map:_billboardTex,color:linHex(0x4a9e3f),transparent:true,depthWrite:false}),
    taiga:  new THREE.SpriteMaterial({map:_billboardTex,color:linHex(0x3a7a6e),transparent:true,depthWrite:false}),
    arid:   new THREE.SpriteMaterial({map:_billboardTex,color:linHex(0xc2bd66),transparent:true,depthWrite:false}),
    rain:   new THREE.SpriteMaterial({map:_billboardTex,color:linHex(0x18632c),transparent:true,depthWrite:false})
  };
}
function pickTreeBiomeKey(moisture,temperature){
  if(temperature<0.35) return 'taiga';
  if(temperature>0.72) return moisture>0.55?'rain':'arid';
  return moisture<0.32?'arid':'forest';
}
function updateTreeLODs(){
  if(!treeLODList.length) return;
  for(var i=0;i<treeLODList.length;i++) treeLODList[i].update(camera);
}
setInterval(function(){
  var el=$('s-treelod'); if(!el) return;
  if(!STATE.treeLODEnabled || !treeLODList.length){ el.textContent='—'; return; }
  var full=0,low=0,spr=0;
  for(var i=0;i<treeLODList.length;i++){
    var lvl=treeLODList[i].getCurrentLevel?treeLODList[i].getCurrentLevel():0;
    if(lvl===0) full++; else if(lvl===1) low++; else spr++;
  }
  el.textContent=full+' full · '+low+' low-poly · '+spr+' billboard';
},700);

function spawnFoliage(data, slopes){
  // Clear old
  while(mkGrp.children.length) mkGrp.remove(mkGrp.children[0]);
  treeCount=0; rockCount=0;
  treeLODList.length=0;
  ensureTreeAssets();

  var hmap=data.hmap, GRID=data.GRID, s=data.s;
  var res=GRID-1;
  var meshScale=(STATE.scale||1.0)*(STATE.mapArea||1.0);
  var sScaled=s*meshScale; // world units per grid cell
  var zRng=zMax-zMin||1;
  var seaN=(STATE.seaLevel-zMin)/zRng;
  var flo=STATE.forestLo+seaN, fhi=STATE.forestHi, sn2=STATE.snowLine;
  var ms=STATE.maxSlope;
  var td=STATE.treeDensity, rd=STATE.rockDensity;

  // Poisson-disc-like sampling: just use a grid with jitter
  var spacing=SURF*meshScale/Math.max(1,Math.round(22*td));
  var rspacing=SURF*meshScale/Math.max(1,Math.round(14*rd));

  // Tree geometry — shared full/medium LOD geometries + biome-tinted materials
  var treeGeoFull=_treeGeoFull, treeGeoMed=_treeGeoMed;

  // Rock geometry
  var rockGeo=buildRockGeo();
  var rockMat=new THREE.MeshLambertMaterial({color:linHex(0x8a7d6e)});

  function sampleH(wx,wy){
    var i=Math.round(wx/sScaled + res/2);
    var j=Math.round(wy/sScaled + res/2);
    i=Math.max(0,Math.min(GRID-1,i));
    j=Math.max(0,Math.min(GRID-1,j));
    return hmap[j*GRID+i];
  }
  function sampleSlope(wx,wy){
    var i=Math.max(1,Math.min(GRID-2,Math.round(wx/sScaled + res/2)));
    var j=Math.max(1,Math.min(GRID-2,Math.round(wy/sScaled + res/2)));
    var idx=j*GRID+i;
    var dx=hmap[idx+1]-hmap[idx-1];
    var dz=hmap[idx+GRID]-hmap[idx-GRID];
    return Math.sqrt(dx*dx+dz*dz)/(sScaled*2);
  }

  var rng = lcg(STATE.seed+777);

  // Trees — climate-aware density + Level-of-Detail rendering
  var half=SURF*meshScale*0.48;
  var useClimateFoliage = STATE.climateOn && data.moisture && data.temperature;
  var lodNearDist = 9  * meshScale * (STATE.treeLodNearMult||1.0);
  var lodFarDist  = 26 * meshScale * (STATE.treeLodFarMult ||1.0);
  if(lodFarDist<=lodNearDist) lodFarDist=lodNearDist+1;
  for(var wx=-half;wx<half;wx+=spacing){
    for(var wy=-half;wy<half;wy+=spacing){
      var jx=(rng()-0.5)*spacing*0.8;
      var jy=(rng()-0.5)*spacing*0.8;
      var sx=wx+jx, sy=wy+jy;
      var h=sampleH(sx,sy);
      var hn=(h-zMin)/zRng;
      var sl=sampleSlope(sx,sy);
      if(hn<flo||hn>fhi||sl>ms||hn<seaN+0.02) continue;

      var matKey='forest', biomeDensity=1.0;
      if(useClimateFoliage){
        var ci=Math.max(0,Math.min(GRID-1,Math.round(sx/sScaled+res/2)));
        var cj=Math.max(0,Math.min(GRID-1,Math.round(sy/sScaled+res/2)));
        var cidx=cj*GRID+ci;
        var mClim=data.moisture[cidx], tClim=data.temperature[cidx];
        matKey=pickTreeBiomeKey(mClim,tClim);
        // Wetter, temperate cells grow denser canopy; hot/dry or very cold cells thin out
        biomeDensity=Math.max(0.04, mClim*0.75 + (1-Math.abs(tClim-0.55)*1.3)*0.35);
      }
      if(rng()>td*biomeDensity) continue;

      var sc=0.18+rng()*0.22;
      var rotY=rng()*Math.PI*2;

      if(STATE.treeLODEnabled){
        var lod=new THREE.LOD();
        var mFull=new THREE.Mesh(treeGeoFull, biomeTreeMats[matKey]);
        mFull.rotation.y=rotY;
        mFull.receiveShadow=true;
        var mMed=new THREE.Mesh(treeGeoMed, biomeTreeMats[matKey]);
        mMed.rotation.y=rotY;
        mMed.receiveShadow=true;
        var sprite=new THREE.Sprite(biomeSpriteMats[matKey]);
        sprite.scale.set(2.4,3.6,1);
        sprite.position.y=1.0;
        lod.addLevel(mFull,0);
        lod.addLevel(mMed,lodNearDist);
        lod.addLevel(sprite,lodFarDist);
        lod.scale.setScalar(sc);
        lod.position.set(sx,h,sy);
        mkGrp.add(lod);
        treeLODList.push(lod);
      } else {
        var tree=new THREE.Mesh(treeGeoFull,biomeTreeMats[matKey]);
        tree.scale.setScalar(sc);
        tree.position.set(sx,h,sy);
        tree.rotation.y=rotY;
        tree.castShadow=false;
        tree.receiveShadow=true;
        mkGrp.add(tree);
      }
      treeCount++;
      if(treeCount>350) break;
    }
    if(treeCount>350) break;
  }

  // Rocks
  for(var wx=-half;wx<half;wx+=rspacing){
    for(var wy=-half;wy<half;wy+=rspacing){
      var jx=(rng()-0.5)*rspacing*0.9;
      var jy=(rng()-0.5)*rspacing*0.9;
      var sx=wx+jx, sy=wy+jy;
      var h=sampleH(sx,sy);
      var hn=(h-zMin)/zRng;
      var sl=sampleSlope(sx,sy);
      if(hn<seaN+0.02||hn>sn2*1.05) continue;
      if(sl<0.3&&rng()>rd*0.5) continue;
      if(rng()>rd*0.7) continue;
      var scx=0.1+rng()*0.18;
      var scy=0.07+rng()*0.14;
      var rock=new THREE.Mesh(rockGeo,rockMat);
      rock.scale.set(scx,scy,scx*(0.8+rng()*0.4));
      rock.position.set(sx,h-scx*0.2,sy);
      rock.rotation.y=rng()*Math.PI*2;
      rock.castShadow=false;
      rock.receiveShadow=true;
      mkGrp.add(rock);
      rockCount++;
      if(rockCount>100) break;
    }
    if(rockCount>100) break;
  }
  $('s-trees').textContent=treeCount;
  $('s-rocks').textContent=rockCount;
}

// Simple LCG RNG
function lcg(seed){
  var s=seed>>>0;
  return function(){
    s=(s*1664525+1013904223)>>>0;
    return s/4294967296;
  };
}

function buildTreeGeo(){
  var g=new THREE.ConeGeometry(0.7,2,7);
  return g;
}
function buildRockGeo(){
  return new THREE.DodecahedronGeometry(1,0);
}

// ── MAIN GENERATE FUNCTION ───────────────────────────────────────
var LOD_TIERS={
  low:    {tris:10000,  label:'Low'},
  medium: {tris:50000,  label:'Medium'},
  high:   {tris:100000, label:'High'},
  ultra:  {tris:400000, label:'Ultra'}
};


