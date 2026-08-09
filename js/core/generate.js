
var generating=false;

function generate(showProgress){
  if(generating) return;
  generating=true;
  genStartTime=performance.now();
  if(showProgress!==false) showGenProgress();

  gNoise = new SimplexNoise(STATE.seed);
  setTimeout(function(){
    setProgress(10,'Building heightmap…');
    // Use chunked async build for large resolutions to keep UI alive
    if(STATE.res >= 192){
      buildHeightmapChunked(function(data){ heightCache=data; continueGenerate(data); });
    } else {
      setTimeout(function(){
        var data;
        try{ data=buildHeightmap(); }
        catch(e){ toast('Error','Heightmap: '+e.message); hideGenProgress(); generating=false; return; }
        heightCache=data; continueGenerate(data);
      },10);
    }
  },40);
}



function buildHeightmapChunked(cb){
  var res = STATE.res;
  var GRID = res + 1;
  var VC   = GRID * GRID;
  var eq   = getEquationFn(STATE.eq);
  var scl  = STATE.scale, amp = STATE.amp;
  var mapArea = STATE.mapArea || 1.0;
  var SURF = 20, s = SURF / res;
  var halfWorld = (SURF/2) * scl * mapArea;
  var hmap = new Float32Array(VC);
  var ROWS_PER_TICK = Math.max(8, Math.floor(GRID / 16)); // ~16 yields
  var j = 0;

  // Pre-compile region functions
  var activeRegions = [];
  if(STATE.regions && STATE.regions.length){
    for(var ri=0;ri<STATE.regions.length;ri++){
      var rgn=STATE.regions[ri];
      if(!rgn.on) continue;
      var rfn=rgn.fn;
      if(!rfn){ try{rfn=getEquationFn(rgn.eq);}catch(e2){continue;} }
      activeRegions.push({
        fn:rfn,
        rx:rgn.x*halfWorld, ry:rgn.y*halfWorld,
        rr:Math.max(0.05,rgn.radius)*halfWorld,
        strength:rgn.strength||1.0, blend:rgn.blend||'blend'
      });
    }
  }

  function tick(){
    var jEnd = Math.min(j + ROWS_PER_TICK, GRID);
    for(; j < jEnd; j++){
      for(var i = 0; i < GRID; i++){
        var wx = (i - res/2)*s*scl*mapArea, wy = (j - res/2)*s*scl*mapArea;
        var h  = eq(wx, wy, 0) * amp;
        // Layer compositing
        for(var li = 0; li < STATE.layers.length; li++){
          var lay = STATE.layers[li];
          if(!lay.on || !lay.fn) continue;
          var lh = lay.fn(wx, wy, 0) * lay.op;
          if(lay.blend==='add')       h += lh;
          else if(lay.blend==='multiply') h *= (1 + lh*.3);
          else if(lay.blend==='subtract') h -= lh;
          else if(lay.blend==='replace')  h  = h*(1-lay.op) + lay.fn(wx,wy,0)*lay.op;
        }
        // Region compositing
        for(var rgi=0;rgi<activeRegions.length;rgi++){
          var ar=activeRegions[rgi];
          var ddx=wx-ar.rx, ddy=wy-ar.ry;
          var dd=Math.sqrt(ddx*ddx+ddy*ddy);
          if(dd>=ar.rr) continue;
          var tt=1.0-dd/ar.rr;
          var mask=tt*tt*(3-2*tt);
          var rh=ar.fn(wx,wy,0)*ar.strength;
          if(ar.blend==='add')       h += rh * mask;
          else if(ar.blend==='blend')  h = h*(1-mask) + rh*mask;
          else if(ar.blend==='replace') h = h*(1-mask*0.9) + rh*(mask*0.9);
          else if(ar.blend==='multiply') h *= (1.0 + (rh-h)*mask*0.4);
        }
        // River carving
        if(STATE.riverOn){
          var rwx = wx + STATE.riverWarp*sn(wx*.5+3.1, wy*.5+1.7);
          var rwy = wy + STATE.riverWarp*sn(wx*.5+8.4, wy*.5+4.3);
          var rv  = Math.abs(sn(rwx*.7, rwy*.7));
          if(rv < .18) h -= STATE.riverDepth*(.18-rv)/.18;
        }
        hmap[j*GRID+i] = h;
      }
    }

    var pct = Math.round((j/GRID)*28); // 10..38% of total bar
    setProgress(10 + pct, 'Building heightmap (' + j + '/' + GRID + ' rows)…');

    if(j < GRID){
      setTimeout(tick, 0); // yield to browser
      return;
    }

    // All rows done — apply erosion
    gFlowMap = null;
    var etype = STATE.erosionType;
    if(etype==='laplacian' && STATE.erosion > .01){
      hmap = erode(hmap, GRID, STATE.erosion);
    } else if(etype==='thermal'){
      hmap = erodeThermally(hmap, GRID, STATE.talusAngle, STATE.thermIters);
    } else if(etype==='hydraulic'){
      var r = erodeHydraulic(hmap, GRID, {
        droplets:STATE.droplets, inertia:STATE.inertia,
        eroRate:STATE.eroRate, depRate:STATE.depRate, evap:STATE.evap
      });
      hmap = r.hmap; gFlowMap = r.flowMap;
    } else if(etype==='both'){
      hmap = erodeThermally(hmap, GRID, STATE.talusAngle, Math.floor(STATE.thermIters*.5));
      var r = erodeHydraulic(hmap, GRID, {
        droplets:Math.floor(STATE.droplets*.5), inertia:STATE.inertia,
        eroRate:STATE.eroRate, depRate:STATE.depRate, evap:STATE.evap
      });
      hmap = r.hmap; gFlowMap = r.flowMap;
    }

    // Imported terrains (stamped from other saved maps) — applied after erosion so
    // each import always reproduces its own exact original detail
    applyImportedZones(hmap, GRID, s, mapArea, scl);

    // Normalise
    zMin = Infinity; zMax = -Infinity;
    for(var i = 0; i < VC; i++){
      if(hmap[i] < zMin) zMin = hmap[i];
      if(hmap[i] > zMax) zMax = hmap[i];
    }

    var climate = STATE.climateOn ? computeClimateMaps(GRID, s, hmap, mapArea, scl) : null;
    cb({hmap:hmap, GRID:GRID, s:s,
      moisture: climate?climate.moisture:null,
      temperature: climate?climate.temperature:null});
  }

  setTimeout(tick, 0);
}

function continueGenerate(data){
  // Invalidate chaos buffers so they re-init from fresh terrain
  if(CHAOS._hmap){ CHAOS._hmap=null; CHAOS._hmap0=null; CHAOS._sedBuf=null; CHAOS._dHAccum=null; CHAOS._dH=null; CHAOS._newSed=null; CHAOS.stepCount=0; CHAOS.totalEroded=0; CHAOS.totalDeposited=0; }
  // Reset Wave Lab buffers (will be rebuilt in buildWaveSimMesh)
  if(WS._mesh){ scene.remove(WS._mesh); WS._mesh.geometry.dispose(); WS._mesh.material.dispose(); WS._mesh=null; } WS._buf=null; WS._prevBuf=null;

  setProgress(40,'Meshing terrain…');
  setTimeout(function(){
    var slopes;
    try{ slopes=buildTerrainMesh(data); buildWaveSimMesh(data); }
    catch(e){ toast('Error','Mesh: '+e.message); hideGenProgress(); generating=false; return; }
    setProgress(65,'Spawning water…');
    setTimeout(function(){
      buildWater();
      buildImportedWater();
      setProgress(78,'Placing trees & rocks…');
      setTimeout(function(){
        spawnFoliage(data,slopes);
        if(STATE.showFlowMap && gFlowMap) applyFlowMapOverlay();
        // Auto-fit camera only on the very first generate — never eject user after that
        if(!orb._hasInitCamera){
          var meshScale=(STATE.scale||1.0)*(STATE.mapArea||1.0);
          var idealRadius=Math.max(16,Math.min(maxCamRadius(), 32*meshScale));
          orb.targetRadius=idealRadius; orb.radius=idealRadius;
          orb.tx=0; orb.ty=0; orb.tz=0;
          orb._hasInitCamera=true;
          updateZoomLevel();
        }
        setProgress(100,'Done!');
        STATE._lastGenMs=performance.now()-genStartTime;
        updateStats(); updateDNA(); updateDocsTab();
        setTimeout(function(){
          hideGenProgress(); generating=false;
          toast('Terrain Ready','Seed '+STATE.seed+' — '+treeCount+' trees, '+rockCount+' rocks.');
        },350);
      },20);
    },10);
  },10);
}

function showGenProgress(){
  $('gen-progress').style.display='flex';
  setProgress(0,'Starting…');
}
function hideGenProgress(){$('gen-progress').style.display='none';}
function setProgress(pct,label){
  $('prog-bar').style.width=pct+'%';
  $('prog-label').textContent=label;
}

