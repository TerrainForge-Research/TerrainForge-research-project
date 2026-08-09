var ANIM = {
  keyframes: [],   // [{id,time,theta,phi,radius}]
  duration: 10,
  playing: false,
  recording: false,
  looping: true,
  currentTime: 0,
  selectedKfId: null,
  nextKfId: 0
};
var _animOpen = false;
var _animDragKf = null; // {id, tlRect, startX, startTime}
var _animScrub = false;
var _lastAnimErosion = -999; // tracks last erosion value that triggered a rebuild

/* ── open / close ── */
function animOpen(){
  _animOpen = true;
  $('anim-panel').style.display = 'flex';
  $('terrain-ui').style.display = 'none';
  $('utog').style.display = 'none';
  $('btn-animate').classList.add('active');
  animRenderTimeline();
}
function animClose(){
  animStop();
  _animOpen = false;
  $('anim-panel').style.display = 'none';
  $('terrain-ui').style.display = 'flex';
  $('utog').style.display = 'flex';
  $('btn-animate').classList.remove('active');
}

/* ── keyframes ── */
function animAddKF(){
  var kf = {
    id:ANIM.nextKfId++, time:ANIM.currentTime,
    // camera
    theta:orb.theta, phi:orb.phi, radius:orb.radius,
    // erosion
    erosion: STATE.erosion,
    erosionType: STATE.erosionType,
    // wave params (live — no rebuild needed)
    wsAmp:        WS.amplitude,
    wsOpacity:    WS.opacity,
    wsHoff:       WS.heightOffset,
    wsFreq:       WS.spatialFreq,
    wsSpeed:      WS.speed,
    wsPhase:      WS.phase,
    wsDamp:       WS.damp,
    // chaos engine params
    chaosEnabled:    CHAOS.enabled,
    chaosWaveScale:  CHAOS.waveScale,
    chaosWaveSpeed:  CHAOS.waveSpeed,
    chaosAlpha:      CHAOS.alpha,
    chaosBeta:       CHAOS.beta,
    chaosGamma:      CHAOS.gamma,
    chaosDelta:      CHAOS.delta,
    chaosCap:        CHAOS.cap
  };
  ANIM.keyframes = ANIM.keyframes.filter(function(k){return Math.abs(k.time-kf.time)>.08;});
  ANIM.keyframes.push(kf);
  ANIM.keyframes.sort(function(a,b){return a.time-b.time;});
  ANIM.selectedKfId = kf.id;
  animRenderTimeline();
  toast('Keyframe Added','Camera + erosion + wave + chaos state saved at '+kf.time.toFixed(2)+'s');
}
function animDelSelKF(){
  if(ANIM.selectedKfId===null){toast('No KF Selected','Click a keyframe diamond first.');return;}
  ANIM.keyframes = ANIM.keyframes.filter(function(k){return k.id!==ANIM.selectedKfId;});
  ANIM.selectedKfId = null;
  animRenderTimeline();
}

/* ── playback ── */
function animPlay(){
  if(ANIM.keyframes.length < 2){toast('Need Keyframes','Add at least 2 keyframes to play.');return;}
  ANIM.playing = true;
  ANIM.recording = false;
  $('anim-btn-rec').classList.remove('on');
  $('anim-btn-play').classList.add('on');
  $('anim-play-icon').innerHTML='<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>';
  $('anim-btn-play').childNodes[2].nodeValue=' Pause';
  orb.autoRotate = false;
  STATE.autoRotate = false;
  $('tc-tog').classList.remove('on');
}
function animPause(){
  ANIM.playing = false;
  $('anim-btn-play').classList.remove('on');
  $('anim-play-icon').innerHTML='<polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>';
  $('anim-btn-play').childNodes[2].nodeValue=' Play';
}
function animStop(){
  ANIM.playing = false;
  ANIM.recording = false;
  ANIM.currentTime = 0;
  _lastAnimErosion = -999;
  if($('anim-btn-play')){$('anim-btn-play').classList.remove('on');$('anim-play-icon').innerHTML='<polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>';try{$('anim-btn-play').childNodes[2].nodeValue=' Play';}catch(e){}}
  if($('anim-btn-rec')) $('anim-btn-rec').classList.remove('on');
  animUpdatePlayhead();
  animUpdateTimeDisplay();
}
function animToggleRecord(){
  ANIM.recording = !ANIM.recording;
  if(ANIM.recording){
    animPause();
    $('anim-btn-rec').classList.add('on');
    toast('Recording','Move camera freely — release to stamp a keyframe.');
  } else {
    $('anim-btn-rec').classList.remove('on');
  }
}
function animToggleLoop(){
  ANIM.looping = !ANIM.looping;
  $('anim-btn-loop').classList.toggle('on', ANIM.looping);
}

/* ── tick (called every frame) ── */
function animTick(dt){
  if(!_animOpen) return;
  if(ANIM.playing && ANIM.keyframes.length>=2){
    ANIM.currentTime += dt;
    if(ANIM.currentTime >= ANIM.duration){
      if(ANIM.looping){ ANIM.currentTime = ANIM.currentTime % ANIM.duration; }
      else { ANIM.currentTime = ANIM.duration; animPause(); }
    }
    var s = animInterp(ANIM.currentTime);
    // Camera
    orb.theta = s.theta; orb.phi = s.phi;
    orb.radius = s.radius; orb.targetRadius = s.radius;
    applyCam();
    // Wave params — live, no rebuild needed
    animApplyWave(s);
    // Chaos params — live interpolation
    animApplyChaos(s);
    // Erosion — rebuild terrain only when value shifts enough
    animApplyErosion(s);
    animUpdatePlayhead();
    animUpdateTimeDisplay();
    animScrollToPlayhead();
  }
}

function animApplyWave(s){
  if(s.wsAmp     !== undefined){ WS.amplitude    = s.wsAmp;     var el=$('sl-wl-amp');   if(el) el.value=s.wsAmp;     var vl=$('v-wl-amp');   if(vl) vl.textContent=s.wsAmp.toFixed(1); }
  if(s.wsOpacity !== undefined){ WS.opacity      = s.wsOpacity; var el=$('sl-wl-op');    if(el) el.value=s.wsOpacity; var vl=$('v-wl-op');    if(vl) vl.textContent=s.wsOpacity.toFixed(2); if(WS._mesh) WS._mesh.material.opacity=WS.opacity; }
  if(s.wsHoff    !== undefined){ WS.heightOffset = s.wsHoff;    var el=$('sl-wl-hoff');  if(el) el.value=s.wsHoff;    var vl=$('v-wl-hoff');  if(vl) vl.textContent=s.wsHoff.toFixed(1); }
  if(s.wsFreq    !== undefined){ WS.spatialFreq  = s.wsFreq;    var el=$('sl-wl-freq');  if(el) el.value=s.wsFreq;    var vl=$('v-wl-freq');  if(vl) vl.textContent=s.wsFreq.toFixed(2); }
  if(s.wsSpeed   !== undefined){ WS.speed        = s.wsSpeed;   var el=$('sl-wl-speed'); if(el) el.value=s.wsSpeed;   var vl=$('v-wl-speed'); if(vl) vl.textContent=s.wsSpeed.toFixed(2); }
  if(s.wsPhase   !== undefined){ WS.phase        = s.wsPhase;   var el=$('sl-wl-phase'); if(el) el.value=s.wsPhase;   var vl=$('v-wl-phase'); if(vl) vl.textContent=s.wsPhase.toFixed(2); }
  if(s.wsDamp    !== undefined){ WS.damp         = s.wsDamp;    var el=$('sl-wl-damp');  if(el) el.value=s.wsDamp;    var vl=$('v-wl-damp');  if(vl) vl.textContent=s.wsDamp.toFixed(2); }
}

function animApplyChaos(s){
  if(s.chaosEnabled === undefined) return;
  // Enable/disable chaos engine
  if(s.chaosEnabled !== CHAOS.enabled){
    setChaosEnabled(s.chaosEnabled);
    var pill = document.getElementById('tchaos-tog');
    if(pill) pill.classList.toggle('on', s.chaosEnabled);
  }
  if(!s.chaosEnabled) return;
  // Interpolate numeric chaos params live
  var sliderMap = [
    ['sl-c-wscale','chaosWaveScale','waveScale', 'v-c-wscale',2],
    ['sl-c-wspeed','chaosWaveSpeed','waveSpeed', 'v-c-wspeed',2],
    ['sl-c-alpha', 'chaosAlpha',   'alpha',      'v-c-alpha', 2],
    ['sl-c-beta',  'chaosBeta',    'beta',       'v-c-beta',  2],
    ['sl-c-gamma', 'chaosGamma',   'gamma',      'v-c-gamma', 2],
    ['sl-c-delta', 'chaosDelta',   'delta',      'v-c-delta', 2],
    ['sl-c-cap',   'chaosCap',     'cap',        'v-c-cap',   3]
  ];
  sliderMap.forEach(function(row){
    var val = s[row[1]];
    if(val === undefined) return;
    CHAOS[row[2]] = val;
    var sl = $(row[0]); if(sl) sl.value = val;
    var vl = $(row[3]); if(vl) vl.textContent = val.toFixed(row[4]);
  });
}

function animApplyErosion(s){
  if(s.erosion === undefined) return;
  var diff = Math.abs(s.erosion - _lastAnimErosion);
  if(diff < 0.04) return; // not enough change to justify a rebuild
  _lastAnimErosion = s.erosion;
  STATE.erosion = s.erosion;
  var sl=$('sl-ero'); if(sl) sl.value=s.erosion;
  var vl=$('v-ero');  if(vl) vl.textContent=s.erosion.toFixed(2);
  if(s.erosionType !== undefined && s.erosionType !== STATE.erosionType){
    STATE.erosionType = s.erosionType;
    // Sync erosion type button UI
    var btns=document.querySelectorAll('.ero-type-btn');
    btns.forEach(function(b){ b.classList.toggle('active', b.dataset.etype===s.erosionType); });
  }
  generate();
}

/* ── interpolation (smooth-step between adjacent keyframes) ── */
function animInterp(t){
  var kfs = ANIM.keyframes;
  function fullKf(k){ return {
    theta:k.theta, phi:k.phi, radius:k.radius,
    erosion:k.erosion, erosionType:k.erosionType,
    wsAmp:k.wsAmp, wsOpacity:k.wsOpacity, wsHoff:k.wsHoff,
    wsFreq:k.wsFreq, wsSpeed:k.wsSpeed, wsPhase:k.wsPhase, wsDamp:k.wsDamp,
    chaosEnabled:k.chaosEnabled, chaosWaveScale:k.chaosWaveScale, chaosWaveSpeed:k.chaosWaveSpeed,
    chaosAlpha:k.chaosAlpha, chaosBeta:k.chaosBeta, chaosGamma:k.chaosGamma, chaosDelta:k.chaosDelta, chaosCap:k.chaosCap
  }; }
  if(!kfs.length) return {theta:orb.theta, phi:orb.phi, radius:orb.radius};
  if(kfs.length===1) return fullKf(kfs[0]);
  if(t<=kfs[0].time) return fullKf(kfs[0]);
  var last=kfs[kfs.length-1];
  if(t>=last.time) return fullKf(last);
  var i=0;
  while(i<kfs.length-1 && kfs[i+1].time<=t) i++;
  var k0=kfs[i], k1=kfs[i+1];
  var a=(t-k0.time)/(k1.time-k0.time);
  a = a*a*(3-2*a); // smooth-step
  function lp(f0,f1){ return f0!==undefined&&f1!==undefined ? f0+(f1-f0)*a : (f0!==undefined?f0:f1); }
  return {
    theta:  lp(k0.theta,  k1.theta),
    phi:    lp(k0.phi,    k1.phi),
    radius: lp(k0.radius, k1.radius),
    erosion:     lp(k0.erosion,  k1.erosion),
    erosionType: a < 0.5 ? k0.erosionType : k1.erosionType,
    wsAmp:     lp(k0.wsAmp,     k1.wsAmp),
    wsOpacity: lp(k0.wsOpacity, k1.wsOpacity),
    wsHoff:    lp(k0.wsHoff,    k1.wsHoff),
    wsFreq:    lp(k0.wsFreq,    k1.wsFreq),
    wsSpeed:   lp(k0.wsSpeed,   k1.wsSpeed),
    wsPhase:   lp(k0.wsPhase,   k1.wsPhase),
    wsDamp:    lp(k0.wsDamp,    k1.wsDamp),
    // chaos — interpolate numeric params, use nearest for boolean
    chaosEnabled:    a < 0.5 ? k0.chaosEnabled    : k1.chaosEnabled,
    chaosWaveScale:  lp(k0.chaosWaveScale,  k1.chaosWaveScale),
    chaosWaveSpeed:  lp(k0.chaosWaveSpeed,  k1.chaosWaveSpeed),
    chaosAlpha:      lp(k0.chaosAlpha,      k1.chaosAlpha),
    chaosBeta:       lp(k0.chaosBeta,       k1.chaosBeta),
    chaosGamma:      lp(k0.chaosGamma,      k1.chaosGamma),
    chaosDelta:      lp(k0.chaosDelta,      k1.chaosDelta),
    chaosCap:        lp(k0.chaosCap,        k1.chaosCap)
  };
}

/* ── timeline rendering ── */
// px per second — keeps ticks readable at any duration
var _TLPX = 70; // 70px per second (comfortable on mobile)
var _animContentW = 0; // updated each render

function animGetContentW(dur){
  var wrap=$('anim-tl-wrap');
  var minW = wrap ? wrap.offsetWidth : 320;
  return Math.max(minW, dur * _TLPX);
}

function animRenderTimeline(){
  var ruler=$('anim-ruler'), track=$('anim-track');
  var inner=$('anim-tl-inner');
  var hint=$('anim-empty-hint');
  if(!ruler||!track||!inner) return;
  var dur=ANIM.duration;

  // Set content width (wider = more breathing room)
  var cw = animGetContentW(dur);
  _animContentW = cw;
  inner.style.width = cw + 'px';
  ruler.style.width = cw + 'px';
  track.style.width  = cw + 'px';

  // Ruler ticks — pick sensible interval based on duration
  ruler.innerHTML='';
  var majorInt, minorDiv;
  if(dur <= 10)      { majorInt=1;  minorDiv=4; }   // tick every 0.25s
  else if(dur <= 30) { majorInt=2;  minorDiv=4; }   // tick every 0.5s
  else if(dur <= 60) { majorInt=5;  minorDiv=5; }   // tick every 1s
  else               { majorInt=10; minorDiv=5; }

  var totalMinor = dur / (majorInt / minorDiv);
  var steps = Math.round(totalMinor);
  for(var i=0;i<=steps;i++){
    var t = (i/steps)*dur;
    var px = (t/dur)*cw;
    var isMajor = (i % minorDiv === 0);
    var el=document.createElement('div');
    el.className='ruler-tick '+(isMajor?'major':'minor');
    el.style.left = px.toFixed(1)+'px';
    if(isMajor){
      var lbl=document.createElement('div');
      lbl.className='ruler-lbl';
      lbl.textContent = t.toFixed(0)+'s';
      el.appendChild(lbl);
    }
    ruler.appendChild(el);
  }

  // Remove old KF markers (keep track-line, hint)
  track.querySelectorAll('.kf-marker').forEach(function(el){el.remove();});

  // KF markers — positioned in px
  ANIM.keyframes.forEach(function(kf){
    var px=(kf.time/dur)*cw;
    var m=document.createElement('div');
    m.className='kf-marker'+(ANIM.selectedKfId===kf.id?' sel':'');
    m.style.left=px.toFixed(1)+'px';
    m.title='T='+kf.time.toFixed(2)+'s  (drag to move)';
    m.dataset.kfid=kf.id;
    // Click to select
    m.addEventListener('mousedown',function(e){
      e.stopPropagation();
      ANIM.selectedKfId=kf.id;
      animRenderTimeline();
      var wrap=$('anim-tl-wrap');
      _animDragKf={id:kf.id, startX:e.clientX, startTime:kf.time, scrollAtStart:wrap?wrap.scrollLeft:0};
    });
    m.addEventListener('dblclick',function(e){
      e.stopPropagation();
      ANIM.currentTime=kf.time;
      var cam=animInterp(kf.time);
      orb.theta=cam.theta;orb.phi=cam.phi;orb.radius=cam.radius;orb.targetRadius=cam.radius;applyCam();
      animUpdatePlayhead();animUpdateTimeDisplay();
    });
    track.appendChild(m);
  });

  // Show/hide empty hint
  if(hint) hint.style.display=ANIM.keyframes.length?'none':'flex';

  // Update KF count badge
  var badge=$('anim-kf-count');
  if(badge) badge.textContent=ANIM.keyframes.length+' KF';

  animUpdatePlayhead();
  animUpdateTimeDisplay();
}

function animUpdatePlayhead(){
  var ph=$('anim-playhead');
  if(!ph) return;
  var cw = _animContentW || animGetContentW(ANIM.duration);
  var px = (ANIM.currentTime / Math.max(.001, ANIM.duration)) * cw;
  ph.style.left = px.toFixed(1) + 'px';
}

// Auto-scroll so the playhead stays visible during playback
function animScrollToPlayhead(){
  var wrap=$('anim-tl-wrap');
  if(!wrap) return;
  var cw = _animContentW || animGetContentW(ANIM.duration);
  var phPx = (ANIM.currentTime / Math.max(.001, ANIM.duration)) * cw;
  var vpW = wrap.offsetWidth;
  var sl = wrap.scrollLeft;
  var margin = vpW * 0.25;
  if(phPx < sl + margin){
    wrap.scrollLeft = Math.max(0, phPx - margin);
  } else if(phPx > sl + vpW - margin){
    wrap.scrollLeft = phPx - vpW + margin;
  }
}
function animUpdateTimeDisplay(){
  var el=$('anim-time-display');
  if(el) el.textContent=ANIM.currentTime.toFixed(2)+'s';
}

/* ── timeline mouse interactions ── */
function animTlScrubTo(clientX){
  var wrap=$('anim-tl-wrap');
  if(!wrap) return;
  var r=wrap.getBoundingClientRect();
  var cw = _animContentW || animGetContentW(ANIM.duration);
  // clientX relative to content (viewport left + current scroll)
  var x = (clientX - r.left) + wrap.scrollLeft;
  var pct=Math.max(0,Math.min(1, x / cw));
  ANIM.currentTime=pct*ANIM.duration;
  if(!ANIM.playing){
    var cam=animInterp(ANIM.currentTime);
    orb.theta=cam.theta;orb.phi=cam.phi;
    orb.radius=cam.radius;orb.targetRadius=cam.radius;applyCam();
  }
  animUpdatePlayhead();animUpdateTimeDisplay();
}

function animBindTimelineEvents(){
  var wrap=$('anim-tl-wrap');
  if(!wrap) return;

  // ── shared drag/scrub logic ───────────────────────────────────
  function startScrub(clientX){
    _animScrub=true;
    animTlScrubTo(clientX);
  }
  function moveScrub(clientX){
    if(_animScrub){ animTlScrubTo(clientX); return; }
    if(_animDragKf) moveDragKf(clientX);
  }
  function endScrub(){
    _animScrub=false;
    _animDragKf=null;
  }

  function startDragKf(kfId,clientX,startTime){
    var wrap=$('anim-tl-wrap');
    _animDragKf={id:kfId, startX:clientX, startTime:startTime, scrollAtStart:wrap?wrap.scrollLeft:0};
  }
  function moveDragKf(clientX){
    if(!_animDragKf) return;
    var dur=ANIM.duration;
    var cw = _animContentW || animGetContentW(dur);
    var dx=clientX-_animDragKf.startX;
    var newTime=Math.max(0,Math.min(dur,_animDragKf.startTime+(dx/cw)*dur));
    for(var i=0;i<ANIM.keyframes.length;i++){
      if(ANIM.keyframes[i].id===_animDragKf.id){ ANIM.keyframes[i].time=newTime; break; }
    }
    ANIM.keyframes.sort(function(a,b){return a.time-b.time;});
    animRenderTimeline();
  }

  // ── MOUSE events ──────────────────────────────────────────────
  wrap.addEventListener('mousedown',function(e){
    if(e.target.classList.contains('kf-marker')) return;
    startScrub(e.clientX);
  });
  document.addEventListener('mousemove',function(e){
    moveScrub(e.clientX);
  });
  document.addEventListener('mouseup',function(){
    endScrub();
  });

  // ── TOUCH events ──────────────────────────────────────────────
  // Ruler touch → always scrub (prevents accidental scroll on ruler)
  var ruler=$('anim-ruler');
  var _touchScrub=false, _touchSX=0, _touchSY=0;

  if(ruler){
    ruler.addEventListener('touchstart',function(e){
      e.preventDefault();
      _touchScrub=true; _animScrub=true;
      var t=e.touches[0]; _touchSX=t.clientX; _touchSY=t.clientY;
      animTlScrubTo(t.clientX);
    },{passive:false});
  }

  // Track touch → scroll naturally; tap = scrub; KF touch = drag KF
  var track=$('anim-track');
  if(track){
    track.addEventListener('touchstart',function(e){
      if(e.target.classList.contains('kf-marker')){
        e.preventDefault(); e.stopPropagation();
        var kfId=parseInt(e.target.dataset.kfid);
        var kf=ANIM.keyframes.find(function(k){return k.id===kfId;});
        if(!kf) return;
        ANIM.selectedKfId=kfId;
        animRenderTimeline();
        startDragKf(kfId,e.touches[0].clientX,kf.time);
        return;
      }
      var t=e.touches[0]; _touchSX=t.clientX; _touchSY=t.clientY;
    },{passive:true});

    track.addEventListener('touchmove',function(e){
      if(_animDragKf){ e.preventDefault(); moveDragKf(e.touches[0].clientX); }
    },{passive:false});

    track.addEventListener('touchend',function(e){
      if(_animDragKf){ endScrub(); return; }
      // Short tap = scrub to position
      var t=e.changedTouches[0];
      if(Math.abs(t.clientX-_touchSX)<8 && Math.abs(t.clientY-_touchSY)<8){
        animTlScrubTo(t.clientX);
      }
    },{passive:true});
  }

  // Global move/end for ruler scrub
  document.addEventListener('touchmove',function(e){
    if(_touchScrub){ e.preventDefault(); animTlScrubTo(e.touches[0].clientX); }
  },{passive:false});
  document.addEventListener('touchend',function(){
    if(_touchScrub){ _touchScrub=false; _animScrub=false; }
    if(_animDragKf) endScrub();
  },{passive:true});

  // ── Keyboard: Delete selected KF ─────────────────────────────
  window.addEventListener('keydown',function(e){
    if(!_animOpen) return;
    var act=document.activeElement;
    if(act&&(act.tagName==='INPUT'||act.tagName==='TEXTAREA'||act.tagName==='SELECT')) return;
    if((e.key==='Delete'||e.key==='Backspace')&&ANIM.selectedKfId!==null){
      e.preventDefault(); animDelSelKF();
    }
  });
}


/* ── save / restore ── */
function animCaptureData(){
  return {keyframes:JSON.parse(JSON.stringify(ANIM.keyframes)),
          duration:ANIM.duration, looping:ANIM.looping,
          nextKfId:ANIM.nextKfId};
}
function animRestoreData(data){
  if(!data) return;
  ANIM.keyframes=data.keyframes||[];
  ANIM.duration=data.duration||10;
  ANIM.looping=(data.looping!==undefined)?data.looping:true;
  ANIM.nextKfId=data.nextKfId||ANIM.keyframes.length;
  ANIM.playing=false; ANIM.recording=false; ANIM.currentTime=0; ANIM.selectedKfId=null;
  // Sync duration selector
  var sel=$('anim-dur-sel');
  if(sel) sel.value=String(ANIM.duration);
  var loopBtn=$('anim-btn-loop');
  if(loopBtn) loopBtn.classList.toggle('on',ANIM.looping);
  animRenderTimeline();
}

// ── ANIMATION EVENT BINDINGS ─────────────────────────────────────
function bindAnimEvents(){
  // "Show Normals" toggle
  tog('tog-normals','tn-tog','showNormals',function(on){
    if(!terrainMesh) return;
    if(on){
      if(!_normalMat) _normalMat = new THREE.MeshNormalMaterial({side:THREE.DoubleSide, toneMapped:false});
      _savedMat = terrainMesh.material;
      terrainMesh.material = _normalMat;
    } else {
      if(_savedMat) terrainMesh.material = _savedMat;
    }
  });

  // Animate button in stats panel
  $('btn-animate').addEventListener('click',function(){
    if(_animOpen) animClose(); else animOpen();
  });

  // Coordinates / Inspector mode button
  $('btn-coords').addEventListener('click',function(){
    if(coordMode){ exitCoordMode(); }
    else { enterCoordMode(); $('btn-coords').classList.add('active'); }
  });
  $('coord-exit').addEventListener('click', exitCoordMode);

  // Docs & Roadmap collapsible section in Info panel
  $('info-docs-toggle').addEventListener('click',function(){
    var body=$('info-docs-body');
    var open=body.style.display!=='none';
    body.style.display=open?'none':'flex';
    this.classList.toggle('open',!open);
    if(!open) updateDocsTab();
  });

  // Anim toolbar buttons
  $('anim-btn-rec').addEventListener('click', animToggleRecord);
  $('anim-btn-add-kf').addEventListener('click', animAddKF);
  $('anim-btn-del-kf').addEventListener('click', animDelSelKF);
  $('anim-btn-start').addEventListener('click',function(){
    ANIM.currentTime=0;
    if(!ANIM.playing){
      var cam=animInterp(0);
      orb.theta=cam.theta;orb.phi=cam.phi;orb.radius=cam.radius;orb.targetRadius=cam.radius;applyCam();
    }
    animUpdatePlayhead();animUpdateTimeDisplay();
  });
  $('anim-btn-play').addEventListener('click',function(){
    if(ANIM.playing) animPause(); else animPlay();
  });
  $('anim-btn-stop').addEventListener('click', animStop);
  $('anim-btn-loop').addEventListener('click', animToggleLoop);
  $('anim-btn-close').addEventListener('click', animClose);

  // Duration selector
  $('anim-dur-sel').addEventListener('change',function(){
    ANIM.duration=parseInt(this.value)||10;
    // Clamp all keyframe times
    ANIM.keyframes.forEach(function(k){ if(k.time>ANIM.duration) k.time=ANIM.duration; });
    ANIM.currentTime=Math.min(ANIM.currentTime,ANIM.duration);
    animRenderTimeline();
  });

  // Loop button initial state
  $('anim-btn-loop').classList.toggle('on', ANIM.looping);

  // Timeline mouse interactions
  animBindTimelineEvents();
}



