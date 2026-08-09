function computeClimateMaps(GRID, s, hmap, mapArea, scl){
  var N=GRID*GRID;
  var moist=new Float32Array(N), temp=new Float32Array(N);
  var mF=0.16*(STATE.moistureScale||1.0), tF=0.13*(STATE.tempScale||1.0);
  var half=(GRID-1)/2;
  for(var j=0;j<GRID;j++){
    for(var i=0;i<GRID;i++){
      var idx=j*GRID+i;
      var wx=(i-half)*s*scl*mapArea, wy=(j-half)*s*scl*mapArea;
      // Coordinate offsets decorrelate these fields from the height equation
      moist[idx]=fbmN(wx*mF+411.7, wy*mF+233.1, 4, 0.55);
      temp[idx] =fbmN(wx*tF-877.3, wy*tF+158.9, 3, 0.50);
    }
  }
  // Coastal moisture boost — blur a binary "is this cell underwater" mask
  // a few times so wetness fades smoothly inland from shores and rivers.
  var waterMask=new Float32Array(N);
  for(var k=0;k<N;k++) waterMask[k]=hmap[k]<STATE.seaLevel?1:0;
  var blurred=boxBlur(waterMask,GRID,4);
  for(var k=0;k<N;k++) moist[k]+=blurred[k]*(STATE.coastalMoistureBoost||0);
  // Altitude lapse — higher ground runs colder
  var zRng=(zMax-zMin)||1;
  for(var k=0;k<N;k++){
    var hn=(hmap[k]-zMin)/zRng;
    temp[k]-=hn*(STATE.tempLapse||0);
  }
  normaliseArr(moist); normaliseArr(temp);
  return {moisture:moist, temperature:temp};
}

// ── BUILTIN MAP GENERATORS ───────────────────────────────────────
// Each returns a function(x,y) -> height
// Built-in map helpers (referenced by equation strings)
function triWeights(v, b0, b1){
  // v in [0,1] split into 3 soft bands around boundaries b0 < b1
  var wLow  = 1-smooth(v, b0-0.12, b0+0.12);
  var wHigh = smooth(v, b1-0.12, b1+0.12);
  var wMid  = Math.max(0, 1-wLow-wHigh);
  var sum=wLow+wMid+wHigh; if(sum<1e-6) sum=1;
  return [wLow/sum, wMid/sum, wHigh/sum];
}
var CLIMATE_T_COLD=0.35, CLIMATE_T_HOT=0.72, CLIMATE_M_DRY=0.32, CLIMATE_M_WET=0.62;
function climateBiomeColor(moisture, temperature){
  var c=STATE.colors;
  var cGrass=hex2rgb(c.grass), cForest=hex2rgb(c.forest), cSand=hex2rgb(c.sand);
  // Derived biome tones — anchored to the user's own palette so Color-tab
  // customisation still has visible effect across the whole climate system.
  var tundra      = lerp3(cSand,[0.58,0.58,0.52],0.6);
  var taiga        = lerp3(cForest,[0.08,0.20,0.27],0.45);
  var denseForest  = lerp3(cForest,[0.04,0.16,0.06],0.42);
  var desert       = lerp3(cSand,[0.86,0.48,0.16],0.55);
  var savanna       = lerp3(cSand,cGrass,0.55);
  var rainforest    = lerp3(cForest,[0.01,0.12,0.05],0.62);

  var wT = triWeights(temperature, CLIMATE_T_COLD, CLIMATE_T_HOT); // [cold, temperate, hot]
  var wM = triWeights(moisture,    CLIMATE_M_DRY,  CLIMATE_M_WET); // [dry, medium, wet]
  var grid = [
    [tundra, taiga,  taiga      ],  // cold:      dry → wet
    [cGrass, cForest, denseForest],  // temperate: dry → wet
    [desert, savanna, rainforest ]   // hot:       dry → wet
  ];
  var r=0,g=0,b=0;
  for(var ti=0;ti<3;ti++){
    for(var mi=0;mi<3;mi++){
      var w=wT[ti]*wM[mi]; if(w<=0) continue;
      var col=grid[ti][mi];
      r+=col[0]*w; g+=col[1]*w; b+=col[2]*w;
    }
  }
  return [r,g,b];
}
function splatColorClimate(hn, slope, moisture, temperature){
  var c=STATE.colors, sb=STATE.seaLevel, bw=STATE.beachW;
  var seaN=(sb-zMin)/((zMax-zMin)||1);
  var cDeep=hex2rgb(c.deep), cShallow=hex2rgb(c.shallow), cSand=hex2rgb(c.sand);
  var cRock=hex2rgb(c.rock), cSnow=hex2rgb(c.snow);

  if(hn<seaN-bw) return lerp3(cDeep,cShallow,smooth(hn,seaN-bw*3,seaN-bw));
  var landBase=climateBiomeColor(moisture,temperature);
  if(hn<seaN+bw){
    return hn<seaN
      ? lerp3(cSand,cShallow,smooth(hn,seaN-bw,seaN))
      : lerp3(cSand,landBase,smooth(hn,seaN,seaN+bw));
  }
  // Cold biomes carry their tree-line / snow-line lower than hot ones
  var snowLine=Math.max(0.25, STATE.snowLine-(1-temperature)*0.18);
  if(hn>snowLine) return lerp3(landBase,cSnow,smooth(hn,snowLine,snowLine+STATE.cBlend));
  if(slope>0.55) return lerp3(landBase,cRock,smooth(slope,0.5,0.78));
  return landBase;
}
// Discrete bucket (for stats / dominant-biome labelling, not rendering)
var BIOME_LABELS={tundra:'Tundra',taiga:'Taiga',grassland:'Grassland',forest:'Forest',
  denseForest:'Dense Forest',desert:'Desert',savanna:'Savanna',rainforest:'Rainforest',snow:'Snowcap'};
function classifyBiomeKey(hn, moisture, temperature){
  var snowLine=Math.max(0.25, STATE.snowLine-(1-temperature)*0.18);
  if(hn>snowLine) return 'snow';
  var t = temperature<CLIMATE_T_COLD?0 : temperature<CLIMATE_T_HOT?1:2;
  var m = moisture<CLIMATE_M_DRY?0 : moisture<CLIMATE_M_WET?1:2;
  var table=[['tundra','taiga','taiga'],['grassland','forest','denseForest'],['desert','savanna','rainforest']];
  return table[t][m];
}
function dominantClimateBiome(){
  if(!heightCache || !heightCache.moisture || !heightCache.temperature) return null;
  var GRID=heightCache.GRID, hmap=heightCache.hmap;
  var zRng=(zMax-zMin)||1, seaN=(STATE.seaLevel-zMin)/zRng;
  var counts={}, step=Math.max(1,Math.floor(GRID/48));
  for(var j=0;j<GRID;j+=step){
    for(var i=0;i<GRID;i+=step){
      var k=j*GRID+i;
      var hn=(hmap[k]-zMin)/zRng;
      if(hn<seaN+STATE.beachW) continue; // skip ocean/beach for the land-biome label
      var key=classifyBiomeKey(hn, heightCache.moisture[k], heightCache.temperature[k]);
      counts[key]=(counts[key]||0)+1;
    }
  }
  var best=null,bc=-1;
  for(var key in counts) if(counts[key]>bc){ bc=counts[key]; best=key; }
  return best;
}

function bindClimateAndLODControls(){
  // Climate master toggle — full regenerate (height-colour & foliage both depend on it)
  var togClim=document.getElementById('tog-climate'), pillClim=document.getElementById('tclim-tog');
  if(togClim&&pillClim){
    togClim.addEventListener('click',function(){
      STATE.climateOn=!STATE.climateOn;
      pillClim.classList.toggle('on',STATE.climateOn);
      generate();
    });
    pillClim.classList.toggle('on',STATE.climateOn);
  }

  // Climate parameter sliders — applied on next Generate, like other shaping sliders
  var climSliders=[
    ['sl-moistScale','moistureScale',2],
    ['sl-tempScale','tempScale',2],
    ['sl-tempLapse','tempLapse',2],
    ['sl-coastMoist','coastalMoistureBoost',2]
  ];
  climSliders.forEach(function(row){
    var el=document.getElementById(row[0]); if(!el) return;
    el.addEventListener('input',function(){
      STATE[row[1]]=parseFloat(el.value);
      var vEl=document.getElementById('v-'+row[0].replace('sl-',''));
      if(vEl) vEl.textContent=parseFloat(el.value).toFixed(row[2]);
    });
  });

  // Tree LOD toggle — cheap: only respawns foliage, no terrain rebuild needed
  var togLod=document.getElementById('tog-treelod'), pillLod=document.getElementById('ttlod-tog');
  if(togLod&&pillLod){
    togLod.addEventListener('click',function(){
      STATE.treeLODEnabled=!STATE.treeLODEnabled;
      pillLod.classList.toggle('on',STATE.treeLODEnabled);
      if(heightCache) spawnFoliage(heightCache);
    });
    pillLod.classList.toggle('on',STATE.treeLODEnabled);
  }

  // LOD distance multipliers — respawn foliage live when the slider is released
  var lodSliders=[['sl-lodNear','treeLodNearMult'],['sl-lodFar','treeLodFarMult']];
  lodSliders.forEach(function(row){
    var el=document.getElementById(row[0]); if(!el) return;
    el.addEventListener('input',function(){
      STATE[row[1]]=parseFloat(el.value);
      var vEl=document.getElementById('v-'+row[0].replace('sl-',''));
      if(vEl) vEl.textContent=parseFloat(el.value).toFixed(2)+'×';
    });
    el.addEventListener('change',function(){ if(heightCache) spawnFoliage(heightCache); });
  });
}


