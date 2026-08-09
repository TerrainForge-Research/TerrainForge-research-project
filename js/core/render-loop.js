var gTime = 0;
var lastT=performance.now();
var _wFrame=0;
var _fpsAcc=0, _fpsCount=0;
function animate(){
  requestAnimationFrame(animate);
  var now=performance.now(), dt=Math.min((now-lastT)/1000,.05);lastT=now;
  gTime+=dt;
  // Live FPS readout (Inspector mode)
  _fpsAcc+=dt; _fpsCount++;
  if(_fpsAcc>=0.5){
    if(coordMode){
      var fpsEl=$('coord-fps');
      if(fpsEl) fpsEl.textContent=Math.round(_fpsCount/_fpsAcc);
      updateCoordInfo();
    }
    _fpsAcc=0; _fpsCount=0;
  }
  if((++_wFrame&3)===0) animateWater(gTime);
  // Wave Lab surface update (every 2nd frame for perf)
  if(WS._mesh && WS._GRID > 0 && (_wFrame&1)===0) updateWaveSimSurface(gTime);
  // Animation system tick
  animTick(dt);
  // Smooth zoom lerp
  // Placement mode — animate preview mesh opacity pulse
  if(placementMode.active && placementMode.mesh){
    var pulse=0.45+Math.sin(gTime*3.5)*0.15;
    placementMode.mesh.children.forEach(function(c){
      if(c.material && c.material.transparent && !c.material.wireframe){
        c.material.opacity=pulse;
        c.material.needsUpdate=true;
      }
    });
  }
  if(!fpp.active && Math.abs(orb.radius - orb.targetRadius) > 0.01){
    orb.radius += (orb.targetRadius - orb.radius) * Math.min(1, dt * 10);
    applyCam();
  }
  if(orb.autoRotate&&!orb.dragging&&!ANIM.playing&&!fpp.active){orb.theta+=dt*.1;applyCam();}
  // FPP mode tick — handles player movement and camera
  if(fpp.active) fppTick(dt);
  // Update terrain LOD (camera-distance based detail switching)
  if(terrainLOD) terrainLOD.update(camera);
  // Update tree LOD (billboard ↔ low-poly ↔ full mesh swapping by camera distance)
  if(STATE.treeLODEnabled) updateTreeLODs();
  // Render first — chaos and wave lab ticks run AFTER so they never stall the current frame
  renderer.render(scene,camera);
  if(pendExp){doExport();}
  // Chaos Engine coupling tick (post-render — deferred so frame commits cleanly)
  if(CHAOS.enabled){
    CHAOS._frameCount++;
    if(CHAOS._frameCount % CHAOS.tickRate === 0) chaosTick();
  }
}
