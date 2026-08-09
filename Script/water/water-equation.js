var waterEqFn = null;
var waterEqPrevBuf = null, waterEqBuf = null;
var waterEqGridN = 0, waterEqCellSize = 1;

// ── PLACEMENT MODE STATE (Blender-style interactive import) ──────
function buildWaterEqFn(eq) {
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
        var prevFn = function(px, py) {
          if(!waterEqPrevBuf) return 0;
          var GRIDW = waterEqGridN, cs = waterEqCellSize || 1, half = (GRIDW-1)*0.5;
          var ci = Math.round(px/cs + half);
          var ri = Math.round(py/cs + half);
          ci = Math.max(0,Math.min(GRIDW-1,ci));
          ri = Math.max(0,Math.min(GRIDW-1,ri));
          return waterEqPrevBuf[ri*GRIDW + ci] || 0;
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
  } catch(e) { return null; }
}

function waterEqCompile() {
  var fn = buildWaterEqFn(STATE.waterEq);
  var el = document.getElementById('water-eq');
  if(fn){ waterEqFn = fn; if(el) el.classList.remove('err'); }
  else if(el){ el.classList.add('err'); } // keep the last working fn running; just flag the typo
}

// ── Ripple contribution ───────────────────────────────────────────
function bindWaterEqControls() {
  var eqEl = document.getElementById('water-eq');
  var presetSel = document.getElementById('water-eq-preset');
  var togEl = document.getElementById('tog-water-eq'), pillEl = document.getElementById('tweq-tog');

  function setActive(on){
    STATE.waterEqOn = on;
    if(pillEl) pillEl.classList.toggle('on', on);
    if(eqEl) eqEl.disabled = !on;
  }

  if(togEl){ togEl.addEventListener('click', function(){ setActive(!STATE.waterEqOn); }); }
  setActive(STATE.waterEqOn); // reflect current (default: off) state in the UI

  if(eqEl){
    eqEl.addEventListener('input', function(){ STATE.waterEq = eqEl.value.trim() || STATE.waterEq; waterEqCompile(); });
    eqEl.addEventListener('keydown', function(e){ if(e.key==='Enter'){ waterEqCompile(); eqEl.blur(); } });
  }

  if(presetSel){
    presetSel.addEventListener('change', function(){
      if(!presetSel.value) return;
      if(eqEl) eqEl.value = presetSel.value;
      STATE.waterEq = presetSel.value;
      waterEqCompile();
      setActive(true); // picking a preset is an unambiguous "use this"
      presetSel.value = '';
    });
  }

  waterEqCompile(); // compile the default/current equation once up front
}

