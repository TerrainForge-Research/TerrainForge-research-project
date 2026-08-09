var CHAOS = {
  enabled: false,
  showOverlay: false,

  // Wave field parameters
  waveEq: 'fbm(x*0.8,y*0.8,4)*2.5 + sin(d*2.5-t*1.8)*1.8',
  waveScale: 0.6,
  waveSpeed: 1.2,

  // Coupling coefficients
  alpha: 1.4,   // ∇²T curvature coupling (erodes peaks / fills pits, wave-energy weighted)
  beta:  0.8,   // wave gradient lateral force (directional scour → sediment)
  gamma: 0.5,   // sediment redeposition rate
  delta: 0.6,   // ∇⁴T hyper-diffusion — always-on biharmonic smoothing, kills blocky/stepped noise

  // Energy limiter — prevents blow-up (conservation proxy)
  cap: 0.028,

  // Timing
  tickRate: 10,   // frames between coupling steps
  rebuildEvery: 1, // ticks between mesh rebuilds (1 = every tick)

  // ── Runtime bookkeeping ──────────────────────
  _frameCount: 0,
  _tick: 0,
  stepCount: 0,
  totalEroded: 0.0,
  totalDeposited: 0.0,
  peakEnergy: 0.0,
  stabilityIndex: 1.0,

  // ── Working buffers (allocated on first enable) ──
  _hmap:     null,   // Float32Array — live working heightmap
  _hmap0:    null,   // Float32Array — snapshot for reset
  _waveBuf:  null,   // Float32Array — W(x,y,t) evaluated on terrain grid
  _gwxBuf:   null,   // ∂W/∂x
  _gwyBuf:   null,   // ∂W/∂y
  _gwMagBuf: null,   // |∇W|
  _sedBuf:   null,   // suspended sediment S(x,y)
  _dHAccum:  null,   // accumulated Δh for overlay colour
  _waveEqFn: null    // compiled wave function
};

// ── Wave equation compiler ─────────────────────────────────────────
// Extended version of getEquationFn() with radial distance 
function buildChaosWaveEqFn(eq) {
  try {
    var fn = new Function(
      'x','y','t','d',
      'sin','cos','tan','abs','sqrt','pow','floor','ceil','round','max','min','log','exp','PI',
      'fbm','ridge','noise','dist','warp',
      'return (' + eq + ');'
    );
    return function(x, y, t) {
      try {
        var d = Math.sqrt(x*x + y*y);
        var v = fn(
          x, y, t, d,
          Math.sin, Math.cos, Math.tan, Math.abs, Math.sqrt, Math.pow,
          Math.floor, Math.ceil, Math.round, Math.max, Math.min, Math.log, Math.exp, Math.PI,
          function(a,b,o,r){ return fbmN(a,b,o,r); },
          function(a,b){ return ridgeN(a,b); },
          function(a,b){ return sn(a,b); },
          function(a,b,cx,cy){ return Math.sqrt(Math.pow(a-(cx||0),2)+Math.pow(b-(cy||0),2)); },
          function(a,b,s){ return domWarp(a,b,s||0.8); }
        );
        return isFinite(v) ? v : 0;
      } catch(e) { return 0; }
    };
  } catch(e) {
    return function(){ return 0; };
  }
}

// ── Allocate / refresh working buffers ────────────────────────────
function chaosAllocBuffers() {
  if (!heightCache) return false;
  var N = heightCache.GRID * heightCache.GRID;
  CHAOS._hmap     = new Float32Array(heightCache.hmap);
  CHAOS._hmap0    = new Float32Array(heightCache.hmap);
  CHAOS._waveBuf  = new Float32Array(N);
  CHAOS._gwxBuf   = new Float32Array(N);
  CHAOS._gwyBuf   = new Float32Array(N);
  CHAOS._gwMagBuf = new Float32Array(N);
  CHAOS._sedBuf   = new Float32Array(N);
  CHAOS._dHAccum  = new Float32Array(N);
  // Pre-allocated scratch buffers — reused every tick, never GC'd
  CHAOS._dH       = new Float32Array(N);
  CHAOS._newSed   = new Float32Array(N);
  CHAOS._waveSmoothTmp = new Float32Array(N);
  return true;
}

// ── Compile current wave equation ─────────────────────────────────
function chaosCompile() {
  var eq = CHAOS.waveEq;
  CHAOS._waveEqFn = buildChaosWaveEqFn(eq);
  var inp = document.getElementById('chaos-eq-input');
  if (inp) inp.style.borderColor = CHAOS._waveEqFn ? '' : 'var(--er)';
}



function chaosMeshPatch() {
  if (!terrainMesh || !heightCache || !CHAOS._hmap) return;
  var geo     = terrainMesh.geometry;
  var posA    = geo.attributes.position.array;
  var colA    = geo.attributes.color.array;
  var hmap    = CHAOS._hmap;
  var dHAccum = CHAOS._dHAccum;
  var GRID    = heightCache.GRID;
  var zRng    = zMax - zMin || 1;
  // Scale dHAccum to [0,1] glow intensity — cap*3 = near-max visible change
  var glowScale = 1.0 / (CHAOS.cap * 3.0 + 0.0001);

  for (var j = 1; j < GRID-1; j++) {
    for (var i = 1; i < GRID-1; i++) {
      var idx = j * GRID + i;
      var h   = hmap[idx];

      // ── 1. Update Y position ──────────────────────────────────
      posA[idx*3+1] = h;

      // ── 2. Base biome colour ──────────────────────────────────
      var dx  = hmap[idx+1]    - hmap[idx-1];
      var dz  = hmap[idx+GRID] - hmap[idx-GRID];
      var sl  = Math.min(1, Math.sqrt(dx*dx+dz*dz) / (heightCache.s*2));
      var hn  = (h - zMin) / zRng;
      var rgb = splatColor(hn, sl);
      var r = rgb[0], g = rgb[1], b = rgb[2];

      // ── 3. Bake impact glow (always on) ──────────────────────
      if (dHAccum) {
        var dh   = dHAccum[idx] * glowScale;  // signed, roughly [-1, +1]
        var adh  = Math.abs(dh);
        if (adh > 0.03) {
          if (dh < -0.03) {
            // EROSION — blast toward hot orange → white at maximum impact
            var t = Math.min(1, (-dh - 0.03) * 3.5);
            // Stage 1 (t<0.5): biome → orange
            // Stage 2 (t>0.5): orange → near-white
            var ts = Math.min(1, t * 2);
            var th = Math.max(0, t * 2 - 1);
            r = r*(1-ts) + 1.00*ts;   r = r*(1-th) + 1.0*th;
            g = g*(1-ts) + 0.35*ts;   g = g*(1-th) + 0.8*th;
            b = b*(1-ts) + 0.00*ts;   b = b*(1-th) + 0.5*th;
          } else if (dh > 0.03) {
            // DEPOSITION — wash toward cool teal → bright cyan at peak
            var t = Math.min(1, (dh - 0.03) * 3.5);
            var ts = Math.min(1, t * 2);
            r = r*(1-ts) + 0.04*ts;
            g = g*(1-ts) + 0.85*ts;
            b = b*(1-ts) + 1.00*ts;
          }
        }
      }

      // Linearize before writing — buildGridGeometry stores linear-space
      // vertex colours now, and this patch must match or colours would
      // visibly shift brighter the moment the erosion sim starts ticking.
      colA[idx*3]   = srgbToLinear(r);
      colA[idx*3+1] = srgbToLinear(g);
      colA[idx*3+2] = srgbToLinear(b);
    }
  }

  geo.attributes.position.needsUpdate = true;
  geo.attributes.color.needsUpdate    = true;
  // Full normal recompute is expensive (O(faces)) — only every 6th patch.
  // Visually imperceptible at small per-step deformation levels.
  if (CHAOS._tick % 6 === 0) geo.computeVertexNormals();
}

// ── Main coupling tick ─────────────────────────────────────────────
// Called every CHAOS.tickRate frames from the animate loop.
function chaosTick() {
  if (!CHAOS.enabled) return;
  if (!heightCache || !CHAOS._waveEqFn) return;
  if (!CHAOS._hmap) {
    if (!chaosAllocBuffers()) return;
    chaosCompile();
  }

  var GRID = heightCache.GRID;
  var s    = heightCache.s;       // metres per cell
  var N    = GRID * GRID;
  var t    = gTime * CHAOS.waveSpeed;
  var sc   = CHAOS.waveScale;
  var half = (GRID - 1) * 0.5;
  var wFn  = CHAOS._waveEqFn;

  var waveBuf  = CHAOS._waveBuf;
  var gwxBuf   = CHAOS._gwxBuf;
  var gwyBuf   = CHAOS._gwyBuf;
  var gwMagBuf = CHAOS._gwMagBuf;
  var hmap     = CHAOS._hmap;
  var sedBuf   = CHAOS._sedBuf;
  var dHAccum  = CHAOS._dHAccum;

  // ── STEP 1: Populate waveBuf — prefer WS._buf if coupled ────────
  // When Wave Lab is active and coupled, share its live wave buffer
  // (already evaluated in updateWaveSimSurface each frame).
  // Otherwise fall back to chaos-engine's own equation evaluation.
  var usingWSBuf = CHAOS.useWaveLabBuf && WS._buf && WS._buf.length === N;
  if (usingWSBuf) {
    // Copy WS wave buffer — it's already been through applyHyperSmoothing()
    // in updateWaveSimSurface(), so gradients below inherit that smoothness.
    for (var k = 0; k < N; k++) waveBuf[k] = WS._buf[k];
  } else {
    for (var j = 0; j < GRID; j++) {
      for (var i = 0; i < GRID; i++) {
        var wx = (i - half) * s * sc;
        var wy = (j - half) * s * sc;
        waveBuf[j * GRID + i] = wFn(wx, wy, t);
      }
    }
    // Independent (uncoupled) field — apply the same real ν∇²−μ∇⁴
    // smoothing directly, using the shared Wave Lab viscosity settings,
    // so the chaos engine's own water field is just as silky-smooth.
    applyHyperSmoothing(waveBuf, CHAOS._waveSmoothTmp, GRID, WS.viscosity, WS.hyperViscosity);
  }

  // ── STEP 1b: Add chaos event field injectors to waveBuf ─────────
  // Events act as localized field sources — they raise the local wave
  // energy so chaosTick() naturally erodes those regions more.
  if (CHAOS_EVENTS.length > 0) {
    purgeChaosEvents();
    var evT = gTime; // events use real time, not scaled
    for (var ej = 0; ej < GRID; ej++) {
      for (var ei2 = 0; ei2 < GRID; ei2++) {
        var ewx = (ei2 - half) * s * sc;
        var ewy = (ej  - half) * s * sc;
        var evSum = 0;
        for (var evi = 0; evi < CHAOS_EVENTS.length; evi++) {
          evSum += evalChaosEventChaos(CHAOS_EVENTS[evi], ewx, ewy, evT);
        }
        if (evSum !== 0) waveBuf[ej*GRID + ei2] += evSum;
      }
    }
  }

  // ── STEP 2: Compute wave gradient ∇W ─────────────────────────
  for (var j = 1; j < GRID-1; j++) {
    for (var i = 1; i < GRID-1; i++) {
      var idx = j * GRID + i;
      var dwx = (waveBuf[idx+1]    - waveBuf[idx-1])    * 0.5;
      var dwy = (waveBuf[idx+GRID] - waveBuf[idx-GRID]) * 0.5;
      gwxBuf[idx]   = dwx;
      gwyBuf[idx]   = dwy;
      gwMagBuf[idx] = Math.sqrt(dwx*dwx + dwy*dwy);
    }
  }

  // ── STEP 3: Normalise wave energy ────────────────────────────
  var wMax2 = 0;
  for (var k = 0; k < N; k++) { var w2 = waveBuf[k]*waveBuf[k]; if(w2>wMax2)wMax2=w2; }
  var wNorm  = wMax2  > 0.001 ? 1.0/wMax2  : 1.0;
  var gwMax  = 0;
  for (var k = 0; k < N; k++) if(gwMagBuf[k]>gwMax)gwMax=gwMagBuf[k];
  var gwNorm = gwMax  > 0.001 ? 1.0/gwMax  : 1.0;

  
  var alpha = CHAOS.alpha;
  var beta  = CHAOS.beta;
  var gamma = CHAOS.gamma;
  var delta = CHAOS.delta;
  var cap   = CHAOS.cap;
  var R     = Math.max(1, Math.min(5, CHAOS.areaRadius | 0));
  var R2    = R * R;

  // Reuse pre-allocated scratch buffers — no GC pressure
  var dH = CHAOS._dH; dH.fill(0);
  var totalEro = 0, totalDep = 0;

  for (var j = 1; j < GRID-1; j++) {
    for (var i = 1; i < GRID-1; i++) {
      var idx = j * GRID + i;
      var h   = hmap[idx];

      // ── Area integral (Gaussian-weighted neighbourhood) ────────
      var areaE = 0, fDirX = 0, fDirY = 0, wTotal = 0;
      for (var dr = -R; dr <= R; dr++) {
        for (var dc = -R; dc <= R; dc++) {
          var d2 = dr*dr + dc*dc;
          if (d2 > R2) continue;
          var ni2 = Math.max(0, Math.min(GRID-1, i+dc));
          var nj2 = Math.max(0, Math.min(GRID-1, j+dr));
          var nk  = nj2*GRID + ni2;
          var w   = Math.exp(-d2 / (R2 * 0.5));   // Gaussian weight
          var wv  = waveBuf[nk];
          areaE  += wv*wv * w;
          fDirX  += gwxBuf[nk] * w;
          fDirY  += gwyBuf[nk] * w;
          wTotal += w;
        }
      }
      if (wTotal > 0) { areaE /= wTotal; fDirX /= wTotal; fDirY /= wTotal; }

      var Ew_area  = areaE  * wNorm;                                   // [0,1]
      var fMag     = Math.sqrt(fDirX*fDirX + fDirY*fDirY) * gwNorm;   // [0,1]
      var fDirXn   = fDirX / (Math.sqrt(fDirX*fDirX+fDirY*fDirY) + 1e-6);
      var fDirYn   = fDirY / (Math.sqrt(fDirX*fDirX+fDirY*fDirY) + 1e-6);

      // Terrain gradient (slope vector) — still used for facing + stability
      var dtx = (hmap[idx+1]    - hmap[idx-1])    * 0.5 / s;
      var dty = (hmap[idx+GRID] - hmap[idx-GRID])  * 0.5 / s;
      var gradT   = Math.sqrt(dtx*dtx + dty*dty);
      var slopeMag = gradT + 1e-6;

      // Facing factor: dot(F_dir, ∇T/|∇T|) → +1 = head-on, -1 = leeward
      var dotProd  = (fDirXn * dtx + fDirYn * dty) / slopeMag;
      var facing   = Math.max(0, dotProd);   // only hit up-wave faces

      // Slope stability
      var slopeNorm = Math.tanh(gradT * 0.7);
      var stability = 1.0 - slopeNorm;

      // ∇²T — real discrete Laplacian (signed curvature): negative on
      // sharp peaks, positive in sharp pits.
      var lapT     = (hmap[idx+1] + hmap[idx-1] + hmap[idx+GRID] + hmap[idx-GRID] - 4*h) / (s*s);
      var curvNorm = Math.tanh(lapT * 0.4);   // bounded, sign-preserving

      // ∇⁴T — 13-point biharmonic stencil (hyper-diffusion). Always
      // active, independent of wave energy.
      var im1 = i-1, ip1 = i+1, jm1 = j-1, jp1 = j+1;
      var im2 = i>1 ? i-2 : 0,          ip2 = i<GRID-2 ? i+2 : GRID-1;
      var jm2 = j>1 ? j-2 : 0,          jp2 = j<GRID-2 ? j+2 : GRID-1;
      var biharmT = (
          20*h
        - 8*(hmap[j*GRID+ip1] + hmap[j*GRID+im1] + hmap[jp1*GRID+i] + hmap[jm1*GRID+i])
        + 2*(hmap[jp1*GRID+ip1] + hmap[jp1*GRID+im1] + hmap[jm1*GRID+ip1] + hmap[jm1*GRID+im1])
        + (hmap[j*GRID+ip2] + hmap[j*GRID+im2] + hmap[jp2*GRID+i] + hmap[jm2*GRID+i])
      ) / (s*s*s*s);
      var hyperNorm = Math.tanh(biharmT * 0.02);

      // Curvature-driven smoothing — bidirectional: erodes peaks, fills pits
      var curvatureFlow = alpha * Ew_area * curvNorm;

      // Directional lateral scour — unchanged mechanism, still becomes sediment
      var scour = beta * fMag * (1.0 - stability * 0.6);
      scour = Math.min(cap, Math.max(0, scour));

      // Always-on hyper-diffusion — stabilising by construction (−δ∇⁴T)
      var hyperFlow = -delta * hyperNorm;

      dH[idx]      = curvatureFlow + hyperFlow - scour;
      sedBuf[idx] += scour;
      totalEro    += scour;
      if (curvatureFlow + hyperFlow < 0) totalEro += -(curvatureFlow + hyperFlow);
      else                               totalDep += (curvatureFlow + hyperFlow);
    }
  }

  
  var newSed = CHAOS._newSed; newSed.set(sedBuf);

  for (var j = 1; j < GRID-1; j++) {
    for (var i = 1; i < GRID-1; i++) {
      var idx = j * GRID + i;
      var sed = sedBuf[idx];
      if (sed < 0.00015) continue;

      // Terrain downhill direction
      var dtx2 = -(hmap[idx+1]    - hmap[idx-1])    * 0.5;
      var dty2 = -(hmap[idx+GRID] - hmap[idx-GRID])  * 0.5;

      // Wave gradient lateral push (scaled by beta)
      var wx2 = gwxBuf[idx] * 0.4;
      var wy2 = gwyBuf[idx] * 0.4;

      // Combined transport direction
      var tx = dtx2 + wx2;
      var ty = dty2 + wy2;
      var tlen = Math.sqrt(tx*tx + ty*ty);
      if (tlen < 0.0005) continue;

      // Step to neighbouring cell in transport direction
      var ni = Math.max(0, Math.min(GRID-1, Math.round(i + tx/tlen)));
      var nj = Math.max(0, Math.min(GRID-1, Math.round(j + ty/tlen)));
      var nidx = nj * GRID + ni;

      // Deposit fraction — more in flat zones (sediment traps)
      var localSlope = Math.tanh(tlen / (s * 2.0));
      var depFrac = gamma * (1.0 - localSlope * 0.7);
      depFrac = Math.min(0.95, Math.max(0, depFrac));

      var dep = sed * depFrac;
      newSed[idx] -= dep;
      dH[nidx]    += dep;
      totalDep    += dep;
    }
  }

  // ── STEP 6: Apply changes — energy-capped ─────────────────────
  for (var k = 0; k < N; k++) {
    var change = Math.max(-cap, Math.min(cap * 0.85, dH[k]));
    hmap[k] += change;
    // Accumulate smoothed delta for heat-map overlay
    dHAccum[k] = dHAccum[k] * 0.88 + change;  // 0.88 = longer glow persistence
    // Update sediment (slow evaporation keeps it bounded)
    sedBuf[k] = newSed[k] * 0.94;
  }

  // ── STEP 7: Sync heightCache & stats ─────────────────────────
  heightCache.hmap = hmap;
  zMin = Infinity; zMax = -Infinity;
  for (var k = 0; k < N; k++) {
    if (hmap[k] < zMin) zMin = hmap[k];
    if (hmap[k] > zMax) zMax = hmap[k];
  }

  CHAOS.totalEroded    += totalEro;
  CHAOS.totalDeposited += totalDep;
  CHAOS.stepCount++;
  CHAOS.peakEnergy     = Math.sqrt(wMax2);
  CHAOS.stabilityIndex = totalEro > 0.0001 ? Math.min(1, totalDep / totalEro) : 1.0;

  // ── STEP 8: Fast in-place mesh patch (no geometry recreation) ──
  CHAOS._tick++;
  if (CHAOS._tick % CHAOS.rebuildEvery === 0) {
    chaosMeshPatch();                            // positions + normals only
    if (CHAOS.showOverlay) applyChaosOverlay();  // optional colour overlay
    updateChaosStatsUI();                        // stats panel
  }
}

// ── Erosion heat-map overlay ──────────────────────────────────────
// Tints eroded cells red and deposited cells teal over the biome colours
function applyChaosOverlay() {
  if (!terrainMesh || !CHAOS._dHAccum) return;
  var geo = terrainMesh.geometry;
  var col = geo.attributes.color.array;
  var N   = CHAOS._dHAccum.length;
  var capInv = 1.0 / (CHAOS.cap * 0.6 + 0.00001);
  // Linearized once outside the loop — matches the terrain's now-linear
  // vertex colours (see buildGridGeometry / srgbToLinear).
  var erR=srgbToLinear(1.00), erG=srgbToLinear(0.18), erB=srgbToLinear(0.04);
  var deR=srgbToLinear(0.05), deG=srgbToLinear(0.75), deB=srgbToLinear(0.95);

  for (var k = 0; k < N; k++) {
    var dh = CHAOS._dHAccum[k] * capInv;
    dh = Math.max(-1, Math.min(1, dh));
    var absD = Math.abs(dh);
    if (absD < 0.04) continue; // ignore negligible cells

    if (dh < -0.04) {
      // Erosion — blend toward hot red
      var blend = Math.min(1, -dh * 1.8);
      col[k*3]   = col[k*3]   * (1-blend) + erR * blend;
      col[k*3+1] = col[k*3+1] * (1-blend) + erG * blend;
      col[k*3+2] = col[k*3+2] * (1-blend) + erB * blend;
    } else if (dh > 0.04) {
      // Deposition — blend toward cool teal
      var blend = Math.min(1, dh * 1.8);
      col[k*3]   = col[k*3]   * (1-blend) + deR * blend;
      col[k*3+1] = col[k*3+1] * (1-blend) + deG * blend;
      col[k*3+2] = col[k*3+2] * (1-blend) + deB * blend;
    }
  }
  geo.attributes.color.needsUpdate = true;
}

// ── Update stats UI elements ──────────────────────────────────────
function updateChaosStatsUI() {
  var el;
  var energy = CHAOS.peakEnergy;
  var barPct = Math.min(100, energy * 18);
  el = document.getElementById('chaos-energy-val'); if (el) el.textContent = energy.toFixed(2);
  el = document.getElementById('chaos-energy-bar'); if (el) el.style.width = barPct + '%';
  el = document.getElementById('cs-energy');        if (el) el.textContent = energy.toFixed(2);
  el = document.getElementById('cs-steps');         if (el) el.textContent = CHAOS.stepCount;
  el = document.getElementById('cs-eroded');        if (el) el.textContent = CHAOS.totalEroded.toFixed(3);
  el = document.getElementById('cs-deposited');     if (el) el.textContent = CHAOS.totalDeposited.toFixed(3);
  el = document.getElementById('cs-stability');
  if (el) {
    var si = (CHAOS.stabilityIndex * 100).toFixed(0);
    el.textContent = si + '%';
    el.style.color = CHAOS.stabilityIndex > 0.7 ? 'var(--ok)' :
                     CHAOS.stabilityIndex > 0.35 ? 'var(--go)' : 'var(--er)';
    // propagate colour to the parent cstat-card
    var card = el.closest('.cstat-card');
    if (card) card.style.borderColor = CHAOS.stabilityIndex > 0.7 ? 'rgba(68,221,170,.2)' :
                                        CHAOS.stabilityIndex > 0.35 ? 'rgba(238,187,85,.2)' : 'rgba(240,68,102,.3)';
  }
}

// ── Snapshot current terrain as reset point ───────────────────────
function chaosSnapshot() {
  if (!CHAOS._hmap) {
    if (!heightCache) { toast('No Terrain','Generate terrain first.'); return; }
    chaosAllocBuffers();
  } else {
    CHAOS._hmap0 = new Float32Array(CHAOS._hmap);
  }
  CHAOS.totalEroded = 0;
  CHAOS.totalDeposited = 0;
  CHAOS.stepCount = 0;
  CHAOS._dHAccum && CHAOS._dHAccum.fill(0);
  updateChaosStatsUI();
  toast('Snapshot Saved', 'Current terrain saved as chaos reset baseline.');
}

// ── Reset terrain to snapshot ─────────────────────────────────────
function chaosReset() {
  if (!CHAOS._hmap0 || !heightCache) {
    toast('No Snapshot','Take a snapshot first, or generate a new terrain.'); return;
  }
  CHAOS._hmap = new Float32Array(CHAOS._hmap0);
  heightCache.hmap = CHAOS._hmap;
  CHAOS._sedBuf && CHAOS._sedBuf.fill(0);
  CHAOS._dHAccum && CHAOS._dHAccum.fill(0);
  CHAOS.totalEroded = 0;
  CHAOS.totalDeposited = 0;
  CHAOS.stepCount = 0;
  CHAOS.peakEnergy = 0;
  CHAOS.stabilityIndex = 1.0;
  zMin = Infinity; zMax = -Infinity;
  for (var k = 0; k < CHAOS._hmap.length; k++) {
    if (CHAOS._hmap[k] < zMin) zMin = CHAOS._hmap[k];
    if (CHAOS._hmap[k] > zMax) zMax = CHAOS._hmap[k];
  }
  buildTerrainMesh(heightCache);
  updateChaosStatsUI();
  toast('Terrain Reset', 'Restored to snapshot. Chaos counters cleared.');
}

// ── Enable / disable chaos coupling ──────────────────────────────
function setChaosEnabled(v) {
  CHAOS.enabled = v;
  var chipEl  = null;
  var strip   = document.getElementById('chaos-energy-strip');
  var statsG  = document.getElementById('chaos-stats-grid');
  var stepsR  = document.getElementById('cs-steps-row');
  var actBtns = document.getElementById('chaos-action-btns');
  if (strip)   strip.style.display   = v ? '' : 'none';
  if (statsG)  statsG.style.display  = v ? '' : 'none';
  if (stepsR)  stepsR.style.display  = v ? '' : 'none';
  if (actBtns) actBtns.style.display = v ? '' : 'none';
  if (v) {
    if (!CHAOS._hmap) chaosAllocBuffers();
    chaosCompile();
    // Auto-snapshot if no snapshot yet
    if (!CHAOS._hmap0) chaosSnapshot();
    toast('Chaos Active', 'Wave-terrain coupling engaged. Watch the mountains reshape.');
  } else {
    toast('Chaos Paused', 'Coupling suspended — terrain frozen at current state.');
  }
}

// ── Bind all chaos UI controls ────────────────────────────────────
function bindChaosControls() {

  // Master toggle
  var togWrap = document.getElementById('tog-chaos');
  var togPill = document.getElementById('tchaos-tog');
  if (togWrap && togPill) {
    togWrap.addEventListener('click', function() {
      var v = !CHAOS.enabled;
      setChaosEnabled(v);
      togPill.classList.toggle('on', v);
    });
    togPill.classList.toggle('on', CHAOS.enabled);
  }

  // Overlay toggle
  var overlayWrap = document.getElementById('tog-chaos-overlay');
  var overlayPill = document.getElementById('tco-tog');
  if (overlayWrap && overlayPill) {
    overlayWrap.addEventListener('click', function() {
      CHAOS.showOverlay = !CHAOS.showOverlay;
      overlayPill.classList.toggle('on', CHAOS.showOverlay);
      if (!CHAOS.showOverlay && terrainMesh && heightCache) {
        buildTerrainMesh(heightCache); // restore base biome colours
      }
    });
  }

  // Wave preset selector
  var presetSel = document.getElementById('chaos-preset');
  var customRow = document.getElementById('chaos-custom-row');
  var eqInp     = document.getElementById('chaos-eq-input');
  if (presetSel) {
    presetSel.addEventListener('change', function() {
      var v = presetSel.value;
      if (v === 'custom') {
        if (customRow) customRow.style.display = '';
      } else {
        if (customRow) customRow.style.display = 'none';
        CHAOS.waveEq = v;
        if (CHAOS.enabled) chaosCompile();
      }
    });
  }
  if (eqInp) {
    eqInp.addEventListener('input', function() {
      CHAOS.waveEq = eqInp.value.trim() || CHAOS.waveEq;
      if (CHAOS.enabled) chaosCompile();
    });
    eqInp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { chaosCompile(); eqInp.blur(); }
    });
  }

  // Parameter sliders
  var chaosSliders = [
    ['sl-c-alpha',  'alpha',     2, 'v-c-alpha'],
    ['sl-c-beta',   'beta',      2, 'v-c-beta'],
    ['sl-c-gamma',  'gamma',     2, 'v-c-gamma'],
    ['sl-c-delta',  'delta',     2, 'v-c-delta'],
    ['sl-c-wscale', 'waveScale', 2, 'v-c-wscale'],
    ['sl-c-wspeed', 'waveSpeed', 2, 'v-c-wspeed'],
    ['sl-c-cap',    'cap',       3, 'v-c-cap'],
    ['sl-c-tick',   'tickRate',  0, 'v-c-tick']
  ];
  chaosSliders.forEach(function(row) {
    var el = document.getElementById(row[0]);
    if (!el) return;
    el.addEventListener('input', function() {
      CHAOS[row[1]] = parseFloat(el.value);
      var vEl = document.getElementById(row[3]);
      if (vEl) vEl.textContent = parseFloat(el.value).toFixed(row[2]);
    });
  });

  // Snapshot / Reset buttons
  var snapBtn  = document.getElementById('btn-chaos-snapshot');
  var resetBtn = document.getElementById('btn-chaos-reset');
  if (snapBtn)  snapBtn.addEventListener('click',  chaosSnapshot);
  if (resetBtn) resetBtn.addEventListener('click',  chaosReset);
}
