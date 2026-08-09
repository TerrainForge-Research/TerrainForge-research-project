(function(){
  // 1. Block Ctrl+scroll (desktop wheel zoom)
  window.addEventListener('wheel', function(e){
    if(e.ctrlKey || e.metaKey){ e.preventDefault(); }
  }, {passive: false});

  // 2. Block Ctrl+= / Ctrl+- / Ctrl+0 keyboard zoom
  window.addEventListener('keydown', function(e){
    if((e.ctrlKey || e.metaKey) && (
      e.key === '=' || e.key === '+' || e.key === '-' ||
      e.key === '_' || e.key === '0' || e.key === 'Add' ||
      e.key === 'Subtract' || e.key === 'NumpadAdd' ||
      e.key === 'NumpadSubtract'
    )){
      e.preventDefault();
    }
  }, {passive: false});

  // 3. Block pinch-to-zoom on touch devices
  //    (belt-and-suspenders on top of the viewport meta tag,
  //     because some browsers still allow it)
  var _lastTouchDist = null;
  document.addEventListener('touchstart', function(e){
    if(e.touches.length > 1){ _lastTouchDist = null; }
  }, {passive: false});
  document.addEventListener('touchmove', function(e){
    if(e.touches.length > 1){
      // Two fingers — block pinch entirely
      e.preventDefault();
    }
  }, {passive: false});
  document.addEventListener('touchend', function(){
    _lastTouchDist = null;
  }, {passive: true});

  // 4. Block double-tap zoom (mobile Safari / Chrome)
  var _lastTap = 0;
  document.addEventListener('touchend', function(e){
    var now = Date.now();
    if(now - _lastTap < 300 && e.touches.length === 0){
      e.preventDefault();
    }
    _lastTap = now;
  }, {passive: false});
})();

