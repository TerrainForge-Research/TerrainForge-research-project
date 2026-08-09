var renderer, camera, scene;
var sunLight, hemiLight, fillLight; // lighting rig — set up in initThree()
var SUN_DIR = new THREE.Vector3(18,28,16).normalize();


function updateSunShadowFrustum(worldSize){
  if(!sunLight) return;
  var dist = worldSize*1.2 + 40;
  sunLight.position.copy(SUN_DIR).multiplyScalar(dist);
  sunLight.target.position.set(0,0,0);
  var r = Math.max(10, worldSize*0.75);
  var cam = sunLight.shadow.camera;
  cam.left=-r; cam.right=r; cam.top=r; cam.bottom=-r;
  cam.near = Math.max(1, dist-worldSize*2-60);
  cam.far  = dist+worldSize*2+60;
  cam.updateProjectionMatrix();
}


function makeSkyGradientTexture(topHex, bottomHex){
  var cv=document.createElement('canvas');
  cv.width=4; cv.height=256;
  var ctx=cv.getContext('2d');
  var grad=ctx.createLinearGradient(0,0,0,256);
  grad.addColorStop(0, topHex);
  grad.addColorStop(1, bottomHex);
  ctx.fillStyle=grad;
  ctx.fillRect(0,0,4,256);
  var tex=new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  tex.needsUpdate=true;
  return tex;
}

function initThree(){
  renderer = new THREE.WebGLRenderer({antialias:false, preserveDrawingBuffer:true, alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1));
  renderer.setSize(window.innerWidth,window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);
  renderer.domElement.style.zIndex='1';

  camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 20000);
  applyCam();

  scene = new THREE.Scene();
  scene.background = makeSkyGradientTexture('#080e1e','#1c2c4a');
  
  scene.fog = new THREE.FogExp2(0x1c2c4a, 0.0018);

  
  hemiLight = new THREE.HemisphereLight(0x3f5a78, 0x2a2018, 0.9);
  hemiLight.color.convertSRGBToLinear();
  hemiLight.groundColor.convertSRGBToLinear();
  scene.add(hemiLight);

  
  sunLight = new THREE.DirectionalLight(0xfff2d8, 2.8);
  sunLight.color.convertSRGBToLinear();
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048,2048);
  sunLight.shadow.bias = -0.0012;
  sunLight.shadow.normalBias = 0.4;
  scene.add(sunLight);
  scene.add(sunLight.target);
  updateSunShadowFrustum(20); // re-fitted properly once a terrain exists

  
  fillLight = new THREE.DirectionalLight(0x4488cc, 0.22);
  fillLight.color.convertSRGBToLinear();
  fillLight.position.set(-12,8,-20);
  scene.add(fillLight);

  mkGrp = new THREE.Group(); scene.add(mkGrp);

  // Orbit + Pan controls
  var el = renderer.domElement;

  el.addEventListener('mousedown',function(e){
    if(fpp.active) return;
    // ── PLACEMENT MODE: left-click starts terrain drag ───────────
    if(placementMode.active && e.button===0){
      placementMode.dragging=true;
      document.body.classList.add('placement-drag');
      movePlacedTerrain(e.clientX, e.clientY);
      e.preventDefault();
      return;
    }
    if(e.button===2){
      // Right-click = pan
      orb.panning=true; _mx=e.clientX; _my=e.clientY;
      e.preventDefault();
    } else {
      // Left-click = orbit
      orb.dragging=true; orb.autoRotate=false;
      _mx=e.clientX; _my=e.clientY;
      tcTogOff();
    }
  });
  el.addEventListener('contextmenu',function(e){ e.preventDefault(); });

  window.addEventListener('mouseup',function(e){
    if(placementMode.active && placementMode.dragging){
      placementMode.dragging=false;
      document.body.classList.remove('placement-drag');
      return;
    }
    orb.dragging=false; orb.panning=false;
    if(ANIM.recording && _animOpen) animAddKF();
  });
  window.addEventListener('mousemove',function(e){
    if(fpp.active) return;
    // ── PLACEMENT MODE: drag moves the terrain ──────────────────
    if(placementMode.active && placementMode.dragging){
      movePlacedTerrain(e.clientX, e.clientY);
      return;
    }
    if(orb.panning){
      doPan(e.clientX-_mx, e.clientY-_my);
      _mx=e.clientX; _my=e.clientY; return;
    }
    if(!orb.dragging) return;
    orb.theta -= (e.clientX-_mx)*.007;
    orb.phi = Math.max(.15,Math.min(1.45,orb.phi+(e.clientY-_my)*.005));
    _mx=e.clientX; _my=e.clientY; applyCam();
  });

  // Touch: 1-finger orbit, 2-finger pinch+pan
  el.addEventListener('touchstart',function(e){
    // ── PLACEMENT MODE: single touch drags the terrain ──────────
    if(placementMode.active && e.touches.length===1){
      placementMode.dragging=true;
      movePlacedTerrain(e.touches[0].clientX, e.touches[0].clientY);
      return;
    }
    if(e.touches.length===2){
      orb._pinchDist = Math.hypot(
        e.touches[0].clientX-e.touches[1].clientX,
        e.touches[0].clientY-e.touches[1].clientY);
      orb._pinchRadius = orb.targetRadius;
      orb._pinchMidX = (e.touches[0].clientX+e.touches[1].clientX)*0.5;
      orb._pinchMidY = (e.touches[0].clientY+e.touches[1].clientY)*0.5;
    } else {
      orb.dragging=true; orb.autoRotate=false; tcTogOff();
      _bx=e.touches[0].clientX; _by=e.touches[0].clientY;
    }
  },{passive:true});
  window.addEventListener('touchend',function(e){
    if(placementMode.active){ placementMode.dragging=false; return; }
    if(e.touches.length<2){ orb._pinchDist=null; orb._pinchMidX=null; }
    orb.dragging=false;
  });
  window.addEventListener('touchmove',function(e){
    // ── PLACEMENT MODE ───────────────────────────────────────────
    if(placementMode.active && placementMode.dragging && e.touches.length===1){
      movePlacedTerrain(e.touches[0].clientX, e.touches[0].clientY);
      return;
    }
    if(e.touches.length===2 && orb._pinchDist!=null){
      var d=Math.hypot(
        e.touches[0].clientX-e.touches[1].clientX,
        e.touches[0].clientY-e.touches[1].clientY);
      // Pinch zoom
      var scale=orb._pinchDist/d;
      orb.targetRadius=Math.max(8,Math.min(maxCamRadius(),orb._pinchRadius*scale));
      updateZoomLevel();
      // Two-finger pan (midpoint drag)
      var mx=(e.touches[0].clientX+e.touches[1].clientX)*0.5;
      var my=(e.touches[0].clientY+e.touches[1].clientY)*0.5;
      if(orb._pinchMidX!=null){
        doPan(mx-orb._pinchMidX, my-orb._pinchMidY);
      }
      orb._pinchMidX=mx; orb._pinchMidY=my;
      return;
    }
    if(!orb.dragging) return;
    orb.theta -= (e.touches[0].clientX-_bx)*.007;
    orb.phi = Math.max(.15,Math.min(1.45,orb.phi+(e.touches[0].clientY-_by)*.005));
    _bx=e.touches[0].clientX; _by=e.touches[0].clientY; applyCam();
  },{passive:true});

  el.addEventListener('wheel',function(e){
    if(fpp.active) return;
    orb.targetRadius=Math.max(8,Math.min(maxCamRadius(), orb.targetRadius+e.deltaY*0.06));
    updateZoomLevel();
  },{passive:true});

  window.addEventListener('resize',function(){
    camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
  });
}

