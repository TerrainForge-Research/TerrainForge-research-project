var coordMode = false;
var coordRaycaster, coordMouse;
function enterCoordMode(){
  if(coordMode) return;
  if(fpp.active){ toast('Exit FPP First','Coordinates mode is unavailable while in First-Person View.'); return; }
  coordMode = true;

  // Hide every control panel
  var ui=$('terrain-ui'); if(ui) ui.classList.add('collapsed');
  var stats=$('terrain-stats'); if(stats) stats.style.visibility='hidden';
  var topbar=$('viz-topbar'); if(topbar) topbar.style.visibility='hidden';
  var utog=$('utog'); if(utog) utog.style.visibility='hidden';
  var zb=$('zoom-btns'); if(zb) zb.style.visibility='hidden';

  // Show inspector HUD
  var hud=$('coord-hud'); if(hud) hud.classList.add('open');

  // Lazily set up raycaster for click-to-inspect
  if(!coordRaycaster){
    coordRaycaster = new THREE.Raycaster();
    coordMouse = new THREE.Vector2();
  }
  renderer.domElement.addEventListener('click', onCoordClick);

  updateCoordInfo();
}

function exitCoordMode(){
  if(!coordMode) return;
  coordMode = false;

  var ui=$('terrain-ui'); if(ui) ui.classList.remove('collapsed');
  var stats=$('terrain-stats'); if(stats) stats.style.visibility='';
  var topbar=$('viz-topbar'); if(topbar) topbar.style.visibility='';
  var utog=$('utog'); if(utog) utog.style.visibility='';
  var zb=$('zoom-btns'); if(zb) zb.style.visibility='';

  var hud=$('coord-hud'); if(hud) hud.classList.remove('open');
  renderer.domElement.removeEventListener('click', onCoordClick);

  var btn=$('btn-coords'); if(btn) btn.classList.remove('active');
}

// Click-to-inspect: raycast against the terrain mesh and report the
// world-space X / Y / Z of the point under the cursor / finger
function onCoordClick(e){
  if(!coordMode || !terrainMesh) return;
  var rect = renderer.domElement.getBoundingClientRect();
  coordMouse.x = ((e.clientX-rect.left)/rect.width)*2-1;
  coordMouse.y = -((e.clientY-rect.top)/rect.height)*2+1;
  coordRaycaster.setFromCamera(coordMouse, camera);
  var hits = coordRaycaster.intersectObject(terrainMesh);
  if(hits.length > 0){
    var pt = hits[0].point;
    $('coord-x').textContent = pt.x.toFixed(2);
    $('coord-y').textContent = pt.y.toFixed(2);
    $('coord-z').textContent = pt.z.toFixed(2);
  }
}

// Mirror the (hidden) terrain-stats values into the inspector HUD
function updateCoordInfo(){
  ['peak','water','biome','trees','rocks','cov'].forEach(function(k){
    var src=$('s-'+k), dst=$('coord-'+k);
    if(src && dst) dst.textContent = src.textContent;
  });
}

