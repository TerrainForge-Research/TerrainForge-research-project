var CHAOS_EVENTS     = [];
var CHAOS_EVENT_MODE = 'cyclone';
var CHAOS_EVENT_SPAWNING = false;

var CHAOS_EVENT_DEFS = {
  cyclone: {
    label:'Cyclone', color:'#c084fc', duration:90,
    water: function(ev, ox, oz, t) {
      var el = t - ev.t0; if (el<0||el>ev.duration) return 0;
      var decay = Math.max(0, 1.0 - el/ev.duration);
      var dx=ox-ev.wx, dz=oz-ev.wz;
      var r=Math.sqrt(dx*dx+dz*dz);
      var angle=Math.atan2(dz,dx);
      var spiral = Math.sin(r*1.2 - el*3.0 + angle*2.5) * decay;
      var eyeR = 3.5 + el*0.15;
      var ring  = Math.exp(-Math.pow(r-eyeR,2)*0.18) * Math.sin(r*2.5-el*5.0+angle*3) * decay;
      var eye   = r < 1.5 ? -0.4*Math.exp(-r*1.5)*decay : 0;
      return ev.strength * (spiral*0.8 + ring*1.6 + eye);
    },
    chaos: function(ev, wx, wz, t) {
      var el = t - ev.t0; if (el<0||el>ev.duration) return 0;
      var decay = Math.max(0, 1.0 - el/ev.duration);
      var dx=wx-ev.wx, dz=wz-ev.wz;
      var r=Math.sqrt(dx*dx+dz*dz);
      var angle=Math.atan2(dz,dx);
      var eyeR = 3.5 + el*0.15;
      var wallEro = Math.exp(-Math.pow(r-eyeR,2)*0.22) * 1.8 * decay;
      var armEro  = Math.abs(Math.sin(r*1.2 - el*3.0 + angle*2.5)) * 0.7 * decay * Math.exp(-r*0.08);
      return ev.strength * (wallEro + armEro);
    }
  },
  impact: {
    label:'Impact', color:'#f04466', duration:14,
    water: function(ev, ox, oz, t) {
      var el = t - ev.t0; if (el<0||el>ev.duration) return 0;
      var dx=ox-ev.wx, dz=oz-ev.wz;
      var r=Math.sqrt(dx*dx+dz*dz);
      var front = el * 3.8;
      var pulse = Math.exp(-Math.pow(r-front,2)*0.9) * Math.exp(-el*0.28) * 2.5;
      var ring2 = Math.exp(-Math.pow(r-front*0.6,2)*1.8) * Math.exp(-el*0.55) * 0.9;
      var crater = r<2.0 ? -Math.exp(-r*1.4)*Math.exp(-el*1.5)*1.8 : 0;
      return ev.strength * (pulse + ring2 + crater);
    },
    chaos: function(ev, wx, wz, t) {
      var el = t - ev.t0; if (el<0||el>ev.duration) return 0;
      var dx=wx-ev.wx, dz=wz-ev.wz;
      var r=Math.sqrt(dx*dx+dz*dz);
      var blast = r<2.5 ? ev.strength*4.5*Math.exp(-r*1.0)*Math.exp(-el*2.2) : 0;
      var ring  = Math.exp(-Math.pow(r - el*2.8, 2)*0.7) * ev.strength * 1.8 * Math.exp(-el*0.45);
      return blast + ring;
    }
  },
  tsunami: {
    label:'Tsunami', color:'#eebb55', duration:30,
    water: function(ev, ox, oz, t) {
      var el = t - ev.t0; if (el<0||el>ev.duration) return 0;
      var decay = Math.max(0, 1.0 - el/ev.duration);
      var relX = (ox - ev.wx) + el * 5.5;
      var relZ = oz - ev.wz;
      var envZ = Math.exp(-relZ*relZ*0.06);
      var leading = Math.exp(-Math.pow(relX - 7, 2)*0.035) * 4.5;
      var body    = Math.sin(relX * 0.65) * Math.exp(-Math.pow(relX,2)*0.003) * 2.0;
      return ev.strength * (leading + body) * envZ * decay;
    },
    chaos: function(ev, wx, wz, t) {
      var el = t - ev.t0; if (el<0||el>ev.duration) return 0;
      var decay = Math.max(0, 1.0 - el/ev.duration);
      var relX = (wx - ev.wx) + el * 4.0;
      var relZ = wz - ev.wz;
      var shoaling = Math.exp(-Math.pow(relX - 9, 2)*0.18) * 3.5;
      var envZ = Math.exp(-relZ*relZ*0.08);
      return ev.strength * shoaling * envZ * decay;
    }
  },
  resonance: {
    label:'Resonance', color:'#44ddaa', duration:65,
    water: function(ev, ox, oz, t) {
      var el = t - ev.t0; if (el<0||el>ev.duration) return 0;
      var dx=ox-ev.wx, dz=oz-ev.wz;
      var r=Math.sqrt(dx*dx+dz*dz);
      var build = Math.min(1.0, el*0.18);
      var decay = el > ev.duration*0.72 ? 1.0-(el-ev.duration*0.72)/(ev.duration*0.28) : 1.0;
      var k=2.4, omega=4.8;
      var standing = Math.sin(k*r) * Math.cos(omega*el);
      var mode2 = Math.sin(k*1.62*r) * Math.cos(omega*1.38*el) * 0.4;
      return ev.strength * (standing+mode2) * build * decay * Math.exp(-r*0.07);
    },
    chaos: function(ev, wx, wz, t) {
      var el = t - ev.t0; if (el<0||el>ev.duration) return 0;
      var dx=wx-ev.wx, dz=wz-ev.wz;
      var r=Math.sqrt(dx*dx+dz*dz);
      var build = Math.min(1.0, el*0.12);
      var decay = el > ev.duration*0.72 ? 1.0-(el-ev.duration*0.72)/(ev.duration*0.28) : 1.0;
      var k=2.4;
      var antinode = Math.abs(Math.sin(k*r));
      return ev.strength * antinode*antinode * 1.2 * build * decay * Math.exp(-r*0.09);
    }
  },
  standing: {
    label:'Standing Wave', color:'#58c8f8', duration:50,
    water: function(ev, ox, oz, t) {
      var el = t - ev.t0; if (el<0||el>ev.duration) return 0;
      var dx=ox-ev.wx, dz=oz-ev.wz;
      var r=Math.sqrt(dx*dx+dz*dz);
      var decay = Math.max(0, 1.0 - el/ev.duration);
      var k=1.55, omega=3.1;
      var amp = (Math.sin(k*dx)*Math.cos(omega*el) + Math.sin(k*dz)*Math.cos(omega*el*0.94)) * 0.5;
      var diagK = k * 1.414;
      var diag  = Math.sin(diagK*(dx+dz)*0.707) * Math.cos(omega*1.18*el) * 0.32;
      return ev.strength * (amp + diag) * Math.exp(-r*0.055) * decay;
    },
    chaos: function(ev, wx, wz, t) {
      var el = t - ev.t0; if (el<0||el>ev.duration) return 0;
      var dx=wx-ev.wx, dz=wz-ev.wz;
      var r=Math.sqrt(dx*dx+dz*dz);
      var decay = Math.max(0, 1.0 - el/ev.duration);
      var k=1.55;
      var nx = Math.abs(Math.sin(k*dx));
      var nz = Math.abs(Math.sin(k*dz));
      return ev.strength * nx*nz * 1.0 * decay * Math.exp(-r*0.07);
    }
  }
};

function evalChaosEventWater(ev, ox, oz, t) {
  var def = CHAOS_EVENT_DEFS[ev.type];
  return (def && def.water) ? def.water(ev, ox, oz, t) : 0;
}
function evalChaosEventChaos(ev, wx, wz, t) {
  var def = CHAOS_EVENT_DEFS[ev.type];
  return (def && def.chaos) ? def.chaos(ev, wx, wz, t) : 0;
}

function spawnChaosEvent(type, wx, wz) {
  var def = CHAOS_EVENT_DEFS[type];
  if (!def) return;
  if (!CHAOS.enabled) {
    setChaosEnabled(true);
    var pill = document.getElementById('tchaos-tog');
    if (pill) pill.classList.add('on');
  }
  var ev = { type:type, wx:wx, wz:wz, t0:gTime, duration:def.duration, strength:1.0 };
  CHAOS_EVENTS.push(ev);
  updateChaosEventUI();
  addChaosEventLog(ev, wx, wz);
  toast(def.label + ' Spawned', 'Field injector active for ' + def.duration + 's at (' + wx.toFixed(1) + ', ' + wz.toFixed(1) + ')');
}

function purgeChaosEvents() {
  var now = gTime;
  for (var i = CHAOS_EVENTS.length-1; i >= 0; i--) {
    if ((now - CHAOS_EVENTS[i].t0) >= CHAOS_EVENTS[i].duration) CHAOS_EVENTS.splice(i, 1);
  }
}

function clearChaosEvents() {
  CHAOS_EVENTS.length = 0;
  updateChaosEventUI();
  var log = document.getElementById('cevt-log');
  if (log) log.innerHTML = '<span style="color:rgba(255,255,255,.2)">No events yet \u2014 spawn one above</span>';
  toast('Events Cleared', 'All field injectors removed.');
}

function updateChaosEventUI() {
  purgeChaosEvents();
  var el = document.getElementById('cevt-count');
  if (el) el.textContent = CHAOS_EVENTS.length + ' active';
}

function addChaosEventLog(ev, wx, wz) {
  var log = document.getElementById('cevt-log');
  if (!log) return;
  var def = CHAOS_EVENT_DEFS[ev.type];
  var placeholder = log.querySelector('span');
  if (placeholder) placeholder.remove();
  var entry = document.createElement('div');
  entry.className = 'cevt-log-entry';
  entry.innerHTML = '<span class="cevt-log-type" style="color:' + (def?def.color:'#fff') + '">' +
    (def?def.label:ev.type) + '</span>' +
    '<span class="cevt-log-pos">' + wx.toFixed(1) + ', ' + wz.toFixed(1) + ' \u2014 ' + ev.duration + 's</span>';
  log.insertBefore(entry, log.firstChild);
  while (log.children.length > 8) log.removeChild(log.lastChild);
}

function bindChaosEventControls() {
  document.querySelectorAll('.cevt-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      CHAOS_EVENT_MODE = btn.dataset.cevt;
      document.querySelectorAll('.cevt-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });
  var spawnBtn = document.getElementById('cevt-spawn-toggle');
  if (spawnBtn) {
    spawnBtn.addEventListener('click', function() {
      CHAOS_EVENT_SPAWNING = !CHAOS_EVENT_SPAWNING;
      spawnBtn.classList.toggle('spawning', CHAOS_EVENT_SPAWNING);
      spawnBtn.innerHTML = CHAOS_EVENT_SPAWNING
        ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>\u00a0Spawn Mode ON \u2014 Click Terrain'
        : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>\u00a0Enable Spawn Mode';
      if (!CHAOS_EVENT_SPAWNING && !WS.rippleMode) document.body.style.cursor = 'crosshair';
    });
  }
  var clearBtn = document.getElementById('cevt-clear');
  if (clearBtn) clearBtn.addEventListener('click', clearChaosEvents);
  setInterval(function() { if (CHAOS_EVENTS.length > 0) updateChaosEventUI(); }, 2000);
}

// ── ANIMATION LOOP ───────────────────────────────────────────────

