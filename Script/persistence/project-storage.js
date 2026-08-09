function buildMapCode(){
  return btoa(JSON.stringify({
    v:3, // recipe format version
    eq:STATE.eq, seed:STATE.seed, scale:STATE.scale, amp:STATE.amp,
    oct:STATE.oct, rough:STATE.rough, res:STATE.res, mapArea:STATE.mapArea,
    seaLevel:STATE.seaLevel,
    erosion:STATE.erosion, erosionType:STATE.erosionType,
    droplets:STATE.droplets, inertia:STATE.inertia, eroRate:STATE.eroRate,
    depRate:STATE.depRate, evap:STATE.evap,
    talusAngle:STATE.talusAngle, thermIters:STATE.thermIters,
    riverOn:STATE.riverOn, riverDepth:STATE.riverDepth, riverWarp:STATE.riverWarp,
    riverGenThresh:STATE.riverGenThresh, riverCarveDepth:STATE.riverCarveDepth,
    riverCarveWidth:STATE.riverCarveWidth, riverCarveOn:STATE.riverCarveOn,
    snowLine:STATE.snowLine, forestLo:STATE.forestLo, forestHi:STATE.forestHi,
    maxSlope:STATE.maxSlope, cBlend:STATE.cBlend, beachW:STATE.beachW,
    treeDensity:STATE.treeDensity, rockDensity:STATE.rockDensity,
    climateOn:STATE.climateOn, moistureScale:STATE.moistureScale, tempScale:STATE.tempScale,
    tempLapse:STATE.tempLapse, coastalMoistureBoost:STATE.coastalMoistureBoost,
    treeLODEnabled:STATE.treeLODEnabled, treeLodNearMult:STATE.treeLodNearMult, treeLodFarMult:STATE.treeLodFarMult,
    colors:STATE.colors, regions:STATE.regions,
    layers:STATE.layers.map(function(l){return{eq:l.eq,blend:l.blend,op:l.op,on:l.on};})
  }));
}
function loadMapCode(code){
  try{
    var s=JSON.parse(atob(code));
    var simple=['eq','seed','scale','amp','oct','rough','res','mapArea','seaLevel',
      'erosion','erosionType','droplets','inertia','eroRate','depRate','evap',
      'talusAngle','thermIters','riverOn','riverDepth','riverWarp','riverGenThresh',
      'riverCarveDepth','riverCarveWidth','riverCarveOn','snowLine','forestLo',
      'forestHi','maxSlope','cBlend','beachW','treeDensity','rockDensity','regions',
      'climateOn','moistureScale','tempScale','tempLapse','coastalMoistureBoost',
      'treeLODEnabled','treeLodNearMult','treeLodFarMult'];
    simple.forEach(function(k){ if(s[k]!==undefined && s[k]!==null) STATE[k]=s[k]; });
    if(s.colors) STATE.colors=Object.assign(STATE.colors,s.colors);
    if(s.layers){
      $('lay-con').innerHTML=''; STATE.layers=[];
      s.layers.forEach(function(l){ addLayer(l.eq,l.blend,l.op,l.on); });
      renumLayers();
    }
    // A loaded recipe can have a totally different mapArea/scale — re-fit the
    // camera to the new world size instead of keeping the previous framing
    // (otherwise an 8x map loads correctly but the camera still sees it at 1x).
    orb._hasInitCamera=false;
    orb.tx=0; orb.ty=0; orb.tz=0;
    syncAllUI();
    generate();
    return true;
  }catch(e){return false;}
}

// ── FORK / REMIX ─────────────────────────────────────────────────
// Keeps the entire world recipe (equation, erosion, rivers, biomes,
// colors, layers) but rolls a fresh seed — a "variant" of this world.
function forkWorld(){
  var oldSeed=STATE.seed;
  STATE.seed=Math.floor(Math.random()*1e9);
  $('seed-in').value=STATE.seed;
  generate();
  var code=buildMapCode();
  navigator.clipboard.writeText(code).then(function(){
    toast('Forked!','New variant (seed '+STATE.seed+', from '+oldSeed+'). Map code copied — share to let others remix it too.');
  }).catch(function(){
    toast('Forked!','New variant (seed '+STATE.seed+', from '+oldSeed+'). Use Copy Code to share it.');
  });
}
var IDB=null;
var DB_NAME='TerrainForgeDB', DB_VER=1, DB_STORE='maps';
var currentProjId=null;

function openDB(cb){
  if(IDB){cb(IDB);return;}
  var req=indexedDB.open(DB_NAME,DB_VER);
  req.onupgradeneeded=function(e){
    var db=e.target.result;
    if(!db.objectStoreNames.contains(DB_STORE))
      db.createObjectStore(DB_STORE,{keyPath:'id',autoIncrement:true});
  };
  req.onsuccess=function(e){IDB=e.target.result;cb(IDB);};
  req.onerror=function(e){console.error('IDB',e);};
}
function getAllMaps(cb){
  openDB(function(db){
    var req=db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).getAll();
    req.onsuccess=function(e){cb(e.target.result||[]);};
    req.onerror=function(){cb([]);};
  });
}
function getMapById(id,cb){
  openDB(function(db){
    var req=db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).get(id);
    req.onsuccess=function(e){cb(e.target.result||null);};
    req.onerror=function(){cb(null);};
  });
}
function saveMapDB(proj,cb){
  openDB(function(db){
    var req=db.transaction(DB_STORE,'readwrite').objectStore(DB_STORE).put(proj);
    req.onsuccess=function(e){cb&&cb(e.target.result);};
    req.onerror=function(e){console.error('Save',e);};
  });
}
function deleteMapDB(id,cb){
  openDB(function(db){
    var req=db.transaction(DB_STORE,'readwrite').objectStore(DB_STORE).delete(id);
    req.onsuccess=function(){cb&&cb();};
    req.onerror=function(e){console.error('Del',e);};
  });
}

function captureThumb(){
  try{
    var th=document.createElement('canvas');th.width=320;th.height=180;
    renderer.render(scene,camera);
    th.getContext('2d').drawImage(renderer.domElement,0,0,320,180);
    return th.toDataURL('image/jpeg',0.78);
  }catch(e){return '';}
}
function captureState(){
  // Float32Array heightmaps inside importedTerrains don't survive a plain
  // JSON round-trip cleanly — strip them out for the blanket clone, then
  // serialise them properly by hand.
  var savedImports = STATE.importedTerrains;
  STATE.importedTerrains = [];
  var s=JSON.parse(JSON.stringify(STATE));
  STATE.importedTerrains = savedImports;
  s.importedTerrains = (savedImports||[]).map(function(z){
    return {
      id:z.id, sourceId:z.sourceId, name:z.name, seed:z.seed,
      x:z.x, y:z.y, feather:z.feather, on:z.on,
      gridRes:z.gridRes, s:z.s, worldSize:z.worldSize, seaLevel:z.seaLevel,
      waterAlpha:z.waterAlpha, waterColor:z.waterColor,
      hmap: Array.from(z.hmap)
    };
  });
  s._anim=animCaptureData();
  return s;
}
function restoreState(st){
  if(!st) return;
  var animData=st._anim; // extract before assign
  var importsData=st.importedTerrains; // extract before assign — needs custom hydration (Float32Array)
  Object.assign(STATE,st);
  STATE.mapArea = st.mapArea || 1.0;
  // Reset camera so it fits the restored terrain
  orb._hasInitCamera=false;
  orb.tx=0; orb.ty=0; orb.tz=0;
  syncAllUI();
  // Restore layers
  $('lay-con').innerHTML='';STATE.layers=[];
  if(st.layers&&st.layers.length){
    st.layers.forEach(function(l){addLayer(l.eq,l.blend,l.op,l.on);});
  }
  // Restore regions + imported terrains (share the same zones list UI)
  var rgnCon=$('rgn-con');
  if(rgnCon) rgnCon.innerHTML='';
  STATE.regions=[];
  STATE.importedTerrains=[];
  if(st.regions&&st.regions.length){
    st.regions.forEach(function(r){
      addRegion(r.eq,r.x,r.y,r.radius,r.strength,r.blend,r.on);
    });
  }
  if(importsData&&importsData.length){
    importsData.forEach(function(z){
      var zone={
        id:z.id, sourceId:z.sourceId, name:z.name, seed:z.seed,
        x:z.x, y:z.y, feather:z.feather, on:z.on,
        hmap:new Float32Array(z.hmap), gridRes:z.gridRes, s:z.s,
        worldSize:z.worldSize, seaLevel:z.seaLevel,
        waterAlpha:z.waterAlpha, waterColor:z.waterColor
      };
      STATE.importedTerrains.push(zone);
      renderImportedZoneRow(zone);
      var num=parseInt(String(zone.id).replace('imp',''))||0;
      if(num>importN) importN=num;
    });
  }
  if(!STATE.regions.length && !STATE.importedTerrains.length){
    if(rgnCon) rgnCon.innerHTML='<div class="rgn-empty">No zones yet — add or import one below</div>';
  }
  updateRgnCount();
  updateImportedCountBadge();
  // Restore animation
  if(animData) animRestoreData(animData);
  generate();
}


