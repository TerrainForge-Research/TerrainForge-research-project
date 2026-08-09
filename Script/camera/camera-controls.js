var mkGrp; // foliage group
var orb = {
  theta:-2.2, phi:1.0, radius:32, targetRadius:32,
  dragging:false, panning:false, autoRotate:true,
  tx:0, ty:0, tz:0,          // look-at / orbit target (pan offset)
  _hasInitCamera: false       // set true after first generate
};
var _mx=0,_my=0,_bx=0,_by=0;

// ── FPP MODE STATE ───────────────────────────────────────────────
function maxCamRadius(){
  return Math.max(80, Math.ceil(80*(STATE.mapArea||1.0)*(STATE.scale||1.0)));
}

// Pan camera target in screen-space plane
function doPan(dx, dy){
  var speed = orb.radius * 0.0018;
  // Right = perpendicular to view direction in XZ
  var rx = -Math.cos(orb.theta);
  var rz =  Math.sin(orb.theta);
  // Up = component of world-up minus view-forward projection
  var sp=Math.sin(orb.phi), cp=Math.cos(orb.phi);
  var ux = -cp*Math.sin(orb.theta);
  var uy =  sp;
  var uz = -cp*Math.cos(orb.theta);
  orb.tx += (rx*dx - ux*dy)*speed;
  orb.ty += uy*dy*speed;
  orb.tz += (rz*dx - uz*dy)*speed;
  applyCam();
}

// Fixed sun direction (unit vector) — position/shadow frustum are
// re-fitted to the current map size by updateSunShadowFrustum() below,
// but the *direction* the light comes from never changes.
function applyCam(){
  var sp=Math.sin(orb.phi), cp=Math.cos(orb.phi);
  var st=Math.sin(orb.theta), ct=Math.cos(orb.theta);
  var tx=orb.tx||0, ty=orb.ty||0, tz=orb.tz||0;
  camera.position.set(tx+orb.radius*sp*st, ty+orb.radius*cp, tz+orb.radius*sp*ct);
  camera.lookAt(tx, ty, tz);
}
function updateZoomLevel(){
  var el=$('zoom-level'); if(!el) return;
  var maxR=maxCamRadius();
  var pct=Math.round((1-(orb.targetRadius-8)/(maxR-8))*180+20);
  el.textContent=pct+'%';
}
function tcTogOff(){
  orb.autoRotate=false;
  var t=$('tc-tog');if(t)t.classList.remove('on');
}

