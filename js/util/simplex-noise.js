var SimplexNoise = (function(){
  function SimplexNoise(seed){
    seed = seed || 0;
    this.p = new Uint8Array(256);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for(var i=0;i<256;i++) this.p[i]=i;
    // Seeded shuffle
    for(var i=255;i>0;i--){
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      var j = ((seed >>> 16) & 0x7fff) % (i+1);
      var tmp = this.p[i]; this.p[i]=this.p[j]; this.p[j]=tmp;
    }
    for(var i=0;i<512;i++){
      this.perm[i]=this.p[i&255];
      this.permMod12[i]=this.perm[i]%12;
    }
  }
  var G2=0.2113248654051871,G3=1/6;
  var grad3=new Int8Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,1]);
  SimplexNoise.prototype.noise2D=function(xin,yin){
    var perm=this.perm,permMod12=this.permMod12;
    var n0,n1,n2,s=(xin+yin)*0.3660254037844386,i=Math.floor(xin+s),j=Math.floor(yin+s);
    var t=(i+j)*G2,X0=i-t,Y0=j-t,x0=xin-X0,y0=yin-Y0;
    var i1,j1;if(x0>y0){i1=1;j1=0;}else{i1=0;j1=1;}
    var x1=x0-i1+G2,y1=y0-j1+G2,x2=x0-1+2*G2,y2=y0-1+2*G2;
    var ii=i&255,jj=j&255;
    var gi0=permMod12[ii+perm[jj]]*3;
    var gi1=permMod12[ii+i1+perm[jj+j1]]*3;
    var gi2=permMod12[ii+1+perm[jj+1]]*3;
    var t0=0.5-x0*x0-y0*y0;
    if(t0<0)n0=0;else{t0*=t0;n0=t0*t0*(grad3[gi0]*x0+grad3[gi0+1]*y0);}
    var t1=0.5-x1*x1-y1*y1;
    if(t1<0)n1=0;else{t1*=t1;n1=t1*t1*(grad3[gi1]*x1+grad3[gi1+1]*y1);}
    var t2=0.5-x2*x2-y2*y2;
    if(t2<0)n2=0;else{t2*=t2;n2=t2*t2*(grad3[gi2]*x2+grad3[gi2+1]*y2);}
    return 70*(n0+n1+n2);
  };
  return SimplexNoise;
})();

