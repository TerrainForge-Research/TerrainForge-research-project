var gNoise = new SimplexNoise(42);
function sn(x,y){ return gNoise.noise2D(x,y); }

function fbmN(x,y,oct,rough){
  oct = oct||6; rough = rough||STATE.rough;
  var val=0,amp=0.5,freq=1,max=0;
  for(var i=0;i<oct;i++){
    val += sn(x*freq,y*freq)*amp;
    max += amp; amp*=rough; freq*=2.0;
  }
  return val/max;
}
function ridgeN(x,y){
  var val=0,amp=0.5,freq=1,max=0;
  for(var i=0;i<6;i++){
    var v=1-Math.abs(sn(x*freq,y*freq));
    v=v*v; val+=v*amp; max+=amp; amp*=0.5; freq*=2;
  }
  return val/max;
}
function domWarp(x,y,s){
  var wx=x+s*sn(x+1.7,y+9.2);
  var wy=y+s*sn(x+8.3,y+2.8);
  return sn(wx,wy);
}

// Billow: absolute-value FBM — billowy cloud-like turbulence
function billowN(x,y,oct,rough){
  oct=oct||5; rough=rough||0.5;
  var val=0,amp=0.5,freq=1,max=0;
  for(var i=0;i<oct;i++){
    var v=Math.abs(sn(x*freq,y*freq));
    val+=v*amp; max+=amp; amp*=rough; freq*=2;
  }
  return val/max;
}

// Voronoi (Worley) noise — F1 cell distance field
function voronoiN(x,y,jitter){
  jitter=jitter==null?0.8:jitter;
  var ix=Math.floor(x), iy=Math.floor(y);
  var minD=9999;
  for(var dj=-2;dj<=2;dj++){
    for(var di=-2;di<=2;di++){
      var ni=ix+di, nj=iy+dj;
      // Deterministic pseudo-random feature point placement via simplex hash
      var fx=ni+jitter*(sn(ni*127.1+13.1,nj*311.7+53.5)*0.5+0.5);
      var fy=nj+jitter*(sn(ni*269.5+83.3,nj*183.3+23.1)*0.5+0.5);
      var d=Math.sqrt((x-fx)*(x-fx)+(y-fy)*(y-fy));
      if(d<minD) minD=d;
    }
  }
  return Math.max(0,1.0-minD);
}

// Smoothstep (GLSL-style)
function smoothstepFn(lo,hi,x){
  var t=Math.max(0,Math.min(1,(x-lo)/(hi-lo)));
  return t*t*(3-2*t);
}


function boxBlur(srcArr, GRID, passes){
  var a=new Float32Array(srcArr), b=new Float32Array(srcArr.length);
  for(var p=0;p<passes;p++){
    for(var j=0;j<GRID;j++){
      for(var i=0;i<GRID;i++){
        var sum=0,cnt=0;
        for(var dj=-1;dj<=1;dj++){
          for(var di=-1;di<=1;di++){
            var ni=i+di, nj=j+dj;
            if(ni<0||ni>=GRID||nj<0||nj>=GRID) continue;
            sum+=a[nj*GRID+ni]; cnt++;
          }
        }
        b[j*GRID+i]=sum/cnt;
      }
    }
    var tmp=a; a=b; b=tmp;
  }
  return a;
}
function normaliseArr(arr){
  var mn=Infinity,mx=-Infinity;
  for(var i=0;i<arr.length;i++){ if(arr[i]<mn)mn=arr[i]; if(arr[i]>mx)mx=arr[i]; }
  var rng=(mx-mn)||1;
  for(var i=0;i<arr.length;i++) arr[i]=(arr[i]-mn)/rng;
  return arr;
}

