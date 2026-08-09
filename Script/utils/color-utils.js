function hsl2rgb(h,s,l){
  function f(n){
    var k=(n+h*12)%12;
    var a=s*Math.min(l,1-l);
    return l-a*Math.max(-1,Math.min(k-3,Math.min(9-k,1)));
  }
  return [f(0),f(8),f(4)];
}

// ── Render the selected analysis mode onto #analysis-canvas ────────
function hex2rgb(hex){
  hex=hex.replace('#','');
  return[parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255];
}


var _SRGB2LIN_LUT=(function(){
  var lut=new Float32Array(256);
  for(var i=0;i<256;i++){
    var c=i/255;
    lut[i]=c<=0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4);
  }
  return lut;
})();
function srgbToLinear(c){
  c=c<0?0:(c>1?1:c);
  var f=c*255,i0=f|0,i1=i0<255?i0+1:255,t=f-i0;
  return _SRGB2LIN_LUT[i0]*(1-t)+_SRGB2LIN_LUT[i1]*t;
}
function linearToSrgb(c){
  c=c<0?0:(c>1?1:c);
  return c<=0.0031308 ? c*12.92 : 1.055*Math.pow(c,1/2.4)-0.055;
}
// THREE.Color from a hex int/string, pre-converted sRGB→linear — for
// hardcoded material colours (foliage, rock) that sit under real lights.
function linHex(hex){ return new THREE.Color(hex).convertSRGBToLinear(); }

function lerp3(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
function smooth(x,e0,e1){var t=Math.max(0,Math.min(1,(x-e0)/(e1-e0)));return t*t*(3-2*t);}

function splatColor(hn, slope){
  // hn = normalised height [0..1], slope [0..1]
  var c=STATE.colors, sb=STATE.seaLevel, bw=STATE.beachW, bl=STATE.cBlend;
  var seaN=(sb-zMin)/(zMax-zMin); // normalised sea level
  var cDeep=hex2rgb(c.deep);
  var cShallow=hex2rgb(c.shallow);
  var cSand=hex2rgb(c.sand);
  var cGrass=hex2rgb(c.grass);
  var cForest=hex2rgb(c.forest);
  var cRock=hex2rgb(c.rock);
  var cSnow=hex2rgb(c.snow);

  var rgb;
  if(hn<seaN-bw){
    // Deep water
    rgb=lerp3(cDeep,cShallow,smooth(hn,seaN-bw*3,seaN-bw));
  } else if(hn<seaN+bw){
    // Beach transition
    var bt=smooth(hn,seaN-bw,seaN+bw);
    rgb=lerp3(cSand, hn<seaN?cShallow:cGrass, bt<0.5?bt*2:1);
    if(hn<seaN) rgb=lerp3(cSand,cShallow,smooth(hn,seaN-bw,seaN));
    else rgb=lerp3(cSand,cGrass,smooth(hn,seaN,seaN+bw));
  } else {
    // Land biomes
    var sn2=STATE.snowLine, flo=STATE.forestLo+seaN, fhi=STATE.forestHi;
    if(hn>sn2){
      rgb=lerp3(cRock,cSnow,smooth(hn,sn2,sn2+bl));
    } else if(slope>0.55){
      rgb=lerp3(cGrass,cRock,smooth(slope,0.5,0.75));
    } else if(hn>fhi){
      rgb=lerp3(cForest,cRock,smooth(hn,fhi,fhi+bl));
    } else if(hn>flo){
      rgb=lerp3(cGrass,cForest,smooth(hn,flo,fhi));
    } else {
      rgb=lerp3(cSand,cGrass,smooth(hn,seaN+bw,flo+bl));
    }
  }
  return rgb;
}

