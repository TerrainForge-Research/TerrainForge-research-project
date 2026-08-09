var importedWaterMeshes=[]; // per-import water planes (imports from other saved maps)


function createWaterMaterial(deepRGB, shallowRGB, opacity){
  var mixRGB=[
    deepRGB[0]*0.35+shallowRGB[0]*0.65,
    deepRGB[1]*0.35+shallowRGB[1]*0.65,
    deepRGB[2]*0.35+shallowRGB[2]*0.65
  ];
  var col=new THREE.Color(mixRGB[0],mixRGB[1],mixRGB[2]);
  col.convertSRGBToLinear();
  return new THREE.MeshPhysicalMaterial({
    color:col,
    transparent:true,
    opacity:opacity,
    roughness:0.18,
    metalness:0.0,
    clearcoat:1.0,
    clearcoatRoughness:0.04,
    side:THREE.DoubleSide
  });
}

// ── WATER PLANE ──────────────────────────────────────────────────
function buildWater(){
  if(waterMesh){scene.remove(waterMesh);waterMesh.geometry.dispose();waterMesh.material.dispose();}
  var meshScale=(STATE.scale||1.0)*(STATE.mapArea||1.0);
  var segs=48, planeSize=SURF*1.5*meshScale;
  var geo=new THREE.PlaneGeometry(planeSize,planeSize,segs,segs);
  geo.rotateX(-Math.PI/2);
  var mat=createWaterMaterial(hex2rgb(STATE.colors.deep), hex2rgb(STATE.colors.shallow), STATE.wAlpha);
  waterMesh=new THREE.Mesh(geo,mat);
  waterMesh.position.y=STATE.seaLevel;
  waterMesh.receiveShadow=true;
  scene.add(waterMesh);
  // Custom water-equation prev(x,y) feedback buffers, matched to this
  // mesh's own vertex grid (PlaneGeometry lays vertices row-major, x
  // fastest, so a simple ci+ri*GRID index lines up with animateWater()).
  waterEqGridN=segs+1;
  waterEqCellSize=planeSize/segs;
  var weVC=waterEqGridN*waterEqGridN;
  waterEqPrevBuf=new Float32Array(weVC);
  waterEqBuf=new Float32Array(weVC);
}

// Per-import water planes — each imported zone keeps its own original
// sea level, water tint and transparency, exactly as it looked in the
// map it was imported from (independent of this map's global water).
function buildImportedWater(){
  importedWaterMeshes.forEach(function(m){
    scene.remove(m); m.geometry.dispose(); m.material.dispose();
  });
  importedWaterMeshes=[];
  if(!STATE.importedTerrains || !STATE.importedTerrains.length) return;
  var scl=(STATE.scale||1.0), mapArea=(STATE.mapArea||1.0);
  var halfWorld=(SURF/2)*scl*mapArea;
  STATE.importedTerrains.forEach(function(zone){
    if(!zone.on) return;
    var zx=(zone.x||0)*halfWorld, zy=(zone.y||0)*halfWorld;
    var size=zone.worldSize*(zone.impScale||1.0)*(zone.impMapArea||1.0);
    if(!(size>0)) return;
    var geo=new THREE.PlaneGeometry(size,size,16,16);
    geo.rotateX(-Math.PI/2);
    var shallowRGB=hex2rgb(zone.waterColor||'#3d8fd4');
    // Imported zones only store one water colour — derive a plausible
    // darker/cooler "deep" tone from it to blend toward.
    var deepRGB=[shallowRGB[0]*0.4, shallowRGB[1]*0.45, shallowRGB[2]*0.55];
    var mat=createWaterMaterial(deepRGB, shallowRGB, zone.waterAlpha!=null?zone.waterAlpha:0.6);
    var mesh=new THREE.Mesh(geo,mat);
    mesh.position.set(zx, zone.seaLevel||0, zy);
    mesh.receiveShadow=true;
    scene.add(mesh);
    importedWaterMeshes.push(mesh);
  });
}

// ── FOLIAGE SPAWNING ─────────────────────────────────────────────
function animateWater(t){
  if(!waterMesh) return;
  var pos = waterMesh.geometry.attributes.position;
  var arr = pos.array;
  var wh = STATE.wHeight, ws = STATE.wSpeed;
  var count = pos.count;
  // Custom equation replaces the built-in interference field below when
  // enabled — x/y stay raw world coords (bake your own frequency into
  // the equation), t is scaled by the same Wave Speed slider.
  var useCustomEq = STATE.waterEqOn && waterEqFn;
  var tEff = t*ws;

  // Traveling wave components: {kx, kz, omega, amp, phase}
  // Irrational omega ratios prevent strict periodicity → quasiperiodic field
  var W = [
    { kx: 0.380,  kz:  0.220, om: 1.000, a: 1.00, p: 0.000 },
    { kx:-0.280,  kz:  0.350, om: 1.309, a: 0.62, p: 1.732 },
    { kx: 0.180,  kz:-0.400,  om: 0.873, a: 0.52, p: 3.141 },
    { kx: 0.460,  kz:  0.140, om: 1.618, a: 0.36, p: 0.900 },
    { kx:-0.105,  kz:-0.315,  om: 0.707, a: 0.28, p: 4.800 }
  ];

  // Chaos coupling — sample live wave field into water surface
  var chaosActive = CHAOS.enabled && CHAOS._waveBuf && heightCache;
  var cEnergy = chaosActive ? Math.min(1.4, CHAOS.peakEnergy * 2.8) : 0;
  var CGRID = chaosActive ? heightCache.GRID : 0;
  var cs    = chaosActive ? heightCache.s : 1;
  var waterHalf = SURF * 0.75; // water mesh is SURF*1.5 wide

  for (var i = 0; i < count; i++) {
    var x = arr[i*3], z = arr[i*3+2];
    var h = 0;

    if (useCustomEq) {
      // ── User equation replaces the built-in interference field ──
      h = waterEqFn(x, z, tEff);
      if (waterEqBuf) waterEqBuf[i] = h;
    } else {
      // ── 1. Linear superposition of five traveling waves ─────────
      for (var w = 0; w < W.length; w++) {
        var wv = W[w];
        h += wv.a * Math.sin(wv.kx*x*ws + wv.kz*z*ws + wv.om*t*ws + wv.p);
      }

      // ── 2. Nonlinear Stokes steepening (2nd-order correction) ───
      // Dominant wave's 2nd harmonic amplifies crests, flattens troughs
      var ph0 = W[0].kx*x*ws + W[0].kz*z*ws + W[0].om*t*ws;
      h += 0.13 * Math.sin(2*ph0);

      // ── 3. Wave–wave interaction (energy focusing) ──────────────

      var ph1 = W[1].kx*x*ws + W[1].kz*z*ws + W[1].om*t*ws + W[1].p;
      var ph2 = W[3].kx*x*ws + W[3].kz*z*ws + W[3].om*t*ws + W[3].p;
      var focus = Math.sin(ph0) * Math.sin(ph1);        // ±1 at coincidence
      h += 0.20 * focus * focus * Math.sign(focus);     // sharp focusing peak
      // Cross-wave resonance between waves 1 and 3
      h += 0.08 * Math.sin(ph1 + ph2) * Math.cos(ph0 - ph2);
    }

    // ── 4. Chaos Engine coupling ─────────────────────────────────
    // Live erosion wave-field leaks into water surface → water looks
    // rougher near actively eroding zones
    if (chaosActive && cEnergy > 0.01) {
      var ci = Math.min(CGRID-1, Math.max(0, Math.round((x + waterHalf) / cs)));
      var ri = Math.min(CGRID-1, Math.max(0, Math.round((z + waterHalf) / cs)));
      var cw = CHAOS._waveBuf[ri*CGRID + ci];
      h += cw * cEnergy * 0.42;
    }

    // ── 5. Chaos Event field contributions ──────────────────────
    for (var ei = 0; ei < CHAOS_EVENTS.length; ei++) {
      h += evalChaosEventWater(CHAOS_EVENTS[ei], x, z, t);
    }

    arr[i*3+1] = STATE.seaLevel + h * wh;
  }
  
  if (useCustomEq && waterEqBuf && waterEqPrevBuf) waterEqPrevBuf.set(waterEqBuf);
  pos.needsUpdate = true;
  // Waves displaced the vertices above but normals were never recomputed,
  // so the surface used to shade as if perfectly flat no matter how much
  // it moved. Recomputing here is what lets the sun's specular highlight
  // actually sparkle across the wave crests as they shift, instead of
  // sitting frozen in one spot.
  waterMesh.geometry.computeVertexNormals();
  waterMesh.geometry.attributes.normal.needsUpdate = true;
}


