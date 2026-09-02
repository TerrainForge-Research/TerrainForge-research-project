function renderAnalysis(mode){
  if(!heightCache){ toast('No Terrain','Generate a terrain first.'); return false; }
  var hmap=heightCache.hmap, GRID=heightCache.GRID, s=heightCache.s;
  var N=GRID*GRID;
  var canvas=$('analysis-canvas');
  canvas.width=GRID; canvas.height=GRID;
  var ctx=canvas.getContext('2d');
  var img=ctx.createImageData(GRID,GRID);
  var legend=$('analysis-legend');
  legend.innerHTML='';

  var meanVal=0, maxVal=-Infinity, extra='—';

  function setPixel(k,r,g,b){
    img.data[k*4]=Math.round(Math.max(0,Math.min(1,r))*255);
    img.data[k*4+1]=Math.round(Math.max(0,Math.min(1,g))*255);
    img.data[k*4+2]=Math.round(Math.max(0,Math.min(1,b))*255);
    img.data[k*4+3]=255;
  }
  function addLegend(swatch,label){
    var d=document.createElement('div'); d.className='an-leg';
    var sw=document.createElement('span'); sw.className='an-sw';
    sw.style.background=swatch; d.appendChild(sw);
    var t=document.createElement('span'); t.textContent=label; d.appendChild(t);
    legend.appendChild(d);
  }

  if(mode==='slope'){
    var slopes=computeSlopeMap(hmap,GRID,s);
    var sMax=0; for(var k=0;k<N;k++) if(slopes[k]>sMax) sMax=slopes[k];
    sMax=sMax||1;
    for(var k=0;k<N;k++){
      var t=Math.min(1,slopes[k]/sMax);
      meanVal+=t; if(t>maxVal) maxVal=t;
      // grayscale ramp, green=flat -> yellow -> red=steep
      setPixel(k, t, 1-t*0.6, 0.15*(1-t));
    }
    meanVal/=N;
    addLegend('rgb(38,255,61)','Flat');
    addLegend('rgb(255,200,38)','Moderate');
    addLegend('rgb(255,38,38)','Steep');
    extra='max slope '+sMax.toFixed(2);
    $('an-s-mean').textContent=(meanVal*100).toFixed(1)+'%';
    $('an-s-max').textContent=(maxVal*100).toFixed(1)+'%';
  } else if(mode==='curvature'){
    var curv=computeCurvatureMap(hmap,GRID,s);
    var cMax=0; for(var k=0;k<N;k++) if(Math.abs(curv[k])>cMax) cMax=Math.abs(curv[k]);
    cMax=cMax||1;
    for(var k=0;k<N;k++){
      var t=curv[k]/cMax; // -1..1
      meanVal+=Math.abs(t); if(Math.abs(t)>maxVal) maxVal=Math.abs(t);
      if(t>0) setPixel(k, 0.1, 0.15+0.5*t, 0.85*t+0.15); // concave -> blue (valley/basin)
      else    setPixel(k, 0.85*(-t)+0.15, 0.15+0.4*(-t), 0.1); // convex -> red (ridge)
    }
    meanVal/=N;
    addLegend('rgb(26,166,242)','Concave (valley / basin)');
    addLegend('rgb(40,40,40)','Flat');
    addLegend('rgb(242,64,26)','Convex (ridge / peak)');
    extra='|curvature|max '+cMax.toExponential(2);
    $('an-s-mean').textContent=(meanVal*100).toFixed(1)+'%';
    $('an-s-max').textContent=(maxVal*100).toFixed(1)+'%';
  } else if(mode==='drainage'){
    var acc=computeFlowAccumulation(hmap,GRID);
    var zRng=zMax-zMin||1;
    for(var k=0;k<N;k++){
      var hn=Math.max(0,Math.min(1,(hmap[k]-zMin)/zRng));
      var f=acc[k];
      meanVal+=f; if(f>maxVal) maxVal=f;
      // base terrain shade + blue flow channels
      var base=0.12+hn*0.18;
      setPixel(k, base*(1-f), base*(1-f)+0.25*f, base+0.7*f);
    }
    meanVal/=N;
    addLegend('rgb(31,46,31)','Dry / low flow');
    addLegend('rgb(45,177,255)','High flow (rivers)');
    extra='log-normalised flow accumulation';
    $('an-s-mean').textContent=meanVal.toFixed(3);
    $('an-s-max').textContent=maxVal.toFixed(3);
  } else if(mode==='peaks'){
    var zRng=zMax-zMin||1;
    for(var k=0;k<N;k++){
      var hn=Math.max(0,Math.min(1,(hmap[k]-zMin)/zRng));
      setPixel(k, hn*0.55, hn*0.55, hn*0.6); // grayscale-ish base
      meanVal+=hn; if(hn>maxVal) maxVal=hn;
    }
    meanVal/=N;
    var pv=findPeaksValleys(hmap,GRID);
    pv.peaks.forEach(function(p){ markDot(img,GRID,p.i,p.j,[1,0.25,0.15]); });
    pv.valleys.forEach(function(v){ markDot(img,GRID,v.i,v.j,[0.15,0.55,1]); });
    addLegend('rgb(255,64,38)','Peak');
    addLegend('rgb(38,140,255)','Valley');
    extra=pv.peaks.length+' peaks, '+pv.valleys.length+' valleys';
    $('an-s-mean').textContent='avg height '+meanVal.toFixed(2);
    $('an-s-max').textContent=pv.peaks.length+' / '+pv.valleys.length;
  } else if(mode==='watershed'){
    var ws=computeWatershedBasins(hmap,GRID);
    for(var k=0;k<N;k++){
      var c=basinColor(ws.basin[k]);
      setPixel(k, c[0], c[1], c[2]);
    }
    addLegend('linear-gradient(90deg,#e63,#3a8,#36e,#e3c)','Each colour = one drainage basin');
    extra=ws.count+' basins detected';
    $('an-s-mean').textContent=ws.count;
    $('an-s-max').textContent=GRID+'×'+GRID+' cells';
    meanVal=ws.count; maxVal=N;
  } else if(mode==='biome'){
    if(!heightCache.moisture || !heightCache.temperature){
      toast('Climate Disabled','Enable Climate Biomes in the Biomes tab, then Generate, to view this map.');
      return;
    }
    var zRng=zMax-zMin||1;
    for(var k=0;k<N;k++){
      var hn=Math.max(0,Math.min(1,(hmap[k]-zMin)/zRng));
      var rgb=splatColorClimate(hn, 0, heightCache.moisture[k], heightCache.temperature[k]);
      setPixel(k, rgb[0], rgb[1], rgb[2]);
      meanVal+=heightCache.moisture[k];
    }
    meanVal/=N;
    addLegend('rgb(85,148,55)','Forest / Grassland');
    addLegend('rgb(35,77,70)','Taiga / Tundra (cold)');
    addLegend('rgb(196,128,40)','Desert / Savanna (hot+dry)');
    addLegend('rgb(15,68,32)','Rainforest (hot+wet)');
    addLegend('rgb(235,240,250)','Snow / Rock (elevation)');
    extra='climate-classified biome colours';
    $('an-s-mean').textContent=(meanVal*100).toFixed(0)+'% moisture';
    $('an-s-max').textContent='h + moisture + temp';
  }

  ctx.putImageData(img,0,0);
  $('an-s-mode').textContent=mode.charAt(0).toUpperCase()+mode.slice(1);
  $('an-s-extra').textContent=extra;
  STATE._lastAnalysisMode=mode;
  return true;
}

// Draw a small 3×3 marker dot into an ImageData buffer
function markDot(img,GRID,ci,cj,rgb){
  for(var dj=-1;dj<=1;dj++){
    for(var di=-1;di<=1;di++){
      var i=ci+di, j=cj+dj;
      if(i<0||i>=GRID||j<0||j>=GRID) continue;
      var k=j*GRID+i;
      img.data[k*4]=Math.round(rgb[0]*255);
      img.data[k*4+1]=Math.round(rgb[1]*255);
      img.data[k*4+2]=Math.round(rgb[2]*255);
      img.data[k*4+3]=255;
    }
  }
}

function downloadAnalysisPNG(){
  var canvas=$('analysis-canvas');
  if(!canvas || !STATE._lastAnalysisMode){ toast('Nothing to Export','Run an analysis first.'); return; }
  canvas.toBlob(function(blob){
    downloadBlob(blob,'terrain_seed'+STATE.seed+'_'+STATE._lastAnalysisMode+'.png');
  });
}


function showAnalysisModal(){ $('analysis-modal').classList.add('open'); }
function hideAnalysisModal(){ $('analysis-modal').classList.remove('open'); }

