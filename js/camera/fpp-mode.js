
var fpp = {
  active: false,
  pos: null,           // THREE.Vector3 player world position
  yaw: 0,              // horizontal rotation (radians)
  pitch: 0,            // vertical rotation (clamped ±85°)
  velY: 0,             // vertical velocity (gravity + jump)
  onGround: false,
  speed: 7,            // world units/sec (walking)
  sprintMult: 2.4,     // multiplier when Shift held
  jumpVel: 5.5,        // initial upward velocity on jump
  gravity: 16,         // downward acceleration
  eyeHeight: 1.8,      // camera above terrain surface
  _savedOrb: null,     // saved orbit state restored on exit
  keys: {},            // currently pressed keys
  // Touch state
  touch: {
    joy:  { active:false, id:null, baseX:0, baseY:0, dx:0, dy:0 },
    look: { active:false, id:null, lastX:0, lastY:0 },
    sprintOn: false,
    jumpQueued: false
  }
};

// Dynamic zoom ceiling — grows with map area
function fppSampleHeight(wx, wz){
  if(!heightCache) return 0;
  var hmap=heightCache.hmap, GRID=heightCache.GRID, s=heightCache.s;
  var res=GRID-1;
  var meshScale=(STATE.scale||1.0)*(STATE.mapArea||1.0);
  var sScaled=s*meshScale;
  var half=res/2;
  var gi=wx/sScaled+half, gj=wz/sScaled+half;
  gi=Math.max(0,Math.min(res-0.001,gi));
  gj=Math.max(0,Math.min(res-0.001,gj));
  var ix=Math.floor(gi), iy=Math.floor(gj);
  var fx=gi-ix, fy=gj-iy;
  if(ix>=GRID-1) ix=GRID-2;
  if(iy>=GRID-1) iy=GRID-2;
  var h00=hmap[iy*GRID+ix], h10=hmap[iy*GRID+ix+1];
  var h01=hmap[(iy+1)*GRID+ix], h11=hmap[(iy+1)*GRID+ix+1];
  return h00*(1-fx)*(1-fy)+h10*fx*(1-fy)+h01*(1-fx)*fy+h11*fx*fy;
}

function fppTick(dt){
  if(!fpp.active||!fpp.pos) return;
  var keys=fpp.keys;
  var t=fpp.touch;

  // Sprint: keyboard Shift OR touch sprint toggle
  var sprint=(keys['shift']||keys['Shift']||t.sprintOn)?fpp.sprintMult:1.0;
  var spd=fpp.speed*sprint;

  // Movement vectors from yaw (looking direction)
  var fwdX=-Math.sin(fpp.yaw), fwdZ=-Math.cos(fpp.yaw);
  var rgtX= Math.cos(fpp.yaw), rgtZ=-Math.sin(fpp.yaw);
  var mx=0, mz=0;

  // Keyboard input
  if(keys['w']||keys['arrowup'])    { mx+=fwdX; mz+=fwdZ; }
  if(keys['s']||keys['arrowdown'])  { mx-=fwdX; mz-=fwdZ; }
  if(keys['a']||keys['arrowleft'])  { mx-=rgtX; mz-=rgtZ; }
  if(keys['d']||keys['arrowright']) { mx+=rgtX; mz+=rgtZ; }

  // Touch joystick input (blended with keyboard)
  if(t.joy.active){
    var jRadius=55; // half of 110px base
    var jx=Math.max(-1,Math.min(1, t.joy.dx/jRadius));
    var jy=Math.max(-1,Math.min(1, t.joy.dy/jRadius));
    mx+=fwdX*(-jy)+rgtX*jx;
    mz+=fwdZ*(-jy)+rgtZ*jx;
    // Auto-sprint when joystick pushed far (>75%)
    var jMag=Math.sqrt(jx*jx+jy*jy);
    if(jMag>0.75) sprint=fpp.sprintMult;
    spd=fpp.speed*sprint;
  }

  var len=Math.sqrt(mx*mx+mz*mz);
  if(len>0){ mx/=len; mz/=len; }
  fpp.pos.x+=mx*spd*dt;
  fpp.pos.z+=mz*spd*dt;

  // Jump: keyboard space OR touch jumpQueued
  if(((keys[' ']||keys['space'])||t.jumpQueued)&&fpp.onGround){
    fpp.velY=fpp.jumpVel; fpp.onGround=false;
    t.jumpQueued=false;
  } else { t.jumpQueued=false; }

  // Gravity
  fpp.velY-=fpp.gravity*dt;
  fpp.pos.y+=fpp.velY*dt;

  // Terrain floor collision
  var tH=fppSampleHeight(fpp.pos.x,fpp.pos.z);
  var floor=tH+fpp.eyeHeight;
  if(fpp.pos.y<=floor){
    fpp.pos.y=floor; fpp.velY=0; fpp.onGround=true;
  } else { fpp.onGround=false; }

  // Map boundary clamp
  var meshScale=(STATE.scale||1.0)*(STATE.mapArea||1.0);
  var half2=SURF*meshScale*0.48;
  fpp.pos.x=Math.max(-half2,Math.min(half2,fpp.pos.x));
  fpp.pos.z=Math.max(-half2,Math.min(half2,fpp.pos.z));

  // Apply FPP camera
  camera.position.copy(fpp.pos);
  camera.rotation.order='YXZ';
  camera.rotation.y=fpp.yaw;
  camera.rotation.x=fpp.pitch;
  camera.rotation.z=0;

  // Underwater tint
  var uw=$('fpp-underwater');
  if(uw) uw.style.display=(fpp.pos.y<STATE.seaLevel+0.8)?'block':'none';

  // Speed HUD
  var sh=$('fpp-speed-hud');
  if(sh){
    var terrainName = tH.toFixed(1)+'u';
    var depth = fpp.pos.y<STATE.seaLevel ? ' ·  🌊 underwater' : '';
    sh.innerHTML = (sprint>1?'⚡ Sprint':'🚶 Walk')+' &nbsp;·&nbsp; Elevation '+terrainName+depth+
      '<br>WASD · Space · Shift · <kbd style="color:var(--gr);background:rgba(94,240,138,.1);border:1px solid rgba(94,240,138,.3);border-radius:3px;padding:0 4px;font-family:var(--fm);font-size:8px">F</kbd> exit';
  }

  // Update touch joystick knob visual
  if(t.joy.active){
    var jRadius=55;
    var kx=Math.max(-jRadius,Math.min(jRadius,t.joy.dx));
    var ky=Math.max(-jRadius,Math.min(jRadius,t.joy.dy));
    var knob=$('fpp-joy-knob');
    if(knob) knob.style.transform='translate(calc(-50% + '+kx+'px), calc(-50% + '+ky+'px))';
  }
}

function enterFPP(){
  if(fpp.active) return;
  if(!heightCache){ toast('No Terrain','Generate a terrain first, then enter FPP mode.'); return; }
  if(coordMode) exitCoordMode();
  fpp.active=true;

  // Save full orbit state
  fpp._savedOrb={
    theta:orb.theta, phi:orb.phi,
    radius:orb.radius, targetRadius:orb.targetRadius,
    autoRotate:orb.autoRotate,
    tx:orb.tx, ty:orb.ty, tz:orb.tz
  };

  // Spawn player at center of terrain (or current orbit target) on terrain surface
  fpp.pos=new THREE.Vector3(orb.tx||0, 0, orb.tz||0);
  fpp.pos.y=fppSampleHeight(fpp.pos.x,fpp.pos.z)+fpp.eyeHeight;
  fpp.yaw=orb.theta+Math.PI; // face away from default camera angle
  fpp.pitch=0; fpp.velY=0; fpp.onGround=true; fpp.keys={};

  // Stop orbit auto-rotate
  orb.autoRotate=false;

  // Show FPP UI
  var crosshair=$('fpp-crosshair'), hint=$('fpp-hint');
  var exitPrompt=$('fpp-exit-prompt'), sh=$('fpp-speed-hud');
  var mobileUI=$('fpp-mobile-ui');
  if(crosshair) crosshair.style.display='block';
  if(sh) sh.style.display='block';
  if(exitPrompt) exitPrompt.style.display='block';
  // Show mobile controls on touch devices
  if(mobileUI){
    var isTouch=('ontouchstart' in window)||(navigator.maxTouchPoints>0);
    mobileUI.style.display=isTouch?'block':'none';
    // Reset touch joystick
    var base=$('fpp-joy-base'); if(base) base.style.display='none';
    var knob=$('fpp-joy-knob'); if(knob) knob.style.transform='translate(-50%,-50%)';
    var sprintBtn=$('fpp-sprint-btn'); if(sprintBtn) sprintBtn.classList.remove('sprint-on');
    fpp.touch={joy:{active:false,id:null,baseX:0,baseY:0,dx:0,dy:0},
               look:{active:false,id:null,lastX:0,lastY:0},
               sprintOn:false,jumpQueued:false};
  }
  if(hint){
    hint.style.display='block'; hint.style.opacity='1';
    setTimeout(function(){
      if(hint){ hint.style.opacity='0';
        setTimeout(function(){ if(hint&&fpp.active) hint.style.display='none'; },600);
      }
    },5500);
  }

  // Hide bottom panel + zoom buttons
  var ui=$('terrain-ui');
  if(ui) ui.classList.add('collapsed');
  var zb=$('zoom-btns'); if(zb) zb.style.visibility='hidden';
  var utog=$('utog'); if(utog) utog.style.visibility='hidden';
  var stats=$('terrain-stats'); if(stats) stats.style.visibility='hidden';

  // Button active state
  var btn=$('btn-fpp');
  if(btn){
    btn.classList.add('fpp-on');
    btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px"><circle cx="12" cy="12" r="3"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/></svg>Exit FPP';
  }

  // Pointer lock for mouse look
  renderer.domElement.requestPointerLock();
  document.body.style.cursor='none';
}

function exitFPP(){
  if(!fpp.active) return;
  fpp.active=false;
  fpp.keys={};

  // Restore orbit camera
  if(fpp._savedOrb){
    orb.theta=fpp._savedOrb.theta; orb.phi=fpp._savedOrb.phi;
    orb.radius=fpp._savedOrb.radius; orb.targetRadius=fpp._savedOrb.targetRadius;
    orb.autoRotate=fpp._savedOrb.autoRotate;
    orb.tx=fpp._savedOrb.tx; orb.ty=fpp._savedOrb.ty; orb.tz=fpp._savedOrb.tz;
  }
  camera.rotation.order='XYZ';
  camera.rotation.set(0,0,0);
  applyCam();

  // Hide FPP UI
  ['fpp-crosshair','fpp-underwater','fpp-hint','fpp-exit-prompt','fpp-speed-hud','fpp-mobile-ui'].forEach(function(id){
    var el=$(id); if(el) el.style.display='none';
  });

  // Restore main UI
  var zb=$('zoom-btns'); if(zb) zb.style.visibility='';
  var utog=$('utog'); if(utog) utog.style.visibility='';
  var stats=$('terrain-stats'); if(stats) stats.style.visibility='';

  // Button back to normal
  var btn=$('btn-fpp');
  if(btn){
    btn.classList.remove('fpp-on');
    btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>FPP View';
  }

  // Release pointer lock
  if(document.pointerLockElement) document.exitPointerLock();
  document.body.style.cursor='crosshair';
}

