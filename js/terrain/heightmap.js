var heightCache = null; // last generated heightmap
var genStartTime = 0;
var zMin=0,zMax=1;

// ── NOISE LIBRARY ────────────────────────────────────────────────
var _builtins = {
  island: function(x,y,r){
    r=r||3.5;
    var d=Math.sqrt(x*x+y*y);
    var mask=Math.max(0,1-d/r);
    mask=mask*mask*(3-2*mask);
    return fbmN(x,y,6)*2.5*mask-(1-mask)*0.5;
  },
  canyon: function(x,y){
    var base=fbmN(x*0.5,y*0.5,5)*3;
    var cut=Math.abs(sn(x*0.8,y*0.3+10))*2.5;
    return Math.max(0,base-cut);
  },
  volcano: function(x,y){
    var d=Math.sqrt(x*x+y*y);
    var cone=Math.max(0,2-d)*1.4;
    var crater=d<0.8?-1.5+d*2:0;
    return cone+crater+fbmN(x,y,4)*0.4;
  },
  fjord: function(x,y){
    var base=fbmN(x*0.7,y*0.7,6)*3;
    var cut=Math.max(0,1.5-Math.abs(sn(x*0.4,y*0.2)*3))*1.8;
    return base-cut;
  },
  mesa: function(x,y){
    var h=fbmN(x*0.6,y*0.6,4)*2.5;
    return Math.floor(h*4)/4+fbmN(x*3,y*3,2)*0.15;
  },
  archipelago: function(x,y){
    return sn(x*0.4,y*0.4)*3+fbmN(x,y,5)*1.5-0.8;
  },
  plains: function(x,y){
    return fbmN(x*0.5,y*0.5,3)*0.6+fbmN(x*2,y*2,2)*0.15;
  }
};

function getEquationFn(eq){
  
  var fn;
  try {
    fn = new Function(
      'x','y','t',
      // Math
      'sin','cos','tan','abs','sqrt','pow','floor','ceil','round','max','min','log','exp','PI',
      // Terrain helpers
      'fbm','ridge','noise','dist','warp',
      'island','canyon','volcano','fjord','mesa','archipelago','plains',
      // Extended helpers (compiler nodes)
      'billow','voronoi','smoothstep',
      'return (' + eq + ');'
    );
  } catch(e) {
    return function(){ return 0; };
  }
  return function(x, y, t) {
    try {
      return fn(
        x, y, t||0,
        Math.sin, Math.cos, Math.tan, Math.abs, Math.sqrt, Math.pow,
        Math.floor, Math.ceil, Math.round, Math.max, Math.min, Math.log, Math.exp, Math.PI,
        function(a,b,o,r){ return fbmN(a,b,o,r); },
        function(a,b){ return ridgeN(a,b); },
        function(a,b){ return sn(a,b); },
        function(a,b,cx,cy){ return Math.sqrt(Math.pow(a-(cx||0),2)+Math.pow(b-(cy||0),2)); },
        function(a,b,s){ return domWarp(a,b,s||0.8); },
        _builtins.island, _builtins.canyon, _builtins.volcano,
        _builtins.fjord, _builtins.mesa, _builtins.archipelago, _builtins.plains,
        function(a,b,o,r){ return billowN(a,b,o,r); },
        function(a,b,j){ return voronoiN(a,b,j); },
        function(lo,hi,x){ return smoothstepFn(lo,hi,x); }
      );
    } catch(e) { return 0; }
  };
}

// ── HEIGHTMAP GENERATION ─────────────────────────────────────────
function buildHeightmap(){
  var res = STATE.res;
  var GRID = res+1;
  var VC = GRID*GRID;
  var eq = getEquationFn(STATE.eq);
  var scl = STATE.scale, amp = STATE.amp;
  var mapArea = STATE.mapArea || 1.0;
  var riv = STATE.riverOn, rd=STATE.riverDepth, rw=STATE.riverWarp;
  var hmap = new Float32Array(VC);
  var s = SURF/res;
  // Half-world in world units (used for region masking)
  var halfWorld = (SURF/2) * scl * mapArea;

  // Pre-compile region functions once per build
  var activeRegions = [];
  if(STATE.regions && STATE.regions.length){
    for(var ri=0;ri<STATE.regions.length;ri++){
      var rgn=STATE.regions[ri];
      if(!rgn.on) continue;
      var rfn=rgn.fn;
      if(!rfn){ try{rfn=getEquationFn(rgn.eq);}catch(e){continue;} }
      var rx = rgn.x * halfWorld;
      var ry = rgn.y * halfWorld;
      var rr = Math.max(0.05, rgn.radius) * halfWorld;
      activeRegions.push({fn:rfn, rx:rx, ry:ry, rr:rr,
                          strength:rgn.strength||1.0, blend:rgn.blend||'blend'});
    }
  }

  for(var j=0;j<GRID;j++){
    for(var i=0;i<GRID;i++){
      var wx=(i-res/2)*s*scl*mapArea, wy=(j-res/2)*s*scl*mapArea;
      // Base heightmap
      var h=eq(wx,wy,0)*amp;
      // Layer compositing
      for(var li=0;li<STATE.layers.length;li++){
        var lay=STATE.layers[li];
        if(!lay.on||!lay.fn)continue;
        var lh=lay.fn(wx,wy,0)*lay.op;
        if(lay.blend==='add')h+=lh;
        else if(lay.blend==='multiply')h*=(1+lh*.3);
        else if(lay.blend==='subtract')h-=lh;
        else if(lay.blend==='replace')h=h*(1-lay.op)+lay.fn(wx,wy,0)*lay.op;
      }
      
      for(var rgi=0;rgi<activeRegions.length;rgi++){
        var ar=activeRegions[rgi];
        var ddx=wx-ar.rx, ddy=wy-ar.ry;
        var dd=Math.sqrt(ddx*ddx+ddy*ddy);
        if(dd>=ar.rr) continue; // outside zone entirely
        var tt=1.0-dd/ar.rr;
        var mask=tt*tt*(3-2*tt); // smoothstep falloff
        var rh=ar.fn(wx,wy,0)*ar.strength;
        if(ar.blend==='add')       h += rh * mask;
        else if(ar.blend==='blend') h = h*(1-mask) + rh*mask;
        else if(ar.blend==='replace') h = h*(1-mask*0.9) + rh*(mask*0.9);
        else if(ar.blend==='multiply') h *= (1.0 + (rh-h)*mask*0.4);
      }
      // River carving via domain warping
      if(riv){
        var rwx=wx+rw*sn(wx*0.5+3.1,wy*0.5+1.7);
        var rwy=wy+rw*sn(wx*0.5+8.4,wy*0.5+4.3);
        var rv=Math.abs(sn(rwx*0.7,rwy*0.7));
        if(rv<0.18) h -= rd*(0.18-rv)/0.18;
      }
      hmap[j*GRID+i]=h;
    }
  }
  
  gFlowMap = null;
  var etype = STATE.erosionType;
  if(etype==='laplacian' && STATE.erosion>0.01){
    hmap = erode(hmap, GRID, STATE.erosion);
  } else if(etype==='thermal'){
    hmap = erodeThermally(hmap, GRID, STATE.talusAngle, STATE.thermIters);
  } else if(etype==='hydraulic'){
    var r = erodeHydraulic(hmap, GRID, {
      droplets:STATE.droplets, inertia:STATE.inertia,
      eroRate:STATE.eroRate, depRate:STATE.depRate, evap:STATE.evap
    });
    hmap = r.hmap; gFlowMap = r.flowMap;
  } else if(etype==='both'){
    hmap = erodeThermally(hmap, GRID, STATE.talusAngle, Math.floor(STATE.thermIters*.5));
    var r = erodeHydraulic(hmap, GRID, {
      droplets:Math.floor(STATE.droplets*.5), inertia:STATE.inertia,
      eroRate:STATE.eroRate, depRate:STATE.depRate, evap:STATE.evap
    });
    hmap = r.hmap; gFlowMap = r.flowMap;
  }
  
  applyImportedZones(hmap, GRID, s, mapArea, scl);
  
  zMin=Infinity; zMax=-Infinity;
  for(var i=0;i<VC;i++){if(hmap[i]<zMin)zMin=hmap[i];if(hmap[i]>zMax)zMax=hmap[i];}
  
  var climate = STATE.climateOn ? computeClimateMaps(GRID, s, hmap, mapArea, scl) : null;
  return{hmap:hmap,GRID:GRID,s:s,
    moisture: climate?climate.moisture:null,
    temperature: climate?climate.temperature:null};
}


function runHeightmapWorker(cb){
  
  setProgress(12,'Worker: building heightmap off-thread…');
  var workerState = {
    eq:STATE.eq, scale:STATE.scale, amp:STATE.amp, res:STATE.res,
    oct:STATE.oct, rough:STATE.rough, seed:STATE.seed,
    riverOn:STATE.riverOn, riverDepth:STATE.riverDepth, riverWarp:STATE.riverWarp,
    erosionType:STATE.erosionType, erosion:STATE.erosion,
    droplets:STATE.droplets, inertia:STATE.inertia,
    eroRate:STATE.eroRate, depRate:STATE.depRate, evap:STATE.evap,
    talusAngle:STATE.talusAngle, thermIters:STATE.thermIters,
    layers: STATE.layers.map(function(l){return{eq:l.eq,blend:l.blend,op:parseFloat(l.op),on:!!l.on};})
  };
  var code = '(' + _workerFn.toString() + ')();';
  var blob = new Blob([code],{type:'application/javascript'});
  var url  = URL.createObjectURL(blob);
  var w    = new Worker(url);
  w.onmessage = function(e){
    URL.revokeObjectURL(url);
    if(e.data.error){ toast('Worker Error',e.data.error); hideGenProgress(); generating=false; return; }
    var hmap = new Float32Array(e.data.hmap);
    gFlowMap = e.data.flowMap ? new Float32Array(e.data.flowMap) : null;
    // Re-compute zMin/zMax on main thread
    zMin=Infinity; zMax=-Infinity;
    for(var i=0;i<hmap.length;i++){if(hmap[i]<zMin)zMin=hmap[i];if(hmap[i]>zMax)zMax=hmap[i];}
    cb({hmap:hmap, GRID:e.data.GRID, s:e.data.s});
  };
  w.onerror = function(ev){
    toast('Worker Error','Off-thread generation failed. Falling back…');
    URL.revokeObjectURL(url);
    // Fallback to main thread
    var data;
    try{ data=buildHeightmap(); }catch(e){ hideGenProgress(); generating=false; return; }
    heightCache=data; cb(data);
  };
  w.postMessage(workerState);
}

// The worker function (serialised via .toString())
function _workerFn(){
  function SimplexNoise(seed){
    seed=seed||0;this.p=new Uint8Array(256);this.perm=new Uint8Array(512);this.permMod12=new Uint8Array(512);
    for(var i=0;i<256;i++)this.p[i]=i;
    for(var i=255;i>0;i--){seed=(seed*1664525+1013904223)&0xffffffff;var j=((seed>>>16)&0x7fff)%(i+1);var t=this.p[i];this.p[i]=this.p[j];this.p[j]=t;}
    for(var i=0;i<512;i++){this.perm[i]=this.p[i&255];this.permMod12[i]=this.perm[i]%12;}
  }
  var G2=0.2113248654051871,grad3=new Int8Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,1]);
  SimplexNoise.prototype.noise2D=function(xin,yin){
    var p=this.perm,pm=this.permMod12,n0,n1,n2,s=(xin+yin)*0.3660254037844386,i=Math.floor(xin+s),j=Math.floor(yin+s),t=(i+j)*G2,x0=xin-i+t*1,y0=yin-j+t;
    // simplified: reuse standard 2D
    var ii=i&255,jj=j&255;
    x0=xin-(i-(i+j)*G2);y0=yin-(j-(i+j)*G2);
    var i1=x0>y0?1:0,j1=x0>y0?0:1;
    var x1=x0-i1+G2,y1=y0-j1+G2,x2=x0-1+2*G2,y2=y0-1+2*G2;
    var gi0=pm[ii+p[jj]]*3,gi1=pm[ii+i1+p[jj+j1]]*3,gi2=pm[ii+1+p[jj+1]]*3;
    var t0=0.5-x0*x0-y0*y0;n0=t0<0?0:(t0*=t0,t0*t0*(grad3[gi0]*x0+grad3[gi0+1]*y0));
    var t1=0.5-x1*x1-y1*y1;n1=t1<0?0:(t1*=t1,t1*t1*(grad3[gi1]*x1+grad3[gi1+1]*y1));
    var t2=0.5-x2*x2-y2*y2;n2=t2<0?0:(t2*=t2,t2*t2*(grad3[gi2]*x2+grad3[gi2+1]*y2));
    return 70*(n0+n1+n2);
  };
  var gN;
  function sn(x,y){return gN.noise2D(x,y);}
  function fbmN(x,y,oct,rough){oct=oct||6;rough=rough||0.5;var v=0,a=0.5,f=1,m=0;for(var i=0;i<oct;i++){v+=sn(x*f,y*f)*a;m+=a;a*=rough;f*=2;}return v/m;}
  function ridgeN(x,y){var v=0,a=0.5,f=1,m=0;for(var i=0;i<6;i++){var n=1-Math.abs(sn(x*f,y*f));n=n*n;v+=n*a;m+=a;a*=0.5;f*=2;}return v/m;}
  function domWarp(x,y,s){return sn(x+s*sn(x+1.7,y+9.2),y+s*sn(x+8.3,y+2.8));}
  var B={
    island:function(x,y,r){r=r||3.5;var d=Math.sqrt(x*x+y*y),m=Math.max(0,1-d/r);m=m*m*(3-2*m);return fbmN(x,y,6)*2.5*m-(1-m)*0.5;},
    canyon:function(x,y){return Math.max(0,fbmN(x*.5,y*.5,5)*3-Math.abs(sn(x*.8,y*.3+10))*2.5);},
    volcano:function(x,y){var d=Math.sqrt(x*x+y*y);return Math.max(0,2-d)*1.4+(d<.8?-1.5+d*2:0)+fbmN(x,y,4)*.4;},
    fjord:function(x,y){return fbmN(x*.7,y*.7,6)*3-Math.max(0,1.5-Math.abs(sn(x*.4,y*.2)*3))*1.8;},
    mesa:function(x,y){var h=fbmN(x*.6,y*.6,4)*2.5;return Math.floor(h*4)/4+fbmN(x*3,y*3,2)*.15;},
    archipelago:function(x,y){return sn(x*.4,y*.4)*3+fbmN(x,y,5)*1.5-.8;},
    plains:function(x,y){return fbmN(x*.5,y*.5,3)*.6+fbmN(x*2,y*2,2)*.15;}
  };
  function getEqFn(eq){
    var fn;
    try{fn=new Function('x','y','t','sin','cos','tan','abs','sqrt','pow','floor','ceil','round','max','min','log','exp','PI','fbm','ridge','noise','dist','warp','island','canyon','volcano','fjord','mesa','archipelago','plains','return('+eq+');');}
    catch(e){return function(){return 0;};}
    return function(x,y,t){try{return fn(x,y,t||0,Math.sin,Math.cos,Math.tan,Math.abs,Math.sqrt,Math.pow,Math.floor,Math.ceil,Math.round,Math.max,Math.min,Math.log,Math.exp,Math.PI,
      function(a,b,o,r){return fbmN(a,b,o,r);},function(a,b){return ridgeN(a,b);},function(a,b){return sn(a,b);},
      function(a,b,cx,cy){return Math.sqrt(Math.pow(a-(cx||0),2)+Math.pow(b-(cy||0),2));},function(a,b,s){return domWarp(a,b,s||.8);},
      B.island,B.canyon,B.volcano,B.fjord,B.mesa,B.archipelago,B.plains);}catch(e){return 0;}};
  }
  function lcg(seed){var s=seed>>>0;return function(){s=(s*1664525+1013904223)>>>0;return s/4294967296;};}

  function doErodeTherm(h,G,deg,iters){
    var talus=Math.tan(deg*Math.PI/180)*(20/(G-1)),out=new Float32Array(h),dirs=[[-1,0],[1,0],[0,-1],[0,1]];
    for(var it=0;it<iters;it++)for(var j=1;j<G-1;j++)for(var i=1;i<G-1;i++){var c=out[j*G+i],md=0,mdi=0,mdj=0;for(var d=0;d<4;d++){var ni=i+dirs[d][0],nj=j+dirs[d][1],df=c-out[nj*G+ni];if(df>md){md=df;mdi=dirs[d][0];mdj=dirs[d][1];}}if(md>talus){var tr=(md-talus)*.25;out[j*G+i]-=tr;out[(j+mdj)*G+(i+mdi)]+=tr;}}
    return out;
  }
  function doErodeHydro(h,G,p){
    var nd=p.droplets,inertia=p.inertia,eroR=p.eroRate,depR=p.depRate,evapR=p.evap,minSl=.001,grav=20,maxSt=64,rad=2;
    var map=new Float32Array(h),flow=new Float32Array(G*G),rng=lcg(p.seed+9999);
    function smpH(x,y){var xi=Math.max(0,Math.min(G-2,0|x)),yi=Math.max(0,Math.min(G-2,0|y)),u=x-xi,v=y-yi;return map[yi*G+xi]*(1-u)*(1-v)+map[yi*G+xi+1]*u*(1-v)+map[(yi+1)*G+xi]*(1-u)*v+map[(yi+1)*G+xi+1]*u*v;}
    function grad(x,y){var xi=Math.max(0,Math.min(G-2,0|x)),yi=Math.max(0,Math.min(G-2,0|y)),u=x-xi,v=y-yi,h00=map[yi*G+xi],h10=map[yi*G+xi+1],h01=map[(yi+1)*G+xi],h11=map[(yi+1)*G+xi+1];return{x:(h10-h00)*(1-v)+(h11-h01)*v,y:(h01-h00)*(1-u)+(h11-h10)*u};}
    function dep(x,y,a){var xi=Math.max(0,Math.min(G-2,0|x)),yi=Math.max(0,Math.min(G-2,0|y)),u=x-xi,v=y-yi;map[yi*G+xi]+=a*(1-u)*(1-v);map[yi*G+xi+1]+=a*u*(1-v);map[(yi+1)*G+xi]+=a*(1-u)*v;map[(yi+1)*G+xi+1]+=a*u*v;}
    function eroAt(x,y,a){var xi=Math.max(0,Math.min(G-2,0|x)),yi=Math.max(0,Math.min(G-2,0|y));for(var dj=-rad;dj<=rad;dj++)for(var di=-rad;di<=rad;di++){var ni=xi+di,nj=yi+dj;if(ni<0||ni>=G||nj<0||nj>=G)continue;map[nj*G+ni]-=a*Math.max(0,1-(Math.abs(di)+Math.abs(dj))/(rad+1));}}
    for(var dr=0;dr<nd;dr++){var px=rng()*(G-2)+.5,py=rng()*(G-2)+.5,vx=0,vy=0,speed=0,water=1,sed=0;for(var st=0;st<maxSt;st++){var g=grad(px,py);vx=vx*inertia-g.x*(1-inertia);vy=vy*inertia-g.y*(1-inertia);var vl=Math.sqrt(vx*vx+vy*vy)||.0001;vx/=vl;vy/=vl;var nx=px+vx,ny=py+vy;if(nx<0||nx>=G||ny<0||ny>=G)break;var oh=smpH(px,py),nh=smpH(nx,ny),dh=nh-oh,cap=Math.max(-dh,minSl)*speed*water*4;if(sed>cap||dh>0){var d=Math.max(0,dh>0?Math.min(sed,dh):(sed-cap)*depR);sed-=d;dep(px,py,d);}else{var e=Math.max(0,Math.min((cap-sed)*eroR,-dh));sed+=e;eroAt(px,py,e);}speed=Math.sqrt(Math.max(0,speed*speed-dh*grav));water*=(1-evapR);flow[(Math.min(G-1,Math.max(0,0|Math.round(px))))+(Math.min(G-1,Math.max(0,0|Math.round(py))))*G]+=1;px=nx;py=ny;if(water<.01)break;}}
    var fMax=0;for(var i=0;i<flow.length;i++)if(flow[i]>fMax)fMax=flow[i];if(fMax>0)for(var i=0;i<flow.length;i++)flow[i]/=fMax;
    return{map:map,flowMap:flow};
  }

  self.onmessage = function(e){
    var st=e.data;
    gN=new SimplexNoise(st.seed);
    var res=st.res,GRID=res+1,VC=GRID*GRID,SURF=20,s=SURF/res;
    var eq=getEqFn(st.eq),scl=st.scale,amp=st.amp;
    var hmap=new Float32Array(VC);
    for(var j=0;j<GRID;j++)for(var i=0;i<GRID;i++){
      var wx=(i-res/2)*s*scl,wy=(j-res/2)*s*scl,h=eq(wx,wy,0)*amp;
      if(st.layers)for(var li=0;li<st.layers.length;li++){var lay=st.layers[li];if(!lay.on)continue;var lf=getEqFn(lay.eq),lh=lf(wx,wy,0)*lay.op;if(lay.blend==='add')h+=lh;else if(lay.blend==='multiply')h*=(1+lh*.3);else if(lay.blend==='subtract')h-=lh;else if(lay.blend==='replace')h=h*(1-lay.op)+lf(wx,wy,0)*lay.op;}
      if(st.riverOn){var rwx=wx+st.riverWarp*gN.noise2D(wx*.5+3.1,wy*.5+1.7),rwy=wy+st.riverWarp*gN.noise2D(wx*.5+8.4,wy*.5+4.3),rv=Math.abs(gN.noise2D(rwx*.7,rwy*.7));if(rv<.18)h-=st.riverDepth*(.18-rv)/.18;}
      hmap[j*GRID+i]=h;
    }
    var flowBuf=null;
    var et=st.erosionType;
    if(et==='laplacian'&&st.erosion>.01){var o=new Float32Array(hmap.length);for(var j=0;j<GRID;j++)for(var i=0;i<GRID;i++){var c=hmap[j*GRID+i],n=j>0?hmap[(j-1)*GRID+i]:c,s2=j<GRID-1?hmap[(j+1)*GRID+i]:c,ww=i>0?hmap[j*GRID+i-1]:c,ee=i<GRID-1?hmap[j*GRID+i+1]:c;o[j*GRID+i]=c+(n+s2+ww+ee-4*c)*.25*st.erosion*.3;}hmap=o;}
    else if(et==='thermal')hmap=doErodeTherm(hmap,GRID,st.talusAngle,st.thermIters);
    else if(et==='hydraulic'){var r=doErodeHydro(hmap,GRID,{droplets:st.droplets,inertia:st.inertia,eroRate:st.eroRate,depRate:st.depRate,evap:st.evap,seed:st.seed});hmap=r.map;flowBuf=r.flowMap.buffer;}
    else if(et==='both'){hmap=doErodeTherm(hmap,GRID,st.talusAngle,Math.floor(st.thermIters*.5));var r=doErodeHydro(hmap,GRID,{droplets:Math.floor(st.droplets*.5),inertia:st.inertia,eroRate:st.eroRate,depRate:st.depRate,evap:st.evap,seed:st.seed});hmap=r.map;flowBuf=r.flowMap.buffer;}
    self.postMessage({hmap:hmap.buffer,GRID:GRID,s:s,flowMap:flowBuf},[hmap.buffer].concat(flowBuf?[flowBuf]:[]));
  };
}


