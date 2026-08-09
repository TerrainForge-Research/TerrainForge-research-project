var _aexQuality = '480p';
var _aexFps = 30;
var _aexExporting = false;
var _aexCancelFlag = false;

var AEX_DIMS = {
  '360p': [640,  360],
  '480p': [854,  480],
  '720p': [1280, 720]
};

function openAnimExportModal(){
  var modal = $('anim-export-modal');
  if(!modal) return;
  // Reset to config view
  $('aex-settings').style.display = '';
  $('aex-progress-wrap').style.display = 'none';
  $('aex-start').disabled = false;
  $('aex-start').textContent = '';
  $('aex-start').innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export Video';
  $('aex-cancel').textContent = 'Cancel';
  _aexCancelFlag = false;
  _aexExporting = false;
  // Update KF info
  var totalFrames = Math.ceil(ANIM.duration * _aexFps);
  $('aex-kf-info').textContent =
    ANIM.keyframes.length+' keyframes · '+ANIM.duration+'s · ~'+totalFrames+' frames at '+_aexFps+' fps';
  // Sync selected tiles
  document.querySelectorAll('.aex-q-tile').forEach(function(t){
    t.classList.toggle('active', t.dataset.q === _aexQuality);
  });
  document.querySelectorAll('.aex-fps-btn').forEach(function(b){
    b.classList.toggle('active', parseInt(b.dataset.fps) === _aexFps);
  });
  modal.classList.add('open');
  // Detect best codec and show in modal
  var fmtLabel = $('aex-fmt-label');
  if(fmtLabel){
    var best = ['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(function(m){ return MediaRecorder.isTypeSupported(m); }) || 'video/webm';
    fmtLabel.textContent = best.indexOf('mp4') !== -1 ? 'MP4 (H.264)' : best.indexOf('vp9') !== -1 ? 'WebM (VP9)' : 'WebM (VP8)';
  }
}
function closeAnimExportModal(){
  var modal = $('anim-export-modal');
  if(modal) modal.classList.remove('open');
}

// Wire modal controls once DOM is ready
document.addEventListener('DOMContentLoaded', function(){
  // Quality tiles
  document.querySelectorAll('.aex-q-tile').forEach(function(tile){
    tile.addEventListener('click', function(){
      _aexQuality = tile.dataset.q;
      document.querySelectorAll('.aex-q-tile').forEach(function(t){t.classList.remove('active');});
      tile.classList.add('active');
      updateAexInfo();
    });
  });
  // FPS buttons
  document.querySelectorAll('.aex-fps-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      _aexFps = parseInt(btn.dataset.fps);
      document.querySelectorAll('.aex-fps-btn').forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      updateAexInfo();
    });
  });
  // Cancel
  var cancelBtn = $('aex-cancel');
  if(cancelBtn) cancelBtn.addEventListener('click', function(){
    if(_aexExporting){
      _aexCancelFlag = true;
    } else {
      closeAnimExportModal();
    }
  });
  // Start export
  var startBtn = $('aex-start');
  if(startBtn) startBtn.addEventListener('click', function(){
    if(!_aexExporting) runAnimExport();
  });
  // Click backdrop to close (only when not exporting)
  var modal = $('anim-export-modal');
  if(modal) modal.addEventListener('click', function(e){
    if(e.target === modal && !_aexExporting) closeAnimExportModal();
  });
});

function updateAexInfo(){
  var totalFrames = Math.ceil(ANIM.duration * _aexFps);
  var el = $('aex-kf-info');
  if(el) el.textContent =
    ANIM.keyframes.length+' keyframes · '+ANIM.duration+'s · ~'+totalFrames+' frames at '+_aexFps+' fps';
}

function setAexProgress(pct, label){
  var fill = $('aex-prog-fill');
  var lbl  = $('aex-prog-label');
  if(fill) fill.style.width = pct+'%';
  if(lbl)  lbl.textContent = label;
}

function runAnimExport(){
  if(ANIM.keyframes.length < 2){
    toast('Need Keyframes','Add at least 2 keyframes to export an animation.'); return;
  }
  _aexExporting = true;
  _aexCancelFlag = false;

  // Switch to progress UI
  $('aex-settings').style.display = 'none';
  $('aex-progress-wrap').style.display = 'flex';
  $('aex-start').disabled = true;
  $('aex-cancel').textContent = 'Stop';
  setAexProgress(0, 'Preparing renderer…');

  var dims = AEX_DIMS[_aexQuality] || AEX_DIMS['480p'];
  var W = dims[0], H = dims[1];
  var fps = _aexFps;
  var dur = ANIM.duration;
  var totalFrames = Math.ceil(dur * fps);
  var frameDelay = Math.round(1000 / fps); // ms per frame — paces encoder correctly

  // Save original renderer / camera state
  var origW = renderer.domElement.width;
  var origH = renderer.domElement.height;
  var origAspect = camera.aspect;
  var origPixelRatio = renderer.getPixelRatio();
  var origTime = ANIM.currentTime;
  var wasPlaying = ANIM.playing;
  if(wasPlaying) animPause();

  // Resize renderer to target quality
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, true);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();

  function restoreRenderer(){
    renderer.setSize(origW, origH, true);
    renderer.setPixelRatio(origPixelRatio);
    camera.aspect = origAspect;
    camera.updateProjectionMatrix();
    ANIM.currentTime = origTime;
    animUpdatePlayhead();
    animUpdateTimeDisplay();
    _aexExporting = false;
  }

  // Codec priority: MP4/H.264 → WebM VP9 → WebM VP8 → WebM baseline
  var mimeType, isMP4 = false;
  var candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  for(var ci=0; ci<candidates.length; ci++){
    if(MediaRecorder.isTypeSupported(candidates[ci])){
      mimeType = candidates[ci]; break;
    }
  }
  if(!mimeType){ mimeType = 'video/webm'; }
  isMP4 = mimeType.indexOf('mp4') !== -1;
  var ext = isMP4 ? 'mp4' : 'webm';

  // Lower bitrates: 720p=3.5Mbps, 480p=1.8Mbps, 360p=1Mbps
  var bitrate = (_aexQuality==='720p' ? 3.5 : _aexQuality==='480p' ? 1.8 : 1.0) * 1000000;

  var stream;
  try{
    stream = renderer.domElement.captureStream(fps);
  }catch(e){
    toast('Export Failed','canvas.captureStream() not supported in this browser.');
    restoreRenderer(); closeAnimExportModal(); return;
  }

  var chunks = [];
  var mr = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: bitrate });
  mr.ondataavailable = function(e){ if(e.data && e.data.size > 0) chunks.push(e.data); };
  mr.onstop = function(){
    restoreRenderer();
    if(_aexCancelFlag){
      setAexProgress(0,'Cancelled.');
      setTimeout(closeAnimExportModal, 800); return;
    }
    setAexProgress(100,'Saving file…');
    var blob = new Blob(chunks, {type: mimeType});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'terrain-animation-' + _aexQuality + '.' + ext;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    toast('Export Done','Saved as terrain-animation-'+_aexQuality+'.'+ext);
    setTimeout(closeAnimExportModal, 1200);
  };

  // Collect a chunk per frame so encoder stays ahead of renders
  mr.start(frameDelay);

  // Render frames paced with setTimeout (not rAF) so each frame
  // is fully captured by MediaRecorder before the next one renders
  var frame = 0;
  var exportDt = 1 / fps; // simulated time per frame
  function renderNextFrame(){
    if(_aexCancelFlag){ mr.stop(); return; }
    if(frame > totalFrames){ mr.stop(); return; }
    var t = Math.min((frame / totalFrames) * dur, dur);
    ANIM.currentTime = t;
    var s = animInterp(t);

    // Camera
    orb.theta = s.theta; orb.phi = s.phi;
    orb.radius = s.radius; orb.targetRadius = s.radius;
    applyCam();

    // Wave + chaos params
    animApplyWave(s);
    animApplyChaos(s);

    // Advance simulation time so chaos/wave evolve correctly per frame
    gTime += exportDt;

    // Tick chaos engine (same rate as live animate loop)
    if(CHAOS.enabled){
      CHAOS._frameCount++;
      if(CHAOS._frameCount % CHAOS.tickRate === 0) chaosTick();
    }

    // Update water surface
    if((_wFrame & 3) === 0) animateWater(gTime);
    if(WS._mesh && WS._GRID > 0 && (_wFrame & 1) === 0) updateWaveSimSurface(gTime);
    _wFrame++;

    renderer.render(scene, camera);
    var pct = Math.round((frame / totalFrames) * 100);
    setAexProgress(pct, 'Frame '+(frame+1)+' / '+(totalFrames+1)+' · '+pct+'%');
    frame++;
    setTimeout(renderNextFrame, frameDelay);
  }

  setTimeout(renderNextFrame, 150);
}
