function updateStats(){
  $('s-peak').textContent=zMax.toFixed(2)+'u';
  $('s-water').textContent=STATE.seaLevel.toFixed(2)+'u';
  // Flow map stats
  if(gFlowMap){
    var rivers=0;for(var i=0;i<gFlowMap.length;i++)if(gFlowMap[i]>0.2)rivers++;
    $('s-flow').textContent=rivers>0?rivers+' px':'—';
  } else {
    $('s-flow').textContent='—';
  }
  var zRng=zMax-zMin||1;
  var seaN=(STATE.seaLevel-zMin)/zRng;
  var waterCov=Math.round(seaN*100)+'%';
  $('s-cov').textContent=waterCov+' water';
  var biome=getFriendlyBiomeLabel(seaN);
  $('s-biome').textContent=biome;
  $('s-biome').style.color='var(--go)';
}


function getFriendlyBiomeLabel(seaN){
  if(STATE.climateOn && heightCache && heightCache.moisture){
    var dom=dominantClimateBiome();
    if(dom) return BIOME_LABELS[dom]||'Temperate';
  }
  if(seaN>0.5) return 'Archipelago';
  if(STATE.snowLine<0.6) return 'Arctic';
  if(STATE.forestLo>0.3) return 'Highland';
  if(seaN<0.05) return 'Arid';
  return 'Temperate';
}

// ── DNA / SEED ───────────────────────────────────────────────────
function updateDNA(){
  $('d-seed').textContent=STATE.seed;
  var cmx=(STATE.eq.length+(STATE.layers.length*4))*1.2;
  if(STATE.eq.indexOf('fbm')>=0) cmx+=10;
  if(STATE.eq.indexOf('ridge')>=0) cmx+=8;
  if(STATE.eq.indexOf('warp')>=0) cmx+=12;
  $('d-cmx').textContent=Math.round(cmx);
  var h=STATE.seed%100;
  var names=['Obsidian Peaks','Crystal Flats','Verdant Reaches','Ember Highlands',
    'Fog Marshes','Iron Ridges','Silver Coast','Thorn Basin','Amber Plateau','Storm Isle',
    'Jade Steppes','Ash Caldera','Sapphire Delta','Copper Spires','Bone Flats'];
  $('d-sig').textContent=names[h%names.length];
  var zRng=zMax-zMin||1;
  var seaN=(STATE.seaLevel-zMin)/zRng;
  var biome=getFriendlyBiomeLabel(seaN);
  $('d-biome').textContent=biome;
  var rar='Common',rc='rc';
  if(h>88){rar='Legendary';rc='rl';}
  else if(h>66){rar='Rare';rc='rr';}
  else if(h>38){rar='Uncommon';rc='ru';}
  $('d-rar').textContent=rar; $('d-rar').className='rb '+rc;
}

// ── DOCUMENTATION TAB ──────────────────────────────────────────────
function updateDocsTab(){
  if(!heightCache) return;
  var GRID=heightCache.GRID;
  var verts=GRID*GRID;
  var tris=(GRID-1)*(GRID-1)*2;
  $('doc-seed').textContent=STATE.seed;
  $('doc-eq').textContent=STATE.eq;
  $('doc-oct').textContent='amp '+STATE.amp.toFixed(2)+' / scale '+STATE.scale.toFixed(2);
  $('doc-grid').textContent=GRID+'×'+GRID;
  $('doc-verts').textContent=verts.toLocaleString();
  $('doc-tris').textContent=tris.toLocaleString();
  var ms=STATE._lastGenMs||0;
  $('doc-time').textContent=ms<1000?Math.round(ms)+' ms':(ms/1000).toFixed(2)+' s';
}


