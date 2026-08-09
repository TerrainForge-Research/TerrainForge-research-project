function exportHeightmap16(){
  if(!heightCache){ toast('No Terrain','Generate a terrain first.'); return; }
  var hmap=heightCache.hmap, GRID=heightCache.GRID;
  var res=GRID-1;
  // Use an offscreen canvas at the heightmap's native resolution
  var cv=document.createElement('canvas');
  cv.width=GRID; cv.height=GRID;
  var ctx=cv.getContext('2d');
  var img=ctx.createImageData(GRID,GRID);
  var zRng=zMax-zMin||1;
  for(var k=0;k<GRID*GRID;k++){
    var hn=Math.max(0,Math.min(1,(hmap[k]-zMin)/zRng));
    // Encode as 16-bit split across R (high byte) + G (low byte)
    var v16=Math.round(hn*65535);
    var hi=v16>>8, lo=v16&0xFF;
    img.data[k*4+0]=hi;   // R = high byte
    img.data[k*4+1]=lo;   // G = low byte
    img.data[k*4+2]=0;    // B unused
    img.data[k*4+3]=255;  // A = fully opaque
  }
  ctx.putImageData(img,0,0);
  var lnk=document.createElement('a');
  lnk.download='hm16_seed'+STATE.seed+'_'+GRID+'x'+GRID+'.png';
  lnk.href=cv.toDataURL('image/png');
  lnk.click();
  toast('16-bit Heightmap','R=high byte, G=low byte. Decode in engine: height = (R*256+G)/65535 × maxH');
}

// ── SPLATMAP (RGBA weightmap) EXPORT ────────────────────────────────────────
// R=sand/beach, G=grass/forest, B=rock, A=snow
function exportSplatmap(){
  if(!heightCache){ toast('No Terrain','Generate a terrain first.'); return; }
  var hmap=heightCache.hmap, GRID=heightCache.GRID, s=heightCache.s;
  var cv=document.createElement('canvas');
  cv.width=GRID; cv.height=GRID;
  var ctx=cv.getContext('2d');
  var img=ctx.createImageData(GRID,GRID);
  var zRng=zMax-zMin||1;
  var seaN=(STATE.seaLevel-zMin)/zRng;
  var bw=STATE.beachW, bl=STATE.cBlend;
  var flo=STATE.forestLo+seaN, fhi=STATE.forestHi, sn2=STATE.snowLine;

  function smoo(x,e0,e1){var t=Math.max(0,Math.min(1,(x-e0)/(e1-e0)));return t*t*(3-2*t);}

  for(var j=0;j<GRID;j++){
    for(var i=0;i<GRID;i++){
      var k=j*GRID+i;
      var hn=Math.max(0,Math.min(1,(hmap[k]-zMin)/zRng));
      // Slope
      var dx=i>0&&i<GRID-1?hmap[j*GRID+i+1]-hmap[j*GRID+i-1]:0;
      var dz=j>0&&j<GRID-1?hmap[(j+1)*GRID+i]-hmap[(j-1)*GRID+i]:0;
      var slope=Math.min(1,Math.sqrt(dx*dx+dz*dz)/(s*2));

      var rSand=0,gGrass=0,bRock=0,aSnow=0;

      if(hn<seaN+bw){
        rSand=255;
      } else if(hn>sn2){
        aSnow=255;
        bRock=Math.round(smoo(hn,sn2,sn2+bl)*128);
      } else if(slope>0.5){
        bRock=Math.round(smoo(slope,0.4,0.75)*255);
        gGrass=255-bRock;
      } else if(hn>fhi){
        bRock=Math.round(smoo(hn,fhi,fhi+bl)*200);
        gGrass=255-bRock;
      } else {
        gGrass=255;
        rSand=Math.round(smoo(seaN+bw,hn,flo)*120);
        gGrass=255-rSand;
      }

      img.data[k*4+0]=rSand;
      img.data[k*4+1]=gGrass;
      img.data[k*4+2]=bRock;
      img.data[k*4+3]=aSnow;
    }
  }
  ctx.putImageData(img,0,0);
  var lnk=document.createElement('a');
  lnk.download='splatmap_seed'+STATE.seed+'_'+GRID+'x'+GRID+'.png';
  lnk.href=cv.toDataURL('image/png');
  lnk.click();
  toast('Splatmap Exported','RGBA: R=Sand, G=Grass/Forest, B=Rock, A=Snow. Use as layer weight in URP/HDRP.');
}

// ── TEXTURE MAP EXPORT (diffuse colour baked from splat) ─────────────────────
// Rasterises the same splatColor() logic used for vertex colours into a
// UV-aligned PNG texture (one pixel per heightmap grid cell).
function exportTexture(){
  if(!heightCache){ toast('No Terrain','Generate a terrain first.'); return; }
  var hmap=heightCache.hmap, GRID=heightCache.GRID, s=heightCache.s;
  var cv=document.createElement('canvas');
  cv.width=GRID; cv.height=GRID;
  var ctx=cv.getContext('2d');
  var img=ctx.createImageData(GRID,GRID);
  var zRng=zMax-zMin||1;

  // Pre-compute slopes (same method as buildTerrainMesh)
  var slopes=new Float32Array(GRID*GRID);
  for(var j=1;j<GRID-1;j++){
    for(var i=1;i<GRID-1;i++){
      var idx=j*GRID+i;
      var dx=hmap[idx+1]-hmap[idx-1];
      var dz=hmap[idx+GRID]-hmap[idx-GRID];
      slopes[idx]=Math.sqrt(dx*dx+dz*dz)/(s*2);
    }
  }

  var useClimate=STATE.climateOn && heightCache.moisture && heightCache.temperature;
  for(var k=0;k<GRID*GRID;k++){
    var hn=Math.max(0,Math.min(1,(hmap[k]-zMin)/zRng));
    var sl=Math.min(1,slopes[k]);
    var rgb=useClimate ? splatColorClimate(hn,sl,heightCache.moisture[k],heightCache.temperature[k]) : splatColor(hn,sl);
    img.data[k*4+0]=Math.round(rgb[0]*255);
    img.data[k*4+1]=Math.round(rgb[1]*255);
    img.data[k*4+2]=Math.round(rgb[2]*255);
    img.data[k*4+3]=255;
  }
  ctx.putImageData(img,0,0);
  var lnk=document.createElement('a');
  lnk.download='texture_seed'+STATE.seed+'_'+GRID+'x'+GRID+'.png';
  lnk.href=cv.toDataURL('image/png');
  lnk.click();
  toast('Texture Exported','Diffuse colour map saved. Assign to UV channel 0 in Blender / Unity / Unreal.');
}


function bakeBiomeTexture(hmap, GRID, s){
  var tc=document.createElement('canvas');
  tc.width=GRID; tc.height=GRID;
  var tctx=tc.getContext('2d');
  var timg=tctx.createImageData(GRID,GRID);
  var zR=zMax-zMin||1;
  var tslopes=new Float32Array(GRID*GRID);
  for(var tj=1;tj<GRID-1;tj++){
    for(var ti=1;ti<GRID-1;ti++){
      var tidx=tj*GRID+ti;
      var tdx=hmap[tidx+1]-hmap[tidx-1];
      var tdz=hmap[tidx+GRID]-hmap[tidx-GRID];
      tslopes[tidx]=Math.sqrt(tdx*tdx+tdz*tdz)/(s*2);
    }
  }
  var useClimate=STATE.climateOn && heightCache && heightCache.moisture && heightCache.GRID===GRID;
  for(var tk=0;tk<GRID*GRID;tk++){
    var thn=Math.max(0,Math.min(1,(hmap[tk]-zMin)/zR));
    var trgb=useClimate
      ? splatColorClimate(thn,Math.min(1,tslopes[tk]),heightCache.moisture[tk],heightCache.temperature[tk])
      : splatColor(thn,Math.min(1,tslopes[tk]));
    timg.data[tk*4+0]=Math.round(trgb[0]*255);
    timg.data[tk*4+1]=Math.round(trgb[1]*255);
    timg.data[tk*4+2]=Math.round(trgb[2]*255);
    timg.data[tk*4+3]=255;
  }
  tctx.putImageData(timg,0,0);
  var dataURL=tc.toDataURL('image/png');
  var b64=dataURL.split(',')[1];
  var binStr=atob(b64);
  var texBytes=new Uint8Array(binStr.length);
  for(var bi=0;bi<binStr.length;bi++) texBytes[bi]=binStr.charCodeAt(bi);
  return texBytes;
}

// ── Pack a glTF 2.0 binary (.glb) from raw attribute arrays ─────────
// opts: {posArr, norArr, uvArr, idxArr, colArr, colSize(3|4), texBytes, unlit}
function computeMoistureMap(hmap, GRID){
  return computeFlowAccumulation(hmap, GRID); // already normalised 0..1
}

var BIOME_NAMES=['Deep Water','Shallow Water','Beach','Desert','Grassland','Forest','Rock','Snow'];

function classifyBiome(hn, slope, seaN){
  var sn2=STATE.snowLine, flo=STATE.forestLo+seaN, fhi=STATE.forestHi, bw=STATE.beachW;
  if(hn<seaN-bw) return 0;          // deep water
  if(hn<seaN)    return 1;          // shallow water
  if(hn<seaN+bw) return 2;          // beach
  if(hn>sn2)     return 7;          // snow
  if(slope>0.55) return 6;          // rock (steep)
  if(hn>fhi)     return 6;          // rock (high, non-forest)
  if(hn>flo)     return 5;          // forest
  if(hn<seaN+0.08) return 3;        // desert/dry band near shore
  return 4;                          // grassland
}


