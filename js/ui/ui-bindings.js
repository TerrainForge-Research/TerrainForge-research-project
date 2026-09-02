
function toast(title,body){
  var t=document.createElement('div');t.className='toast';
  t.innerHTML='<div class="tt">'+title+'</div><div class="tb">'+body+'</div>';
  $('toast-box').appendChild(t);
  setTimeout(function(){if(t.parentNode)t.remove();},4400);
}


// ── WEB WORKER RUNNER ────────────────────────────────────────────────────────
function sl(id,key,fmt){
  var el=$(id); if(!el) return;
  el.addEventListener('input',function(){
    STATE[key]=parseFloat(el.value);
    var vEl=$('v-'+id.replace('sl-',''));
    if(vEl) vEl.textContent=fmt?parseFloat(el.value).toFixed(fmt):el.value;
  });
}
function tog(wrapId,togId,key,cb){
  var wrap=$(wrapId), tog=$(togId); if(!wrap||!tog) return;
  wrap.addEventListener('click',function(){
    STATE[key]=!STATE[key];
    tog.classList.toggle('on',STATE[key]);
    if(cb) cb(STATE[key]);
  });
  tog.classList.toggle('on',STATE[key]);
}

function syncAllUI(){
  function sv(id,v){ var e=$(id);if(e)e.value=v; }
  function svt(id,v){ var e=$(id);if(e)e.textContent=v; }
  sv('terrain-eq',STATE.eq);
  sv('sl-scale',STATE.scale); svt('v-scale',STATE.scale.toFixed(2));
  sv('sl-amp',STATE.amp); svt('v-amp',STATE.amp.toFixed(1));
  sv('sl-oct',STATE.oct); svt('v-oct',STATE.oct);
  sv('sl-rough',STATE.rough); svt('v-rough',STATE.rough.toFixed(2));
  sv('sl-res',STATE.res); svt('v-res',STATE.res);
  sv('sl-mapArea', STATE.mapArea||1.0);
  svt('v-mapArea', (STATE.mapArea||1.0).toFixed(1)+'×');
  sv('sl-ero',STATE.erosion); svt('v-ero',STATE.erosion.toFixed(2));
  sv('sl-droplets',STATE.droplets); svt('v-droplets',STATE.droplets);
  sv('sl-inertia',STATE.inertia); svt('v-inertia',STATE.inertia.toFixed(2));
  sv('sl-eroRate',STATE.eroRate); svt('v-eroRate',STATE.eroRate.toFixed(2));
  sv('sl-depRate',STATE.depRate); svt('v-depRate',STATE.depRate.toFixed(2));
  sv('sl-evap',STATE.evap); svt('v-evap',STATE.evap.toFixed(3));
  sv('sl-talus',STATE.talusAngle); svt('v-talus',STATE.talusAngle);
  sv('sl-thermiters',STATE.thermIters); svt('v-thermiters',STATE.thermIters);
  // Erosion type chips/buttons
  (function(){
    var etype=STATE.erosionType||'none';
    document.querySelectorAll('.ero-type-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.etype===etype);
    });
    var lapC=$('ero-laplacian-controls'), hydC=$('ero-hydraulic-controls'), thrC=$('ero-thermal-controls');
    if(lapC) lapC.style.display=(etype==='laplacian'||etype==='none')?'':'none';
    if(hydC) hydC.style.display=(etype==='hydraulic'||etype==='both')?'':'none';
    if(thrC) thrC.style.display=(etype==='thermal'||etype==='both')?'':'none';
    var labels={'none':'Off','laplacian':'Laplacian Smooth','thermal':'Thermal Rockslide','hydraulic':'Hydraulic Droplets','both':'Thermal + Hydraulic'};
    var chip=$('ero-chip'); if(chip) chip.textContent=labels[etype]||etype;
  })();
  sv('sl-sea',STATE.seaLevel); svt('v-sea',STATE.seaLevel.toFixed(2));
  sv('sl-walpha',STATE.wAlpha); svt('v-walpha',STATE.wAlpha.toFixed(2));
  sv('sl-wsp',STATE.wSpeed); svt('v-wsp',STATE.wSpeed.toFixed(2));
  sv('sl-wh',STATE.wHeight); svt('v-wh',STATE.wHeight.toFixed(2));
  (function(){
    var eqEl=$('water-eq'), pillEl=$('tweq-tog');
    if(eqEl){ eqEl.value=STATE.waterEq; eqEl.disabled=!STATE.waterEqOn; }
    if(pillEl) pillEl.classList.toggle('on',STATE.waterEqOn);
    if(typeof waterEqCompile==='function') waterEqCompile();
  })();
  sv('sl-rdepth',STATE.riverDepth); svt('v-rdepth',STATE.riverDepth.toFixed(2));
  sv('sl-rwarp',STATE.riverWarp); svt('v-rwarp',STATE.riverWarp.toFixed(2));
  sv('sl-rthresh',STATE.riverGenThresh); svt('v-rthresh',STATE.riverGenThresh.toFixed(2));
  sv('sl-rcarve',STATE.riverCarveDepth); svt('v-rcarve',STATE.riverCarveDepth.toFixed(2));
  sv('sl-rwidth',STATE.riverCarveWidth); svt('v-rwidth',STATE.riverCarveWidth);
  sv('sl-trees',STATE.treeDensity); svt('v-trees',STATE.treeDensity.toFixed(2));
  sv('sl-rocks',STATE.rockDensity); svt('v-rocks',STATE.rockDensity.toFixed(2));
  sv('sl-snow',STATE.snowLine); svt('v-snow',STATE.snowLine.toFixed(2));
  sv('sl-flo',STATE.forestLo); svt('v-flo',STATE.forestLo.toFixed(2));
  sv('sl-fhi',STATE.forestHi); svt('v-fhi',STATE.forestHi.toFixed(2));
  sv('sl-mslope',STATE.maxSlope); svt('v-mslope',STATE.maxSlope.toFixed(2));
  sv('sl-moistScale',STATE.moistureScale); svt('v-moistScale',STATE.moistureScale.toFixed(2));
  sv('sl-tempScale',STATE.tempScale); svt('v-tempScale',STATE.tempScale.toFixed(2));
  sv('sl-tempLapse',STATE.tempLapse); svt('v-tempLapse',STATE.tempLapse.toFixed(2));
  sv('sl-coastMoist',STATE.coastalMoistureBoost); svt('v-coastMoist',STATE.coastalMoistureBoost.toFixed(2));
  sv('sl-lodNear',STATE.treeLodNearMult); svt('v-lodNear',STATE.treeLodNearMult.toFixed(2)+'×');
  sv('sl-lodFar',STATE.treeLodFarMult); svt('v-lodFar',STATE.treeLodFarMult.toFixed(2)+'×');
  (function(){
    var p=$('tclim-tog'); if(p) p.classList.toggle('on',STATE.climateOn);
    var p2=$('ttlod-tog'); if(p2) p2.classList.toggle('on',STATE.treeLODEnabled);
  })();
  sv('sl-cblend',STATE.cBlend); svt('v-cblend',STATE.cBlend.toFixed(2));
  sv('sl-beach',STATE.beachW); svt('v-beach',STATE.beachW.toFixed(3));
  sv('seed-in',STATE.seed);
  // Colors
  Object.keys(STATE.colors).forEach(function(k){
    var e=$('c-'+k);if(e)e.value=STATE.colors[k];
  });
  $('tr-tog').classList.toggle('on',STATE.riverOn);
  var tcrTog=$('tcr-tog'); if(tcrTog) tcrTog.classList.toggle('on',STATE.riverCarveOn);
  $('tc-tog').classList.toggle('on',STATE.autoRotate);
  $('tw-tog').classList.toggle('on',STATE.wireframe);
  $('tf-tog').classList.toggle('on',STATE.flatShade);
}

function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}


// ── COLLAPSIBLE FOLD TOGGLE ──────────────────────────────────────
function toggleFold(hdr){
  hdr.classList.toggle('open');
  var body = hdr.nextElementSibling;
  if(body && body.classList.contains('fold-body')){
    body.classList.toggle('open');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE GRAPH ENGINE  —  multi-pass optimising compiler
//   Pass 1 : Kahn topological sort + cycle detection
//   Pass 2 : Reachability DFS from Output (dead-code elimination)
//   Pass 3 : CSE (common-subexpression elimination) + strength reduction
// ─────────────────────────────────────────────────────────────────────────────
var _normalMat = null;
var _savedMat  = null;

function bindEvents(){
  // Sliders
  var sliders=[
    ['sl-scale','scale',2],['sl-amp','amp',1],['sl-oct','oct',0],
    ['sl-rough','rough',2],['sl-res','res',0],['sl-ero','erosion',2],
    ['sl-sea','seaLevel',2],['sl-walpha','wAlpha',2],
    ['sl-wsp','wSpeed',2],['sl-wh','wHeight',2],
    ['sl-rdepth','riverDepth',2],['sl-rwarp','riverWarp',2],
    ['sl-trees','treeDensity',2],['sl-rocks','rockDensity',2],
    ['sl-snow','snowLine',2],['sl-flo','forestLo',2],['sl-fhi','forestHi',2],
    ['sl-mslope','maxSlope',2],['sl-cblend','cBlend',2],['sl-beach','beachW',3]
  ];
  sliders.forEach(function(s){
    var el=$(s[0]);if(!el)return;
    el.addEventListener('input',function(){
      STATE[s[1]]=parseFloat(el.value);
      var vEl=$('v-'+s[0].replace('sl-',''));
      if(vEl) vEl.textContent=parseFloat(el.value).toFixed(s[2]);
    });
  });

  // Map Area slider (special display: append ×)
  var maEl=$('sl-mapArea');
  if(maEl) maEl.addEventListener('input',function(){
    STATE.mapArea=parseFloat(maEl.value);
    var vEl=$('v-mapArea');
    if(vEl) vEl.textContent=STATE.mapArea.toFixed(1)+'×';
    // Reset camera fit so next generate re-centers on the new larger map
    orb._hasInitCamera=false;
    orb.tx=0; orb.ty=0; orb.tz=0;
  });

  // Equation
  $('terrain-eq').addEventListener('input',function(){
    STATE.eq=$('terrain-eq').value;
    $('terrain-eq').classList.remove('ie');
    updateDNA();
  });
  $('terrain-eq').addEventListener('keydown',function(e){
    if(e.key==='Enter'){generate();}
  });

  // Preset
  $('preset-sel').addEventListener('change',function(){
    if(!$('preset-sel').value) return;
    STATE.eq=$('preset-sel').value;
    $('terrain-eq').value=STATE.eq;
    $('preset-sel').value='';
    updateDNA();
    generate();
  });

  // Generate button
  $('btn-regen').addEventListener('click',function(){generate();});

  // Toggles
  tog('tog-wire','tw-tog','wireframe',function(v){
    if(terrainMesh) terrainMesh.material.wireframe=v;
  });
  tog('tog-flat','tf-tog','flatShade',function(v){
    if(terrainMesh){terrainMesh.material.flatShading=v;terrainMesh.material.needsUpdate=true;}
  });
  tog('tog-cam','tc-tog','autoRotate',function(v){orb.autoRotate=v;});
  tog('tog-lod','lod-tog','lodEnabled',function(v){
    if(heightCache) buildTerrainMesh(heightCache);
    toast('Auto LOD',v?'Enabled — near/medium/far detail meshes will swap with camera distance.':'Disabled — full-resolution mesh only.');
  });
  tog('tog-river','tr-tog','riverOn',function(){});

  // Color inputs
  ['deep','shallow','sand','grass','forest','rock','snow'].forEach(function(k){
    var el=$('c-'+k);if(!el)return;
    el.addEventListener('input',function(){STATE.colors[k]=el.value;});
  });
  $('btn-apply-color').addEventListener('click',function(){
    if(heightCache) buildTerrainMesh(heightCache);
    buildWater();
    toast('Colors Applied','Splat map updated.');
  });

  // Layers
  $('b-lay').addEventListener('click',function(){addLayer();});
  $('b-lay-clr').addEventListener('click',function(){
    $('lay-con').innerHTML='';STATE.layers=[];updateDNA();
  });

  // Terrain Regions
  var addRgnBtn=$('btn-add-rgn');
  if(addRgnBtn) addRgnBtn.addEventListener('click',function(){
    // Spread new zones evenly: default position shifts based on count
    var n=STATE.regions.length;
    var angle=n*(Math.PI*2/6); // offset each zone by 60°
    var dist=n>0?0.5:0; // first zone at center, others spread out
    var defaultX=n>0?parseFloat((dist*Math.cos(angle)).toFixed(2)):0;
    var defaultY=n>0?parseFloat((dist*Math.sin(angle)).toFixed(2)):0;
    // Cycle through interesting preset equations
    var eqs=RGN_PRESETS.map(function(p){return p.eq;});
    var defEq=eqs[n % eqs.length];
    addRegion(defEq, defaultX, defaultY, 0.5, 1.0, 'blend', true);
    toast('Zone Added','Adjust position and preset, then Generate.');
  });

  // Show empty state placeholder on first load
  var rgnCon=$('rgn-con');
  if(rgnCon && !STATE.regions.length && !STATE.importedTerrains.length){
    rgnCon.innerHTML='<div class="rgn-empty">No zones yet — add or import one below</div>';
  }

  // Import from saved TerrainForge maps
  var btnImportTerrain=$('btn-import-terrain');
  if(btnImportTerrain) btnImportTerrain.addEventListener('click', openImportModal);
  var importCancelBtn=$('import-cancel');
  if(importCancelBtn) importCancelBtn.addEventListener('click', hideImportModal);
  var importModalEl=$('import-modal');
  if(importModalEl) importModalEl.addEventListener('click', function(e){ if(e.target===importModalEl) hideImportModal(); });
  updateImportedCountBadge();

  // Seed
  $('btn-seed-gen').addEventListener('click',function(){
    STATE.seed=Math.floor(Math.random()*999999);
    $('seed-in').value=STATE.seed;
    updateDNA();generate();
  });
  $('btn-seed-load').addEventListener('click',function(){
    var v=$('seed-in').value.trim();
    if(v.length>10){
      // map code
      if(!loadMapCode(v)) toast('Invalid Code','Could not parse map code.');
    }else{
      STATE.seed=parseInt(v)||0;
      $('seed-in').value=STATE.seed;
      generate();
    }
  });
  $('btn-seed-copy').addEventListener('click',function(){
    var code=buildMapCode();
    navigator.clipboard.writeText(code).then(function(){
      toast('Copied!','Map code copied to clipboard. Share it to reproduce this exact terrain.');
    }).catch(function(){
      $('seed-in').value=code;
      $('seed-in').select();
      toast('Select & Copy','Clipboard unavailable — code is selected in the input.');
    });
  });
  $('btn-fork-world').addEventListener('click',forkWorld);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});
      document.querySelectorAll('.tab-pane').forEach(function(p){p.classList.remove('active');});
      btn.classList.add('active');
      var pane=$('tab-'+btn.dataset.tab);
      if(pane) pane.classList.add('active');
      if(btn.dataset.tab==='analysis' && heightCache && !STATE._lastAnalysisMode){
        renderAnalysis($('an-mode').value);
      }
      if(btn.dataset.tab==='nodes'){
        NG.fitAll();
      }
    });
  });

  // UI toggle
  $('utog').addEventListener('click',function(){
    var col=!$('terrain-ui').classList.contains('collapsed');
    $('terrain-ui').classList.toggle('collapsed',col);
    $('utog').innerHTML=col?'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px" style="display:inline-block;vertical-align:middle;flex-shrink:0"><polyline points="18 15 12 9 6 15"/></svg>':'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px" style="display:inline-block;vertical-align:middle;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>';
  });

  // Top bar
  $('btn-back-home').addEventListener('click',showHome);
  $('btn-save-proj').addEventListener('click',showSaveModal);
  $('btn-export').addEventListener('click',trigExport);
  $('btn-export-obj').addEventListener('click',exportOBJ);
  $('btn-export-glb').addEventListener('click',exportGLB);
  $('btn-export-hm16').addEventListener('click',exportHeightmap16);
  $('btn-export-splat').addEventListener('click',exportSplatmap);
  $('btn-export-texture').addEventListener('click',exportTexture);
  $('btn-export-glb-low').addEventListener('click',function(){exportGLBTier('low');});
  $('btn-export-glb-medium').addEventListener('click',function(){exportGLBTier('medium');});
  $('btn-export-glb-high').addEventListener('click',function(){exportGLBTier('high');});
  $('btn-export-glb-ultra').addEventListener('click',function(){exportGLBTier('ultra');});
  $('btn-export-glb-data').addEventListener('click',exportGLBDataChannels);
  $('btn-an-run').addEventListener('click',function(){
    if(renderAnalysis($('an-mode').value)!==false) showAnalysisModal();
  });
  $('btn-an-dl').addEventListener('click',downloadAnalysisPNG);
  $('analysis-modal-close').addEventListener('click',hideAnalysisModal);
  $('analysis-modal').addEventListener('click',function(e){if(e.target===$('analysis-modal'))hideAnalysisModal();});
  $('btn-new-proj').addEventListener('click',function(){
    currentProjId=null;
    STATE.seed=Math.floor(Math.random()*99999);
    STATE.eq='fbm(x,y,6)*3 + ridge(x,y)*1.5';
    syncAllUI();
    showVisualizer();
    generate();
  });

  // Stats panel toggle
  var _statsVisible = true;
  var _statsTog = $('btn-stats-tog');
  function updateStatsTog(){
    var panel = $('terrain-stats');
    if(!panel || !_statsTog) return;
    if(_statsVisible){
      panel.classList.remove('stats-hidden');
      _statsTog.classList.remove('active');
      _statsTog.title = 'Hide terrain info panel';
    } else {
      panel.classList.add('stats-hidden');
      _statsTog.classList.add('active');
      _statsTog.title = 'Show terrain info panel';
    }
  }
  if(_statsTog){
    _statsTog.addEventListener('click', function(){
      _statsVisible = !_statsVisible;
      updateStatsTog();
    });
  }

  // Save modal
  $('save-confirm').addEventListener('click',doSave);
  $('save-cancel').addEventListener('click',hideSaveModal);
  $('proj-name-inp').addEventListener('keydown',function(e){
    if(e.key==='Enter') doSave();
    if(e.key==='Escape') hideSaveModal();
  });
  $('save-modal').addEventListener('click',function(e){if(e.target===$('save-modal'))hideSaveModal();});

  // Erosion type selector
  document.querySelectorAll('.ero-type-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      document.querySelectorAll('.ero-type-btn').forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      STATE.erosionType = btn.dataset.etype;
      // Show/hide controls
      var etype = STATE.erosionType;
      var lapC = $('ero-laplacian-controls');
      var hydC = $('ero-hydraulic-controls');
      var thrC = $('ero-thermal-controls');
      if(lapC) lapC.style.display = (etype==='laplacian'||etype==='none') ? '' : 'none';
      if(hydC) hydC.style.display = (etype==='hydraulic'||etype==='both') ? '' : 'none';
      if(thrC) thrC.style.display = (etype==='thermal'  ||etype==='both') ? '' : 'none';
      var labels={'none':'Off','laplacian':'Laplacian Smooth','thermal':'Thermal Rockslide','hydraulic':'Hydraulic Droplets','both':'Thermal + Hydraulic'};
      var chip=$('ero-chip');if(chip)chip.textContent=labels[etype]||etype;
    });
  });

  // Erosion-specific sliders
  var eroSliders=[
    ['sl-droplets','droplets',0],['sl-inertia','inertia',2],
    ['sl-eroRate','eroRate',2],['sl-depRate','depRate',2],['sl-evap','evap',3],
    ['sl-talus','talusAngle',0],['sl-thermiters','thermIters',0]
  ];
  eroSliders.forEach(function(s){
    var el=$(s[0]);if(!el)return;
    el.addEventListener('input',function(){
      STATE[s[1]]=parseFloat(el.value);
      var vEl=$('v-'+s[0].replace('sl-',''));
      if(vEl)vEl.textContent=parseFloat(el.value).toFixed(s[2]);
    });
  });

  // Flow map toggle
  tog('tog-flowmap','tfm-tog','showFlowMap',function(v){
    if(!v){
      // Restore original vertex colors if flow map removed
      if(heightCache) buildTerrainMesh(heightCache);
    } else {
      if(gFlowMap) applyFlowMapOverlay();
    }
  });

  // Generate Rivers button
  var bgrBtn = $('btn-gen-rivers');
  if(bgrBtn) bgrBtn.addEventListener('click', generateRivers);

  // Carve rivers toggle
  tog('tog-carve-rivers','tcr-tog','riverCarveOn',function(){});

  // River generation sliders
  var riverGenSliders = [
    ['sl-rthresh','riverGenThresh',2],
    ['sl-rcarve','riverCarveDepth',2],
    ['sl-rwidth','riverCarveWidth',0]
  ];
  riverGenSliders.forEach(function(s){
    var el=$(s[0]); if(!el) return;
    el.addEventListener('input',function(){
      STATE[s[1]]=parseFloat(el.value);
      var vEl=$('v-'+s[0].replace('sl-',''));
      if(vEl) vEl.textContent=parseFloat(el.value).toFixed(s[2]);
    });
  });

  // Node graph init
  NG.init();

  // Keyboard
  window.addEventListener('keydown',function(e){
    if(fpp.active) return; // FPP handles keys separately
    var act=document.activeElement;
    if(act===$('terrain-eq')||act===$('seed-in')||act===$('proj-name-inp')||act===$('water-eq')){
      if(e.key==='Escape')act.blur(); return;
    }
    if(e.key===' '){e.preventDefault();orb.autoRotate=!orb.autoRotate;$('tc-tog').classList.toggle('on',orb.autoRotate);}
    if(e.key.toLowerCase()==='g') generate();
    if(e.key.toLowerCase()==='h') $('utog').click();
    if(e.key.toLowerCase()==='e') trigExport();
    if(e.key.toLowerCase()==='w') $('tog-wire').click();
    // Zoom keyboard shortcuts
    if(e.key==='+' || e.key==='='){
      orb.targetRadius = Math.max(8, orb.targetRadius - 4);
      updateZoomLevel();
    }
    if(e.key==='-' || e.key==='_'){
      orb.targetRadius = Math.min(maxCamRadius(), orb.targetRadius + 4);
      updateZoomLevel();
    }
    if(e.key==='0'){
      orb.targetRadius = 32;
      updateZoomLevel();
    }
  });


  // Animation system
  bindAnimEvents();
  // Chaos Engine controls
  bindChaosControls();
  // Chaos Event Generator controls
  bindChaosEventControls();
  // Wave Lab controls
  bindWaveLabControls();
  // Water motion equation controls
  bindWaterEqControls();
  
  // Climate Biome System + Tree LOD controls
  
  
  bindClimateAndLODControls();

 
 // ── FPP MOBILE TOUCH BINDINGS ──────────────────────────────────────
  (function(){
    var joyZone  = $('fpp-joy-zone');
    var lookZone = $('fpp-look-zone');
    var joyBase  = $('fpp-joy-base');
    var joyKnob  = $('fpp-joy-knob');
    var jumpBtn  = $('fpp-jump-btn');
    var sprintBtn= $('fpp-sprint-btn');

    // Look sensitivity
    var lookSens = 0.006;

    // ── JOYSTICK ──────────────────────────────────────────
    function joyStart(e){
      if(!fpp.active) return;
      e.preventDefault();
      var t=e.changedTouches[0];
      fpp.touch.joy.active=true;
      fpp.touch.joy.id=t.identifier;
      // Position base where finger touched
      var rect=joyZone.getBoundingClientRect();
      fpp.touch.joy.baseX=t.clientX-rect.left;
      fpp.touch.joy.baseY=t.clientY-rect.top;
      fpp.touch.joy.dx=0; fpp.touch.joy.dy=0;
      if(joyBase){
        joyBase.style.left=fpp.touch.joy.baseX+'px';
        joyBase.style.top =fpp.touch.joy.baseY+'px';
        joyBase.style.display='block';
      }
      if(joyKnob) joyKnob.style.transform='translate(-50%,-50%)';
    }
    function joyMove(e){
      if(!fpp.active||!fpp.touch.joy.active) return;
      e.preventDefault();
      for(var i=0;i<e.changedTouches.length;i++){
        var t=e.changedTouches[i];
        if(t.identifier!==fpp.touch.joy.id) continue;
        var rect=joyZone.getBoundingClientRect();
        
        var cx=t.clientX-rect.left, cy=t.clientY-rect.top;
        fpp.touch.joy.dx=cx-fpp.touch.joy.baseX;
        fpp.touch.joy.dy=cy-fpp.touch.joy.baseY;
      }
    }
    function joyEnd(e){
      if(!fpp.active||!fpp.touch.joy.active) return;
      for(var i=0;i<e.changedTouches.length;i++){
        if(e.changedTouches[i].identifier===fpp.touch.joy.id){
          fpp.touch.joy.active=false; fpp.touch.joy.id=null;
          fpp.touch.joy.dx=0; fpp.touch.joy.dy=0;
          if(joyBase) joyBase.style.display='none';
          if(joyKnob) joyKnob.style.transform='translate(-50%,-50%)';
          break;
        }
      }
    }
    if(joyZone){
      joyZone.addEventListener('touchstart',joyStart,{passive:false});
      joyZone.addEventListener('touchmove', joyMove, {passive:false});
      joyZone.addEventListener('touchend',  joyEnd,  {passive:false});
      joyZone.addEventListener('touchcancel',joyEnd, {passive:false});
    }

    // ── LOOK (right zone) ─────────────────────────────────
    function lookStart(e){
      if(!fpp.active) return;
      e.preventDefault();
      // Use first new touch that isn't already tracked
      for(var i=0;i<e.changedTouches.length;i++){
        var t=e.changedTouches[i];
        if(!fpp.touch.look.active){
          fpp.touch.look.active=true;
          fpp.touch.look.id=t.identifier;
          fpp.touch.look.lastX=t.clientX;
          fpp.touch.look.lastY=t.clientY;
          break;
        }
      }
    }
    function lookMove(e){
      if(!fpp.active||!fpp.touch.look.active) return;
      e.preventDefault();
      for(var i=0;i<e.changedTouches.length;i++){
        var t=e.changedTouches[i];
        if(t.identifier!==fpp.touch.look.id) continue;
        var dx=t.clientX-fpp.touch.look.lastX;
        var dy=t.clientY-fpp.touch.look.lastY;
        fpp.yaw  -=dx*lookSens;
        fpp.pitch -=dy*lookSens;
        fpp.pitch=Math.max(-1.48,Math.min(1.48,fpp.pitch));
        fpp.touch.look.lastX=t.clientX;
        fpp.touch.look.lastY=t.clientY;
      }
    }
    function lookEnd(e){
      if(!fpp.active||!fpp.touch.look.active) return;
      for(var i=0;i<e.changedTouches.length;i++){
        if(e.changedTouches[i].identifier===fpp.touch.look.id){
          fpp.touch.look.active=false; fpp.touch.look.id=null;
          break;
        }
      }
    }
    if(lookZone){
      lookZone.addEventListener('touchstart', lookStart,{passive:false});
      lookZone.addEventListener('touchmove',  lookMove, {passive:false});
      lookZone.addEventListener('touchend',   lookEnd,  {passive:false});
      lookZone.addEventListener('touchcancel',lookEnd,  {passive:false});
    }

    // ── JUMP BUTTON ──────────────────────────────────────
    if(jumpBtn){
      jumpBtn.addEventListener('touchstart',function(e){
        if(!fpp.active) return;
        e.preventDefault();
        fpp.touch.jumpQueued=true;
      },{passive:false});
      // Also mouse click for hybrid devices
      jumpBtn.addEventListener('click',function(){
        if(fpp.active) fpp.touch.jumpQueued=true;
      });
    }

    // ── SPRINT TOGGLE ────────────────────────────────────
    if(sprintBtn){
      sprintBtn.addEventListener('touchstart',function(e){
        if(!fpp.active) return;
        e.preventDefault();
        fpp.touch.sprintOn=!fpp.touch.sprintOn;
        sprintBtn.classList.toggle('sprint-on',fpp.touch.sprintOn);
      },{passive:false});
      sprintBtn.addEventListener('click',function(){
        if(!fpp.active) return;
        fpp.touch.sprintOn=!fpp.touch.sprintOn;
        sprintBtn.classList.toggle('sprint-on',fpp.touch.sprintOn);
      });
    }
    // ── MOBILE EXIT BUTTON ───────────────────────────────
    var mobileExitBtn=$('fpp-mobile-exit');
    if(mobileExitBtn){
      mobileExitBtn.addEventListener('touchstart',function(e){
        e.stopPropagation();
      },{passive:true});
      mobileExitBtn.addEventListener('click',function(){ exitFPP(); });
    }
  })();
  var fppBtn=$('btn-fpp');
  if(fppBtn) fppBtn.addEventListener('click',function(){
    if(fpp.active) exitFPP(); else enterFPP();
  });

  // Keyboard: track keys while in FPP
  window.addEventListener('keydown',function(e){
    if(!fpp.active) return;
    var k=e.key.toLowerCase();
    fpp.keys[k]=true;
    fpp.keys[e.key]=true;
    if(k==='escape'||k==='f'){ e.preventDefault(); exitFPP(); }
    // Block browser default for movement keys
    if(['w','a','s','d',' ','arrowup','arrowdown','arrowleft','arrowright'].indexOf(k)>=0){
      e.preventDefault();
    }
  });
  window.addEventListener('keyup',function(e){
    var k=e.key.toLowerCase();
    fpp.keys[k]=false;
    fpp.keys[e.key]=false;
  });

  // Mouse look via Pointer Lock delta
  document.addEventListener('mousemove',function(e){
    if(!fpp.active) return;
    var sens=0.0022;
    fpp.yaw  -= e.movementX*sens;
    fpp.pitch -= e.movementY*sens;
    fpp.pitch=Math.max(-1.48,Math.min(1.48,fpp.pitch));
  });

  
  document.addEventListener('pointerlockchange',function(){
    if(!document.pointerLockElement && fpp.active){
      
      fpp.active=false; fpp.keys={};
      ['fpp-crosshair','fpp-underwater','fpp-hint','fpp-exit-prompt','fpp-speed-hud','fpp-mobile-ui'].forEach(function(id){
        var el=$(id); if(el) el.style.display='none';
      });
      var zb=$('zoom-btns'); if(zb) zb.style.visibility='';
      var utog=$('utog'); if(utog) utog.style.visibility='';
      var stats=$('terrain-stats'); if(stats) stats.style.visibility='';
      var btn=$('btn-fpp');
      if(btn){
        btn.classList.remove('fpp-on');
        btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>FPP View';
      }
      camera.rotation.order='XYZ'; camera.rotation.set(0,0,0);
      if(fpp._savedOrb){
        orb.theta=fpp._savedOrb.theta; orb.phi=fpp._savedOrb.phi;
        orb.radius=fpp._savedOrb.radius; orb.targetRadius=fpp._savedOrb.targetRadius;
        orb.autoRotate=fpp._savedOrb.autoRotate;
        orb.tx=fpp._savedOrb.tx; orb.ty=fpp._savedOrb.ty; orb.tz=fpp._savedOrb.tz;
      }
      applyCam();
      document.body.style.cursor='crosshair';
    }
  });
}

