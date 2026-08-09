var gRiverAcc = null; 

function computeFlowAccumulation(hmap, GRID){
  var N = GRID * GRID;
  var flowDir = new Int32Array(N); // downstream cell index, -1 = outlet/sink
  var dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  var diagDist = Math.SQRT2;

  for(var j=0; j<GRID; j++){
    for(var i=0; i<GRID; i++){
      var idx = j*GRID+i;
      var h = hmap[idx];
      var steepest = 0, best = -1;
      for(var d=0; d<dirs.length; d++){
        var ni=i+dirs[d][1], nj=j+dirs[d][0];
        if(ni<0||ni>=GRID||nj<0||nj>=GRID) continue;
        var dist = (dirs[d][0]!==0 && dirs[d][1]!==0) ? diagDist : 1.0;
        var drop = (h - hmap[nj*GRID+ni]) / dist;
        if(drop > steepest){ steepest=drop; best=nj*GRID+ni; }
      }
      flowDir[idx] = best;
    }
  }

  
    var inDeg = new Int32Array(N);
    
  for(var k=0; k<N; k++) if(flowDir[k]>=0) inDeg[flowDir[k]]++;

  var acc = new Float32Array(N);
  for(var k=0; k<N; k++) acc[k] = 1;

  var queue = [], qi = 0;
  for(var k=0; k<N; k++) if(inDeg[k]===0) queue.push(k);

  while(qi < queue.length){
    var cur = queue[qi++];
    var down = flowDir[cur];
    if(down >= 0){
      acc[down] += acc[cur];
      if(--inDeg[down] === 0) queue.push(down);
    }
  }

  
  var maxAcc = 0;
  for(var k=0; k<N; k++) if(acc[k]>maxAcc) maxAcc=acc[k];
  if(maxAcc > 0){
    var logMax = Math.log(maxAcc+1);
    for(var k=0; k<N; k++) acc[k] = Math.log(acc[k]+1) / logMax;
  }
  return acc;
}

function carveRiversIntoTerrain(hmap, acc, GRID, threshold, depth, widthCells){
  var out = new Float32Array(hmap);
  var w = Math.max(0, Math.round(widthCells));
  for(var j=0; j<GRID; j++){
    for(var i=0; i<GRID; i++){
      var flow = acc[j*GRID+i];
      if(flow <= threshold) continue;
      var str = Math.min(1, (flow-threshold)/(1-threshold));
      out[j*GRID+i] -= depth * str;
      // Feather into neighbouring cells for bank shape
      for(var dj=-w; dj<=w; dj++){
        for(var di=-w; di<=w; di++){
          if(di===0&&dj===0) continue;
          var ni=i+di, nj=j+dj;
          if(ni<0||ni>=GRID||nj<0||nj>=GRID) continue;
          var dist = Math.sqrt(di*di+dj*dj);
          if(dist > w+0.5) continue;
          var wt = 1 - dist/(w+1);
          out[nj*GRID+ni] -= depth * str * wt * 0.45;
        }
      }
    }
  }
  return out;
}



function computeFlowDirections(hmap, GRID){
  var N=GRID*GRID;
  var flowDir=new Int32Array(N);
  var dirs=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  var diagDist=Math.SQRT2;
  for(var j=0;j<GRID;j++){
    for(var i=0;i<GRID;i++){
      var idx=j*GRID+i, h=hmap[idx];
      var steepest=0, best=-1;
      for(var d=0;d<dirs.length;d++){
        var ni=i+dirs[d][1], nj=j+dirs[d][0];
        if(ni<0||ni>=GRID||nj<0||nj>=GRID) continue;
        var dist=(dirs[d][0]!==0&&dirs[d][1]!==0)?diagDist:1.0;
        var drop=(h-hmap[nj*GRID+ni])/dist;
        if(drop>steepest){ steepest=drop; best=nj*GRID+ni; }
      }
      flowDir[idx]=best;
    }
  }
  return flowDir;
}

// Slope magnitude per cell (0..~1+), central differences
function computeSlopeMap(hmap, GRID, s){
  var N=GRID*GRID;
  var slopes=new Float32Array(N);
  for(var j=0;j<GRID;j++){
    for(var i=0;i<GRID;i++){
      var idx=j*GRID+i;
      var i0=Math.max(0,i-1), i1=Math.min(GRID-1,i+1);
      var j0=Math.max(0,j-1), j1=Math.min(GRID-1,j+1);
      var dx=hmap[j*GRID+i1]-hmap[j*GRID+i0];
      var dz=hmap[j1*GRID+i]-hmap[j0*GRID+i];
      slopes[idx]=Math.sqrt(dx*dx+dz*dz)/(s*((i1-i0)||1));
    }
  }
  return slopes;
}



function computeCurvatureMap(hmap, GRID, s){
  var N=GRID*GRID;
  var curv=new Float32Array(N);
  for(var j=1;j<GRID-1;j++){
    for(var i=1;i<GRID-1;i++){
      var idx=j*GRID+i;
      var lap=hmap[idx-1]+hmap[idx+1]+hmap[idx-GRID]+hmap[idx+GRID]-4*hmap[idx];
      curv[idx]=lap/(s*s);
    }
  }
  return curv;
}


function findPeaksValleys(hmap, GRID){
  var peaks=[], valleys=[];
  var zRng=zMax-zMin||1;
  var peakThresh=zMin+zRng*0.6, valThresh=zMin+zRng*0.4;
  for(var j=1;j<GRID-1;j++){
    for(var i=1;i<GRID-1;i++){
      var idx=j*GRID+i, h=hmap[idx];
      var isMax=true, isMin=true;
      for(var dj=-1;dj<=1;dj++){
        for(var di=-1;di<=1;di++){
          if(di===0&&dj===0) continue;
          var nh=hmap[(j+dj)*GRID+(i+di)];
          if(nh>=h) isMax=false;
          if(nh<=h) isMin=false;
        }
      }
      if(isMax && h>peakThresh) peaks.push({i:i,j:j,h:h});
      if(isMin && h<valThresh) valleys.push({i:i,j:j,h:h});
    }
  }
  return {peaks:peaks, valleys:valleys};
}


function computeWatershedBasins(hmap, GRID){
  var N=GRID*GRID;
  var flowDir=computeFlowDirections(hmap,GRID);
  var basin=new Int32Array(N); basin.fill(-1);
  for(var k=0;k<N;k++){
    if(basin[k]>=0) continue;
    var path=[k], cur=k;
    while(flowDir[cur]>=0 && basin[flowDir[cur]]<0){
      cur=flowDir[cur];
      path.push(cur);
    }
    var root = flowDir[cur]>=0 ? basin[flowDir[cur]] : cur;
    for(var p=0;p<path.length;p++) basin[path[p]]=root;
  }
  var counts={};
  for(var k=0;k<N;k++) counts[basin[k]]=(counts[basin[k]]||0)+1;
  var roots=Object.keys(counts).map(Number).sort(function(a,b){return counts[b]-counts[a];});
  var remap={};
  roots.forEach(function(r,i){ remap[r]=i; });
  var out=new Int32Array(N);
  for(var k=0;k<N;k++) out[k]=remap[basin[k]];
  return {basin:out, count:roots.length};
}


function basinColor(id){
  var hue=(id*47)%360;
  var c=hsl2rgb(hue/360, 0.55, 0.45+((id*7)%30)/100);
  return c;
}
function applyRiverOverlay(acc, threshold){
  if(!terrainMesh || !acc) return;
  var geo = terrainMesh.geometry;
  var col = geo.attributes.color.array;
  var GRID = Math.round(Math.sqrt(col.length/3));
  for(var k=0; k<GRID*GRID; k++){
    var flow = acc[k]||0;
    if(flow > threshold){
      
      var t = Math.min(1, (flow-threshold)/(1-threshold) * 2.5);
      
      var rr = srgbToLinear(0.05 + 0.24*t);
      var rg = srgbToLinear(0.31 + 0.41*t);
      var rb = srgbToLinear(0.55 + 0.42*t);
      col[k*3]   = col[k*3]  *(1-t) + rr*t;
      col[k*3+1] = col[k*3+1]*(1-t) + rg*t;
      col[k*3+2] = col[k*3+2]*(1-t) + rb*t;
    }
  }
  geo.attributes.color.needsUpdate = true;
}

function generateRivers(){
  if(!heightCache){
    toast('No Terrain','Generate a terrain first, then run Generate Rivers.');
    return;
  }
  var btn = $('btn-gen-rivers');
  btn.disabled = true;
  btn.textContent = '…Computing';

  setTimeout(function(){
    try{
      var hmap  = heightCache.hmap;
      var GRID  = heightCache.GRID;
      var s     = heightCache.s;
      var thr   = STATE.riverGenThresh;
      var depth = STATE.riverCarveDepth;
      var width = STATE.riverCarveWidth;

      // 1 — Flow accumulation
      var acc = computeFlowAccumulation(hmap, GRID);
      gRiverAcc = acc;

      // 2 — Carve terrain (modifies heightCache)
      var workHmap = hmap;
      if(STATE.riverCarveOn){
        workHmap = carveRiversIntoTerrain(hmap, acc, GRID, thr, depth, width);
        // Light smoothing along carved channels to blend banks
        workHmap = erode(workHmap, GRID, 0.18);
        heightCache = {hmap: workHmap, GRID: GRID, s: s};
        // Recompute bounds
        zMin=Infinity; zMax=-Infinity;
        for(var i=0;i<workHmap.length;i++){
          if(workHmap[i]<zMin) zMin=workHmap[i];
          if(workHmap[i]>zMax) zMax=workHmap[i];
        }
        buildTerrainMesh(heightCache);
        buildWater();
      }

      // 3 — Paint river overlay
      applyRiverOverlay(acc, thr);

      // 4 — Stats
      var riverPx = 0;
      for(var i=0;i<acc.length;i++) if(acc[i]>thr) riverPx++;
      var sRiv = $('s-rivers');
      if(sRiv) sRiv.textContent = riverPx + ' px';

      toast('Rivers Generated', riverPx + ' river cells' +
        (STATE.riverCarveOn ? ' · terrain carved & smoothed.' : ' · overlay only.'));
    } catch(e){
      toast('River Error', e.message);
    }
    btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px"><path d="M2 12c1.5-3 3.5-4.5 5-4s3 2 4.5 3.5S15 15 17 15s3.5-1.5 5-4"/><path d="M12 5v2M17 8l-1 1M7 8l1 1"/></svg>Generate Rivers';
    btn.disabled = false;
  }, 30);
}



