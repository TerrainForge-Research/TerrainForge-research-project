function erode(hmap,G,str){
  var out=new Float32Array(hmap.length);
  for(var j=0;j<G;j++){
    for(var i=0;i<G;i++){
      var c=hmap[j*G+i];
      var n=j>0?hmap[(j-1)*G+i]:c;
      var s2=j<G-1?hmap[(j+1)*G+i]:c;
      var ww=i>0?hmap[j*G+i-1]:c;
      var e=i<G-1?hmap[j*G+i+1]:c;
      var laplace=(n+s2+ww+e-4*c)*.25;
      out[j*G+i]=c+laplace*str*.3;
    }
  }
  return out;
}

// ── THERMAL (TALUS) EROSION ──────────────────────────────────────────────
// Simulates rockslide: if slope > talusAngle, sediment slips downhill.
function erodeThermally(hmap, G, talusDeg, iters){
  iters = iters||30;
  var talus = Math.tan(talusDeg * Math.PI/180) * (20/(G-1)); // world-space slope threshold
  var strength = 0.5;
  var out = new Float32Array(hmap);
  var dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  for(var it=0;it<iters;it++){
    for(var j=1;j<G-1;j++){
      for(var i=1;i<G-1;i++){
        var c = out[j*G+i];
        var maxDiff = 0, maxDi = 0, maxDj = 0;
        for(var d=0;d<dirs.length;d++){
          var ni=i+dirs[d][0], nj=j+dirs[d][1];
          if(ni<0||ni>=G||nj<0||nj>=G) continue;
          var diff = c - out[nj*G+ni];
          if(diff > maxDiff){ maxDiff=diff; maxDi=dirs[d][0]; maxDj=dirs[d][1]; }
        }
        if(maxDiff > talus){
          var transfer = (maxDiff - talus) * strength * 0.5;
          out[j*G+i] -= transfer;
          out[(j+maxDj)*G+(i+maxDi)] += transfer;
        }
      }
    }
  }
  return out;
}


var gFlowMap = null; // Float32Array same size as heightmap

function erodeHydraulic(hmap, G, params){
  var numDroplets = params.droplets||60000;
  var inertia     = params.inertia||0.05;
  var sedCap      = 4.0;
  var erosionRate = params.eroRate||0.3;
  var depositRate = params.depRate||0.3;
  var evapRate    = params.evap||0.02;
  var minSlope    = 0.001;
  var gravity     = 20;
  var maxSteps    = 32;
  var radius      = 1;

  var map = new Float32Array(hmap);
  var flowMap = new Float32Array(G*G); // accumulate water flow

  var rng = lcg(STATE.seed + 9999);

  // Bilinear height sample
  function sampleH(x, y){
    var xi=Math.floor(x), yi=Math.floor(y);
    var u=x-xi, v=y-yi;
    xi=Math.max(0,Math.min(G-2,xi));
    yi=Math.max(0,Math.min(G-2,yi));
    return map[yi*G+xi]*(1-u)*(1-v) +
           map[yi*G+xi+1]*u*(1-v) +
           map[(yi+1)*G+xi]*(1-u)*v +
           map[(yi+1)*G+xi+1]*u*v;
  }

  // Gradient of height (for direction)
  function gradient(x, y){
    var xi=Math.floor(x), yi=Math.floor(y);
    var u=x-xi, v=y-yi;
    xi=Math.max(0,Math.min(G-2,xi));
    yi=Math.max(0,Math.min(G-2,yi));
    var h00=map[yi*G+xi], h10=map[yi*G+xi+1];
    var h01=map[(yi+1)*G+xi], h11=map[(yi+1)*G+xi+1];
    var gx=(h10-h00)*(1-v)+(h11-h01)*v;
    var gy=(h01-h00)*(1-u)+(h11-h10)*u;
    return {x:gx, y:gy};
  }

  // Deposit sediment at position (bilinear)
  function deposit(x, y, amount){
    var xi=Math.floor(x), yi=Math.floor(y);
    var u=x-xi, v=y-yi;
    xi=Math.max(0,Math.min(G-2,xi));
    yi=Math.max(0,Math.min(G-2,yi));
    map[yi*G+xi]     += amount*(1-u)*(1-v);
    map[yi*G+xi+1]   += amount*u*(1-v);
    map[(yi+1)*G+xi] += amount*(1-u)*v;
    map[(yi+1)*G+xi+1]+=amount*u*v;
  }

  // Erode at position (bilinear weighted)
  function erodeAt(x, y, amount){
    var xi=Math.floor(x), yi=Math.floor(y);
    var u=x-xi, v=y-yi;
    xi=Math.max(0,Math.min(G-2,xi));
    yi=Math.max(0,Math.min(G-2,yi));
    var r=radius;
    for(var dj=-r;dj<=r;dj++){
      for(var di=-r;di<=r;di++){
        var ni=xi+di, nj=yi+dj;
        if(ni<0||ni>=G||nj<0||nj>=G) continue;
        var w=Math.max(0,1-(Math.abs(di)+Math.abs(dj))/(r+1));
        map[nj*G+ni] -= amount*w;
      }
    }
  }

  for(var drop=0; drop<numDroplets; drop++){
    var px = rng()*(G-2)+0.5;
    var py = rng()*(G-2)+0.5;
    var vx=0, vy=0, speed=0, water=1.0, sediment=0;

    for(var step=0; step<maxSteps; step++){
      var grad = gradient(px, py);
      var gLen = Math.sqrt(grad.x*grad.x+grad.y*grad.y)||1;

      // New direction blends inertia with downslope
      vx = vx*inertia - grad.x*(1-inertia);
      vy = vy*inertia - grad.y*(1-inertia);
      var vLen = Math.sqrt(vx*vx+vy*vy)||0.0001;
      vx /= vLen; vy /= vLen;

      var nx = px+vx, ny = py+vy;
      if(nx<0||nx>=G||ny<0||ny>=G) break;

      var oldH = sampleH(px, py);
      var newH = sampleH(nx, ny);
      var dh = newH - oldH;

      // Sediment capacity
      var cap = Math.max(-dh, minSlope)*speed*water*sedCap;

      if(sediment > cap || dh > 0){
        // Deposit
        var dep = dh>0 ? Math.min(sediment, dh) : (sediment-cap)*depositRate;
        dep = Math.max(0, dep);
        sediment -= dep;
        deposit(px, py, dep);
      } else {
        // Erode
        var ero = Math.min((cap-sediment)*erosionRate, -dh);
        ero = Math.max(0, ero);
        sediment += ero;
        erodeAt(px, py, ero);
      }

      // Update speed & flow
      speed = Math.sqrt(Math.max(0, speed*speed - dh*gravity));
      water *= (1-evapRate);

      // Record flow
      var fi = Math.min(G-1,Math.max(0,Math.round(px)));
      var fj = Math.min(G-1,Math.max(0,Math.round(py)));
      flowMap[fj*G+fi] += 1;

      px = nx; py = ny;
      if(water < 0.01) break;
    }
  }

  // Normalise flow map 0..1
  var fMax = 0;
  for(var i=0;i<flowMap.length;i++) if(flowMap[i]>fMax) fMax=flowMap[i];
  if(fMax>0) for(var i=0;i<flowMap.length;i++) flowMap[i]/=fMax;
  gFlowMap = flowMap;

  return {hmap: map, flowMap: flowMap};
}


function applyFlowMapOverlay(){
  if(!terrainMesh || !gFlowMap) return;
  var geo = terrainMesh.geometry;
  var col = geo.attributes.color.array;
  var GRID = Math.round(Math.sqrt(col.length/3));
  
  var tr=srgbToLinear(0.12), tg=srgbToLinear(0.55), tb=srgbToLinear(0.85);
  for(var k=0; k<GRID*GRID; k++){
    var flow = gFlowMap[k]||0;
    if(flow > 0.05){
      var t = Math.min(1, flow*3);
      // Blend toward teal river color
      col[k*3]   = col[k*3]*(1-t)   + tr*t;
      col[k*3+1] = col[k*3+1]*(1-t) + tg*t;
      col[k*3+2] = col[k*3+2]*(1-t) + tb*t;
    }
  }
  geo.attributes.color.needsUpdate = true;
}


