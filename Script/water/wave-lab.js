var WS = {
  // Surface display
  showSurface: true,
  opacity: 0.72,
  heightOffset: 0.3,
  amplitude: 1.5,

  // Wave equation
  eq:    'sin(d*2-t)*1.2 + prev(x,y)*0.9',
  eq2:   'cos(y*3 - t*1.5) * sin(x*2 + t)',
  battleMode: false,
  feedbackEnabled: false,

  // Wave parameters
  spatialFreq: 1.0,
  speed: 1.0,
  phase: 0.0,
  damp: 0.0,

  
  viscosity: 0.10,        // ν — ordinary diffusion, kills basic blockiness
  hyperViscosity: 0.015,  // μ — biharmonic hyper-viscosity, sub-pixel filter

  // Color
  colorMode: 'spectrum',
  customLow:  [0.10, 0.27, 1.00],
  customMid:  [0.67, 0.13, 0.80],
  customHigh: [1.00, 0.27, 0.53],

  // Ripples
  ripples: [],
  rippleMode: false,
  rippleType: 'normal',

  // Impact coupling
  coupled: true,
  showImpact: false,
  areaRadius: 2,

  // Runtime
  _mesh: null,
  _buf: null,
  _prevBuf: null,
  _smoothBuf: null,
  _eqFn: null,
  _eq2Fn: null,
  _color: null,    // THREE.Color instance
  _raycaster: null,
  _mouse: null,
  _GRID: 0,
  _s: 0,
  seaLevel: 0
};

// ══════════════════════════════════════════════════════════════════
//  SHARED "EXTREME-SMOOTH" PDE OPERATOR
//  Real discrete Laplacian (viscosity) + biharmonic (hyper-viscosity)
//  smoothing, shared by the Wave Lab water surface and the Chaos
//  Engine's own wave field. Implements the stabilising half of:


function applyHyperSmoothing(buf, tmp, GRID, visc, hvisc) {
  if (!(visc > 0) && !(hvisc > 0)) return;
  tmp.set(buf);
  for (var j = 0; j < GRID; j++) {
    var jm1 = j>0 ? j-1 : 0,  jp1 = j<GRID-1 ? j+1 : GRID-1;
    var jm2 = j>1 ? j-2 : 0,  jp2 = j<GRID-2 ? j+2 : GRID-1;
    var rowC = j*GRID, rowN = jm1*GRID, rowS = jp1*GRID, rowN2 = jm2*GRID, rowS2 = jp2*GRID;
    for (var i = 0; i < GRID; i++) {
      var im1 = i>0 ? i-1 : 0,  ip1 = i<GRID-1 ? i+1 : GRID-1;
      var im2 = i>1 ? i-2 : 0,  ip2 = i<GRID-2 ? i+2 : GRID-1;
      var c = tmp[rowC+i];
      var n = tmp[rowN+i], sV = tmp[rowS+i], w = tmp[rowC+im1], e = tmp[rowC+ip1];

      // ∇²u — standard 5-point Laplacian
      var lap = n + sV + w + e - 4*c;

      // ∇⁴u — 13-point biharmonic stencil (Laplacian applied twice)
      var biharm = 20*c - 8*(n+sV+w+e)
        + 2*(tmp[rowN+ip1] + tmp[rowN+im1] + tmp[rowS+ip1] + tmp[rowS+im1])
        + (tmp[rowC+ip2] + tmp[rowC+im2] + tmp[rowS2+i] + tmp[rowN2+i]);

      var v = c + visc*lap - hvisc*biharm;
      if (v > c+5) v = c+5; else if (v < c-5) v = c-5;   // safety clamp only
      buf[rowC+i] = isFinite(v) ? v : c;
    }
  }
}

// ── Wave color map (replicates Neurowave Lab h2c exactly) ─────────
function wsColorMap(n) {
  var h = Math.max(0, Math.min(1, n));
  if(!WS._color) WS._color = new THREE.Color();
  var c = WS._color;
  var mode = WS.colorMode;
  switch(mode) {
    case 'fire':
      if(h<.25){c.setRGB(h*4*.9, h*4*.04, 0);}
      else if(h<.5){var p=(h-.25)*4; c.setRGB(.9+p*.1, p*.65, 0);}
      else if(h<.75){var p=(h-.5)*4;  c.setRGB(1, .65+p*.3, p*.25);}
      else{var p=(h-.75)*4; c.setRGB(1, .95+p*.05, .25+p*.75);} break;
    case 'ice':
      if(h<.3){c.setHSL(.585,.85,h*.35);}
      else if(h<.7){var p=(h-.3)/.4; c.setHSL(.565+p*.04,.7+p*.3,.1+p*.52);}
      else{var p=(h-.7)/.3; c.setHSL(.52+p*.03,.4,.62+p*.35);} break;
    case 'plasma':
      var hue=.72+h*.28; if(hue>1)hue-=1;
      c.setHSL(hue,.92,.18+h*.62); break;
    case 'neon':
      if(h<.45){c.setHSL(.37,.9,.04+h*.56);}
      else{var p=(h-.45)/.55; c.setHSL(.52+p*.07,.95,.29+p*.5);} break;
    case 'custom':
      var lo=WS.customLow, mi=WS.customMid, hi=WS.customHigh, r,g,b;
      if(h<.5){var p=h*2; r=lo[0]+(mi[0]-lo[0])*p; g=lo[1]+(mi[1]-lo[1])*p; b=lo[2]+(mi[2]-lo[2])*p;}
      else{var p=(h-.5)*2; r=mi[0]+(hi[0]-mi[0])*p; g=mi[1]+(hi[1]-mi[1])*p; b=mi[2]+(hi[2]-mi[2])*p;}
      c.setRGB(Math.max(0,Math.min(1,r)),Math.max(0,Math.min(1,g)),Math.max(0,Math.min(1,b))); break;
    default: // spectrum
      var hue,lgt;
      if(h<.3){hue=.62;lgt=.26+h*.58;}
      else if(h<.5){hue=.56;lgt=.44+(h-.3)*.38;}
      else if(h<.7){hue=.79;lgt=.52+(h-.5)*.33;}
      else{hue=.93;lgt=.59+(h-.7)*.28;}
      c.setHSL(hue,.88,Math.min(.82,lgt));
  }
  return c;
}

// ── Wave equation compiler with prev(x,y) and noise3 ─────────────
function buildWaveEqFn(eq) {
  try {
    var fn = new Function(
      'x','y','t','d','prev','noise3','warpX','warpY',
      'sin','cos','tan','abs','sqrt','pow','floor','ceil','round','max','min','log','exp','PI',
      'fbm','ridge','noise','dist','warp',
      'return (' + eq + ');'
    );
    return function(x, y, t) {
      try {
        var d = Math.sqrt(x*x + y*y);
        var GRID = WS._GRID, s = WS._s, half = (GRID-1)*0.5;
        var prevFn = function(px, py) {
          if(!WS.feedbackEnabled || !WS._prevBuf) return 0;
          var ci = Math.round(px/(WS.spatialFreq*s) + half);
          var ri = Math.round(py/(WS.spatialFreq*s) + half);
          ci = Math.max(0,Math.min(GRID-1,ci));
          ri = Math.max(0,Math.min(GRID-1,ri));
          return WS._prevBuf[ri*GRID + ci] || 0;
        };
        var n3fn = function(a,b,tt){ return sn(a+Math.sin(tt)*.6, b+Math.cos(tt)*.6)*.7 + sn(a-tt*.4, b+tt*.35)*.3; };
        var v = fn(x,y,t,d,prevFn,n3fn,
          function(a,b,ss){ return a+Math.sin(b*(ss||1))*.8; },
          function(a,b,ss){ return b+Math.cos(a*(ss||1))*.8; },
          Math.sin,Math.cos,Math.tan,Math.abs,Math.sqrt,Math.pow,
          Math.floor,Math.ceil,Math.round,Math.max,Math.min,Math.log,Math.exp,Math.PI,
          function(a,b,o,r){ return fbmN(a,b,o,r); },
          function(a,b){ return ridgeN(a,b); },
          function(a,b){ return sn(a,b); },
          function(a,b,cx,cy){ return Math.sqrt(Math.pow(a-(cx||0),2)+Math.pow(b-(cy||0),2)); },
          function(a,b,ss){ return domWarp(a,b,ss||0.8); }
        );
        return isFinite(v) ? v : 0;
      } catch(e) { return 0; }
    };
  } catch(e) { return function(){ return 0; }; }
}

function waveCompileEq() {
  WS._eqFn  = buildWaveEqFn(WS.eq);
  WS._eq2Fn = WS.battleMode ? buildWaveEqFn(WS.eq2) : null;
  var i1 = document.getElementById('wl-eq');
  if(i1) i1.classList.toggle('err', !WS._eqFn);
}

// ── Water equation compiler — same helper surface as buildWaveEqFn ──

var WS_RIP_LIFE = 6.0;
function evalWaveRipples(ox, oy, t) {
  var rz = 0;
  for(var ri = 0; ri < WS.ripples.length; ri++) {
    var rp = WS.ripples[ri];
    var el = t - rp.st; if(el < 0 || el > WS_RIP_LIFE) continue;
    var rdx = ox - rp.x, rdy = oy - rp.y;
    var rd = Math.sqrt(rdx*rdx + rdy*rdy);
    var rv = rp.amp * Math.exp(-0.85*el) * Math.exp(-rp.sd*rd) * Math.sin(rd*rp.ff - el*3.2);
    if(rp.type === 'stabilize') rv *= -0.6;
    else if(rp.type === 'destroy') rv *= 1.8 * Math.sin(el*10);
    rz += rv;
  }
  return rz;
}
function addWaveRipple(wx, wy, type) {
  type = type || 'normal';
  var amp  = type==='amplify' ? 1.4 : type==='destroy' ? 1.8 : 0.75;
  var sd   = type==='stabilize' ? 0.35 : 0.65;
  var ff   = type==='resonate' ? 5.8 : 4.0;
  WS.ripples.push({x:wx, y:wy, st:gTime, amp:amp, sd:sd, ff:ff, type:type});
  if(WS.ripples.length > 24) WS.ripples.shift();
  var badge = document.getElementById('wl-rip-count');
  if(badge) badge.textContent = WS.ripples.length;
}
function clearWaveRipples() {
  WS.ripples.length = 0;
  var badge = document.getElementById('wl-rip-count');
  if(badge) badge.textContent = '0';
}

// ── Build / rebuild wave surface mesh ────────────────────────────
function buildWaveSimMesh(data) {
  if(WS._mesh){ scene.remove(WS._mesh); WS._mesh.geometry.dispose(); WS._mesh.material.dispose(); WS._mesh = null; }
  if(!data) return;
  var GRID = data.GRID, s = data.s, N = GRID*GRID;
  WS._GRID = GRID; WS._s = s;
  WS._buf     = new Float32Array(N);
  WS._prevBuf = new Float32Array(N);
  WS._smoothBuf = new Float32Array(N);
  WS.seaLevel = STATE.seaLevel;

  var geo = new THREE.BufferGeometry();
  var pos = new Float32Array(N*3);
  var col = new Float32Array(N*3);
  var half = (GRID-1)*0.5;
  for(var j=0;j<GRID;j++){for(var i=0;i<GRID;i++){
    var idx=j*GRID+i;
    pos[idx*3]=(i-half)*s; pos[idx*3+1]=STATE.seaLevel+WS.heightOffset; pos[idx*3+2]=(j-half)*s;
  }}
  var res=GRID-1, idxBuf=new Uint32Array(res*res*6), p=0;
  for(var j=0;j<res;j++){for(var i=0;i<res;i++){
    var a=j*GRID+i,b=a+1,c=a+GRID,d=c+1;
    idxBuf[p++]=a;idxBuf[p++]=c;idxBuf[p++]=b;idxBuf[p++]=b;idxBuf[p++]=c;idxBuf[p++]=d;
  }}
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('color',   new THREE.BufferAttribute(col,3));
  geo.setIndex(new THREE.BufferAttribute(idxBuf,1));
  var mat = new THREE.MeshPhongMaterial({
    vertexColors:true, transparent:true, opacity:WS.opacity,
    blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, shininess:140,
    toneMapped:false // data-visualization overlay — keep its heatmap colors exact
  });
  WS._mesh = new THREE.Mesh(geo, mat);
  WS._mesh.renderOrder = 3;
  WS._mesh.visible = WS.showSurface;
  scene.add(WS._mesh);
  waveCompileEq();
}

// ── Update wave surface each frame ────────────────────────────────
var _wsFrame = 0;
function updateWaveSimSurface(t) {
  if(!WS._mesh || !heightCache || !WS._eqFn) return;
  var GRID=WS._GRID, s=WS._s, N=GRID*GRID;
  var half=(GRID-1)*0.5, freq=WS.spatialFreq;
  var tEff=t*WS.speed+WS.phase, dmp=WS.damp;
  var buf=WS._buf, eqFn=WS._eqFn, eq2Fn=WS._eq2Fn;
  var posArr=WS._mesh.geometry.attributes.position.array;
  var colArr=WS._mesh.geometry.attributes.color.array;
  var wMin=Infinity, wMax=-Infinity, sumW=0, sumW2=0;

  for(var j=0;j<GRID;j++){for(var i=0;i<GRID;i++){
    var idx=j*GRID+i;
    var wx=(i-half)*s*freq, wy=(j-half)*s*freq;
    var z=eqFn(wx,wy,tEff);
    if(eq2Fn) z+=eq2Fn(wx,wy,tEff);
    if(dmp>0.0005) z*=Math.exp(-Math.sqrt(wx*wx+wy*wy)*dmp);
    z+=evalWaveRipples((i-half)*s,(j-half)*s,t);
    if(!isFinite(z))z=0;
    buf[idx]=z; sumW+=z; sumW2+=z*z;
    if(z<wMin)wMin=z; if(z>wMax)wMax=z;
  }}

  // ── Extreme-smooth pass: real ν∇²u − μ∇⁴u on the evaluated field ──
  // Turns whatever the eq/ripples produced into silky, big-eddy motion
  // instead of raw per-pixel noise — see applyHyperSmoothing() above.
  applyHyperSmoothing(buf, WS._smoothBuf, GRID, WS.viscosity, WS.hyperViscosity);
  // Recompute peak/min after smoothing so stats + colour mapping match
  // what's actually rendered.
  wMin=Infinity; wMax=-Infinity; sumW=0; sumW2=0;
  for(var k2=0;k2<N;k2++){ var zv=buf[k2]; sumW+=zv; sumW2+=zv*zv; if(zv<wMin)wMin=zv; if(zv>wMax)wMax=zv; }

  if(WS.feedbackEnabled) WS._prevBuf.set(buf);

  var wRng=wMax-wMin||1;
  var amp=WS.amplitude, hoff=WS.heightOffset, baseY=STATE.seaLevel+hoff;
  for(var j=0;j<GRID;j++){for(var i=0;i<GRID;i++){
    var idx=j*GRID+i;
    var wx=(i-half)*s, wy=(j-half)*s;
    posArr[idx*3]=wx; posArr[idx*3+1]=baseY+buf[idx]*amp; posArr[idx*3+2]=wy;
    var n=(buf[idx]-wMin)/wRng;
    var c=wsColorMap(n);
    colArr[idx*3]=c.r; colArr[idx*3+1]=c.g; colArr[idx*3+2]=c.b;
  }}
  WS._mesh.geometry.attributes.position.needsUpdate=true;
  WS._mesh.geometry.attributes.color.needsUpdate=true;
  WS._mesh.geometry.computeVertexNormals();

  // Update stats
  var mean=sumW/N, ss=0;
  for(var k=0;k<N;k++){var dv=buf[k]-mean;ss+=dv*dv;}
  var std=Math.sqrt(ss/N), rms=Math.sqrt(ss/N+mean*mean);
  var peak=Math.max(Math.abs(wMin),Math.abs(wMax));
  var sp=document.getElementById('wl-s-peak'); if(sp)sp.textContent='±'+peak.toFixed(2);
  var sr=document.getElementById('wl-s-rms');  if(sr)sr.textContent=rms.toFixed(3);
  var ss2=document.getElementById('wl-s-std'); if(ss2)ss2.textContent=std.toFixed(3);
}

// ── Canvas click → ripple placement via raycasting ────────────────
function initWaveRaycast() {
  WS._raycaster = new THREE.Raycaster();
  WS._mouse     = new THREE.Vector2();
  renderer.domElement.addEventListener('click', function(e) {
    var rect = renderer.domElement.getBoundingClientRect();
    WS._mouse.x = ((e.clientX-rect.left)/rect.width)*2-1;
    WS._mouse.y = -((e.clientY-rect.top)/rect.height)*2+1;
    WS._raycaster.setFromCamera(WS._mouse, camera);

    // ── Chaos Event spawn (terrain raycast) ──────────────────────
    if (CHAOS_EVENT_SPAWNING) {
      // Intersect actual terrain mesh first for accurate placement
      if (terrainMesh) {
        var hits = WS._raycaster.intersectObject(terrainMesh);
        if (hits.length > 0) {
          var pt = hits[0].point;
          spawnChaosEvent(CHAOS_EVENT_MODE, pt.x, pt.z);
          return;
        }
      }
      // Fallback: intersect horizontal plane at sea level
      var plane = new THREE.Plane(new THREE.Vector3(0,1,0), -STATE.seaLevel);
      var target = new THREE.Vector3();
      if (WS._raycaster.ray.intersectPlane(plane, target)) {
        spawnChaosEvent(CHAOS_EVENT_MODE, target.x, target.z);
      }
      return;
    }

    // ── Wave Lab ripple placement ─────────────────────────────────
    if (!WS.rippleMode) return;
    var plane = new THREE.Plane(new THREE.Vector3(0,1,0), -STATE.seaLevel);
    var target = new THREE.Vector3();
    if (WS._raycaster.ray.intersectPlane(plane, target)) {
      addWaveRipple(target.x, target.z, WS.rippleType);
      toast('Ripple', WS.rippleType+' emitter placed at ('+target.x.toFixed(1)+', '+target.z.toFixed(1)+')');
    }
  });
}

// ── Hex to [r,g,b] helper ─────────────────────────────────────────
function hexToRGB01ws(hex) {
  return [parseInt(hex.slice(1,3),16)/255, parseInt(hex.slice(3,5),16)/255, parseInt(hex.slice(5,7),16)/255];
}

// ── Bind Wave Lab controls ────────────────────────────────────────
function bindWaveLabControls() {

  // Show surface toggle
  var togShow=document.getElementById('tog-wl-show'), pillShow=document.getElementById('twls-tog');
  if(togShow){togShow.addEventListener('click',function(){ WS.showSurface=!WS.showSurface; if(WS._mesh)WS._mesh.visible=WS.showSurface; pillShow.classList.toggle('on',WS.showSurface); }); pillShow.classList.toggle('on',WS.showSurface); }

  // Feedback toggle
  var togFb=document.getElementById('tog-wl-fb'), pillFb=document.getElementById('twlf-tog');
  if(togFb){togFb.addEventListener('click',function(){ WS.feedbackEnabled=!WS.feedbackEnabled; pillFb.classList.toggle('on',WS.feedbackEnabled); if(!WS.feedbackEnabled&&WS._prevBuf)WS._prevBuf.fill(0); }); }

  // Battle mode
  var togBat=document.getElementById('tog-wl-battle'), pillBat=document.getElementById('twlb-tog');
  var battleRowEl=document.getElementById('wl-battle-row');
  if(togBat){togBat.addEventListener('click',function(){ WS.battleMode=!WS.battleMode; pillBat.classList.toggle('on',WS.battleMode); if(battleRowEl)battleRowEl.classList.toggle('show',WS.battleMode); waveCompileEq(); }); }

  // Equation inputs
  var eqEl=document.getElementById('wl-eq'), eq2El=document.getElementById('wl-eq2');
  if(eqEl){eqEl.addEventListener('input',function(){ WS.eq=eqEl.value.trim()||WS.eq; waveCompileEq(); }); eqEl.addEventListener('keydown',function(e){if(e.key==='Enter'){waveCompileEq();eqEl.blur();}}); }
  if(eq2El){eq2El.addEventListener('input',function(){ WS.eq2=eq2El.value.trim()||WS.eq2; waveCompileEq(); }); }

  // Preset selector
  var presetSel=document.getElementById('wl-preset');
  if(presetSel){presetSel.addEventListener('change',function(){ if(!presetSel.value)return; if(eqEl){eqEl.value=presetSel.value; WS.eq=presetSel.value; waveCompileEq();} presetSel.value=''; }); }

  // Parameter sliders
  var wlSliders=[
    ['sl-wl-amp','amplitude',1,'v-wl-amp'],['sl-wl-op','opacity',2,'v-wl-op'],
    ['sl-wl-hoff','heightOffset',1,'v-wl-hoff'],['sl-wl-freq','spatialFreq',2,'v-wl-freq'],
    ['sl-wl-speed','speed',2,'v-wl-speed'],['sl-wl-phase','phase',2,'v-wl-phase'],
    ['sl-wl-damp','damp',2,'v-wl-damp'],['sl-wl-arad','areaRadius',0,'v-wl-arad'],
    ['sl-wl-visc','viscosity',3,'v-wl-visc'],['sl-wl-hvisc','hyperViscosity',3,'v-wl-hvisc']
  ];
  wlSliders.forEach(function(row){
    var el=document.getElementById(row[0]); if(!el)return;
    el.addEventListener('input',function(){
      WS[row[1]]=parseFloat(el.value);
      var vEl=document.getElementById(row[3]); if(vEl)vEl.textContent=parseFloat(el.value).toFixed(row[2]);
      if(row[1]==='opacity'&&WS._mesh)WS._mesh.material.opacity=WS.opacity;
      if(row[1]==='areaRadius')CHAOS.areaRadius=WS.areaRadius;
    });
  });

  // Color palette buttons
  document.querySelectorAll('.wl-pal-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      WS.colorMode=btn.dataset.pal;
      document.querySelectorAll('.wl-pal-btn').forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      var cc=document.getElementById('wl-custom-colors');
      if(cc)cc.style.display=WS.colorMode==='custom'?'flex':'none';
    });
  });

  // Custom color pickers
  ['lo','mid','hi'].forEach(function(key,ki){
    var el=document.getElementById('wl-col-'+key); if(!el)return;
    el.addEventListener('input',function(){
      var rgb=hexToRGB01ws(el.value);
      if(ki===0)WS.customLow=rgb; else if(ki===1)WS.customMid=rgb; else WS.customHigh=rgb;
    });
  });

  // Ripple mode toggle
  var togRip=document.getElementById('tog-wl-rip'), pillRip=document.getElementById('twlr-tog');
  if(togRip){togRip.addEventListener('click',function(){ WS.rippleMode=!WS.rippleMode; pillRip.classList.toggle('on',WS.rippleMode); document.body.style.cursor=WS.rippleMode?'crosshair':'default'; }); }
  var clearRipBtn=document.getElementById('btn-wl-clearrip');
  if(clearRipBtn)clearRipBtn.addEventListener('click',clearWaveRipples);

  // Ripple type buttons
  document.querySelectorAll('.wl-rt-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      WS.rippleType=btn.dataset.rtype;
      document.querySelectorAll('.wl-rt-btn').forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
    });
  });

  // Impact coupling toggle
  var togCouple=document.getElementById('tog-wl-couple'), pillCouple=document.getElementById('twlc-tog');
  if(togCouple){togCouple.addEventListener('click',function(){ WS.coupled=!WS.coupled; pillCouple.classList.toggle('on',WS.coupled); CHAOS.useWaveLabBuf=WS.coupled; }); pillCouple.classList.toggle('on',WS.coupled); }

  // Impact map toggle
  var togImap=document.getElementById('tog-wl-imap'), pillImap=document.getElementById('twli-tog');
  if(togImap){togImap.addEventListener('click',function(){ WS.showImpact=!WS.showImpact; pillImap.classList.toggle('on',WS.showImpact); CHAOS.showOverlay=WS.showImpact; var po=document.getElementById('tco-tog'); if(po)po.classList.toggle('on',WS.showImpact); }); }

  // Sync areaRadius to CHAOS
  CHAOS.areaRadius = WS.areaRadius;
  CHAOS.useWaveLabBuf = WS.coupled;

  // Init raycasting
  initWaveRaycast();
  }
