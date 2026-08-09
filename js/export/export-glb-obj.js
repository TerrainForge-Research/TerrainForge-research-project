function packGLB(opts){
  var posArr=opts.posArr, norArr=opts.norArr, uvArr=opts.uvArr, idxArr=opts.idxArr;
  var colArr=opts.colArr, colSize=opts.colSize||3, texBytes=opts.texBytes;
  var vc=posArr.length/3;

  var posBuf = new Float32Array(posArr).buffer;
  var norBuf = norArr ? new Float32Array(norArr).buffer : null;
  var uvBuf  = uvArr  ? new Float32Array(uvArr).buffer  : null;
  var colBuf = colArr ? new Float32Array(colArr).buffer : null;
  var idxBuf = idxArr ? new Uint32Array(idxArr).buffer  : null;

  var bufViews=[], accessors=[], attrs={}, bufferData=[];
  var offset=0;

  function addBV(buf, target){
    var bytes=(buf instanceof Uint8Array)?buf:new Uint8Array(buf);
    var len=bytes.length;
    bufferData.push(bytes);
    var bv={buffer:0,byteOffset:offset,byteLength:len};
    if(target) bv.target=target;
    bufViews.push(bv);
    offset+=len;
    var pad=(4-(len%4))%4;
    if(pad>0){bufferData.push(new Uint8Array(pad));offset+=pad;}
    return bufViews.length-1;
  }

  // Positions
  var minP=[Infinity,Infinity,Infinity],maxP=[-Infinity,-Infinity,-Infinity];
  for(var i=0;i<vc;i++){for(var d=0;d<3;d++){var v=posArr[i*3+d];if(v<minP[d])minP[d]=v;if(v>maxP[d])maxP[d]=v;}}
  var bvPos=addBV(posBuf,34962);
  accessors.push({bufferView:bvPos,byteOffset:0,componentType:5126,count:vc,type:'VEC3',min:minP,max:maxP});
  attrs['POSITION']=accessors.length-1;

  // Normals
  if(norBuf){
    var bvNor=addBV(norBuf,34962);
    accessors.push({bufferView:bvNor,byteOffset:0,componentType:5126,count:vc,type:'VEC3'});
    attrs['NORMAL']=accessors.length-1;
  }

  // UV coords -> TEXCOORD_0
  if(uvBuf){
    var bvUV=addBV(uvBuf,34962);
    accessors.push({bufferView:bvUV,byteOffset:0,componentType:5126,count:vc,type:'VEC2'});
    attrs['TEXCOORD_0']=accessors.length-1;
  }

  // Vertex colors -> COLOR_0 (VEC3 visual or VEC4 data channels)
  if(colBuf){
    var bvCol=addBV(colBuf,34962);
    accessors.push({bufferView:bvCol,byteOffset:0,componentType:5126,count:vc,type:(colSize===4?'VEC4':'VEC3')});
    attrs['COLOR_0']=accessors.length-1;
  }

  // Indices
  var idxAcc=-1;
  if(idxBuf){
    var bvIdx=addBV(idxBuf,34963);
    accessors.push({bufferView:bvIdx,byteOffset:0,componentType:5125,count:idxArr.length,type:'SCALAR'});
    idxAcc=accessors.length-1;
  }

  // Texture image buffer view (no target for image data)
  var texBVIdx=-1;
  if(texBytes){
    texBVIdx=addBV(texBytes,0);
  }

  // Build glTF JSON
  var hasTex=(texBVIdx>=0 && uvBuf);
  var material;
  if(hasTex){
    material={ name:'TerrainMat',
      pbrMetallicRoughness:{
        baseColorTexture:{index:0,texCoord:0},
        metallicFactor:0.0,
        roughnessFactor:0.85
      },
      doubleSided:false };
  } else {
    material={ name:'TerrainMat',
      pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:0.9},
      extensions:{KHR_materials_unlit:{}} };
  }

  var mesh={primitives:[{attributes:attrs,material:0}]};
  if(idxAcc>=0) mesh.primitives[0].indices=idxAcc;

  var totalLen=offset;
  var combined=new Uint8Array(totalLen);
  var cp=0;
  for(var i=0;i<bufferData.length;i++){combined.set(bufferData[i],cp);cp+=bufferData[i].length;}

  var json={
    asset:{version:'2.0',generator:'TerrainForge'},
    scene:0, scenes:[{nodes:[0]}],
    nodes:[{mesh:0,name:'Terrain'}],
    meshes:[mesh],
    materials:[material],
    accessors:accessors,
    bufferViews:bufViews,
    buffers:[{byteLength:totalLen}]
  };

  if(hasTex){
    json.samplers=[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];
    json.images=[{bufferView:texBVIdx,mimeType:'image/png'}];
    json.textures=[{sampler:0,source:0}];
  } else if(!opts.unlit){
    // leave default PBR shading
  } else {
    json.extensionsUsed=['KHR_materials_unlit'];
  }
  if(!hasTex) json.extensionsUsed=(json.extensionsUsed||[]).concat(['KHR_materials_unlit']);

  // Pack GLB binary
  var jsonStr=JSON.stringify(json);
  while(jsonStr.length%4!==0) jsonStr+=' ';
  var jsonBytes=new TextEncoder().encode(jsonStr);

  var headerLen=12, total=headerLen+(8+jsonBytes.length)+(8+combined.length);
  var out=new ArrayBuffer(total);
  var dv=new DataView(out);
  dv.setUint32(0,0x46546C67,true);
  dv.setUint32(4,2,true);
  dv.setUint32(8,total,true);
  dv.setUint32(12,jsonBytes.length,true);
  dv.setUint32(16,0x4E4F534A,true);
  new Uint8Array(out,20,jsonBytes.length).set(jsonBytes);
  dv.setUint32(20+jsonBytes.length,combined.length,true);
  dv.setUint32(24+jsonBytes.length,0x004E4942,true);
  new Uint8Array(out,28+jsonBytes.length,combined.length).set(combined);

  return new Blob([out],{type:'model/gltf-binary'});
}

function downloadBlob(blob, filename){
  var url=URL.createObjectURL(blob);
  var lnk=document.createElement('a');
  lnk.download=filename;
  lnk.href=url; lnk.click();
  setTimeout(function(){URL.revokeObjectURL(url);},2000);
}

function exportGLB(){
  if(!terrainMesh){ toast('No Terrain','Generate a terrain first.'); return; }
  try{
    var geo=terrainMesh.geometry;
    var posArr=geo.attributes.position.array;
    var norArr=geo.attributes.normal ? geo.attributes.normal.array : null;
    var uvArr =geo.attributes.uv     ? geo.attributes.uv.array     : null;
    var idxArr=geo.index             ? geo.index.array             : null;

    var texBytes=null;
    if(heightCache && uvArr){
      texBytes=bakeBiomeTexture(heightCache.hmap, heightCache.GRID, heightCache.s);
    }

    var blob=packGLB({posArr:posArr, norArr:norArr, uvArr:uvArr, idxArr:idxArr, texBytes:texBytes});
    downloadBlob(blob,'terrain_seed'+STATE.seed+'_'+Date.now()+'.glb');
    toast('GLB Exported','glTF 2.0 with baked diffuse texture. Open in Blender, Unity, or Unreal Engine.');
  }catch(e){ toast('GLB Failed',e.message); }
}

// ── MESH SIMPLIFICATION EXPORT (Low / Medium / High / Ultra) ───────
// Resamples the current heightmap to a coarser/finer grid that matches
// the requested triangle budget, rebuilds geometry + normals + biome
// texture, and packs a fresh, crack-free GLB. This is grid-resampling
// simplification — robust for terrain (unlike arbitrary decimation).
function exportGLBTier(tierKey){
  if(!heightCache){ toast('No Terrain','Generate a terrain first.'); return; }
  var tier=LOD_TIERS[tierKey];
  if(!tier) return;
  try{
    var hmap=heightCache.hmap, GRID=heightCache.GRID, s=heightCache.s;
    var meshScale=(STATE.scale||1.0)*(STATE.mapArea||1.0);
    var res=GRID-1;

    var newGRID=gridForTriCount(tier.tris);
    var newHmap, newS;
    if(newGRID===GRID){ newHmap=hmap; newS=s; }
    else { newHmap=resampleHeightmap(hmap,GRID,newGRID); newS=s*(res/(newGRID-1)); }

    var built=buildGridGeometry(newHmap, newGRID, newS, meshScale);
    var geo=built.geo;
    var posArr=geo.attributes.position.array;
    var norArr=geo.attributes.normal.array;
    var uvArr =geo.attributes.uv.array;
    var idxArr=geo.index.array;

    var texBytes=bakeBiomeTexture(newHmap, newGRID, newS);
    var blob=packGLB({posArr:posArr, norArr:norArr, uvArr:uvArr, idxArr:idxArr, texBytes:texBytes});
    var actualTris=idxArr.length/3;
    downloadBlob(blob,'terrain_seed'+STATE.seed+'_'+tier.label.toLowerCase()+'_'+actualTris+'tris.glb');
    toast(tier.label+' Detail Exported',actualTris.toLocaleString()+' triangles ('+newGRID+'×'+newGRID+' grid).');
  }catch(e){ toast('Export Failed',e.message); }
}

// ── VERTEX DATA-CHANNEL EXPORT ──────────────────────────────────────
// Encodes per-vertex terrain data into COLOR_0 (RGBA):
//   R = normalized height   G = normalized slope
//   B = moisture (flow accumulation)   A = biome ID / 7
function buildDataVertexColors(hmap, GRID, s, slopes){
  var VC=GRID*GRID;
  var col=new Float32Array(VC*4);
  var zRng=zMax-zMin||1;
  var seaN=(STATE.seaLevel-zMin)/zRng;
  var moist=computeMoistureMap(hmap,GRID);
  for(var k=0;k<VC;k++){
    var hn=(hmap[k]-zMin)/zRng;
    var sl=Math.min(1,slopes[k]);
    var biome=classifyBiome(hn, sl, seaN);
    col[k*4+0]=Math.max(0,Math.min(1,hn));
    col[k*4+1]=sl;
    col[k*4+2]=moist[k];
    col[k*4+3]=biome/7;
  }
  return col;
}

function exportGLBDataChannels(){
  if(!heightCache){ toast('No Terrain','Generate a terrain first.'); return; }
  try{
    var hmap=heightCache.hmap, GRID=heightCache.GRID, s=heightCache.s;
    var meshScale=(STATE.scale||1.0)*(STATE.mapArea||1.0);
    var built=buildGridGeometry(hmap, GRID, s, meshScale);
    var geo=built.geo;
    var posArr=geo.attributes.position.array;
    var norArr=geo.attributes.normal.array;
    var uvArr =geo.attributes.uv.array;
    var idxArr=geo.index.array;
    var dataCol=buildDataVertexColors(hmap, GRID, s, built.slopes);

    var blob=packGLB({posArr:posArr, norArr:norArr, uvArr:uvArr, idxArr:idxArr,
                       colArr:dataCol, colSize:4, unlit:true});
    downloadBlob(blob,'terrain_seed'+STATE.seed+'_datachannels.glb');
    toast('Data Channels Exported','COLOR_0: R=height G=slope B=moisture A=biome/7. '+BIOME_NAMES.length+' biome IDs documented in the Docs tab.');
  }catch(e){ toast('Export Failed',e.message); }
}

// ── EXPORT PNG ───────────────────────────────────────────────────
var pendExp=false;
function trigExport(){
  if(pendExp)return;
  pendExp=true;
  $('btn-export').textContent='Capturing…';
}
function doExport(){
  pendExp=false;
  $('btn-export').innerHTML='<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px\"><path d=\"M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4\"/><polyline points=\"7 10 12 15 17 10\"/><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"/></svg>PNG';
  try{
    renderer.render(scene,camera);
    var cv=document.createElement('canvas');
    cv.width=renderer.domElement.width; cv.height=renderer.domElement.height;
    var ctx=cv.getContext('2d');
    ctx.drawImage(renderer.domElement,0,0);
    var sc=Math.max(1,cv.width/1440);
    var gr=ctx.createLinearGradient(0,cv.height*.6,0,cv.height);
    gr.addColorStop(0,'rgba(3,9,18,0)');gr.addColorStop(1,'rgba(3,9,18,.72)');
    ctx.fillStyle=gr;ctx.fillRect(0,0,cv.width,cv.height);
    ctx.fillStyle='rgba(230,242,255,.9)';ctx.font='bold '+Math.round(20*sc)+'px Oxanium,sans-serif';
    ctx.fillText('TerrainForge',cv.width*.025,cv.height*.055);
    ctx.font=Math.round(11*sc)+'px JetBrains Mono,monospace';
    ctx.fillStyle='rgba(88,200,248,.8)';
    ctx.fillText('h(x,y) = '+STATE.eq.slice(0,60),cv.width*.025,cv.height-.03*cv.height);
    ctx.textAlign='right';ctx.fillStyle='rgba(88,118,165,.6)';ctx.font=Math.round(9*sc)+'px monospace';
    ctx.fillText('Seed: '+STATE.seed+' | Trees: '+treeCount,cv.width*.975,cv.height*.055);
    var lnk=document.createElement('a');
    lnk.download='terrainforge_'+STATE.seed+'_'+Date.now()+'.png';
    lnk.href=cv.toDataURL('image/png',1);lnk.click();
    toast('Exported','PNG saved — Seed '+STATE.seed);
  }catch(e){toast('Export Failed',e.message);}
}

// ── EXPORT OBJ ───────────────────────────────────────────────────
function exportOBJ(){
  if(!terrainMesh){toast('No Terrain','Generate a terrain first.');return;}
  try{
    var geo=terrainMesh.geometry;
    var posArr=geo.attributes.position.array;
    var norArr=geo.attributes.normal?geo.attributes.normal.array:null;
    var uvArr=geo.attributes.uv?geo.attributes.uv.array:null;
    var colArr=geo.attributes.color?geo.attributes.color.array:null;
    var idxArr=geo.index?geo.index.array:null;
    var vc=geo.attributes.position.count;

    var out=[];
    out.push('# TerrainForge OBJ Export');
    out.push('# Seed: '+STATE.seed);
    out.push('# Equation: h(x,y) = '+STATE.eq);
    out.push('# Vertex colors encoded in v lines (r g b) — supported by Blender');
    out.push('o TerrainForge_'+STATE.seed);
    out.push('');

    // Vertices — include r g b per vertex for Blender vertex-color import
    for(var i=0;i<vc;i++){
      var x=posArr[i*3], y=posArr[i*3+1], z=posArr[i*3+2];
      if(colArr){
        
        var r=linearToSrgb(colArr[i*3]),g=linearToSrgb(colArr[i*3+1]),b=linearToSrgb(colArr[i*3+2]);
        out.push('v '+x.toFixed(6)+' '+y.toFixed(6)+' '+z.toFixed(6)+
                 ' '+r.toFixed(6)+' '+g.toFixed(6)+' '+b.toFixed(6));
      }else{
        out.push('v '+x.toFixed(6)+' '+y.toFixed(6)+' '+z.toFixed(6));
      }
    }
    out.push('');

    // UVs
    if(uvArr){
      for(var i=0;i<vc;i++){
        out.push('vt '+uvArr[i*2].toFixed(6)+' '+uvArr[i*2+1].toFixed(6));
      }
      out.push('');
    }

    // Normals
    if(norArr){
      for(var i=0;i<vc;i++){
        out.push('vn '+norArr[i*3].toFixed(6)+' '+norArr[i*3+1].toFixed(6)+' '+norArr[i*3+2].toFixed(6));
      }
      out.push('');
    }

    out.push('g terrain');
    out.push('s 1');

    // Faces — 1-indexed, same pos/uv/normal index per vertex
    var hasUV=!!uvArr, hasN=!!norArr;
    if(idxArr){
      var fc=idxArr.length/3;
      for(var i=0;i<fc;i++){
        var a=idxArr[i*3]+1, b=idxArr[i*3+1]+1, c=idxArr[i*3+2]+1;
        if(hasUV&&hasN){
          out.push('f '+a+'/'+a+'/'+a+' '+b+'/'+b+'/'+b+' '+c+'/'+c+'/'+c);
        }else if(hasUV){
          out.push('f '+a+'/'+a+' '+b+'/'+b+' '+c+'/'+c);
        }else if(hasN){
          out.push('f '+a+'//'+a+' '+b+'//'+b+' '+c+'//'+c);
        }else{
          out.push('f '+a+' '+b+' '+c);
        }
      }
    }else{
      // Non-indexed fallback
      for(var i=0;i<vc;i+=3){
        var a=i+1,b=i+2,c=i+3;
        if(hasUV&&hasN){
          out.push('f '+a+'/'+a+'/'+a+' '+b+'/'+b+'/'+b+' '+c+'/'+c+'/'+c);
        }else{
          out.push('f '+a+' '+b+' '+c);
        }
      }
    }

    var blob=new Blob([out.join('\n')],{type:'text/plain'});
    var url=URL.createObjectURL(blob);
    var lnk=document.createElement('a');
    lnk.download='terrainforge_'+STATE.seed+'_'+Date.now()+'.obj';
    lnk.href=url; lnk.click();
    setTimeout(function(){URL.revokeObjectURL(url);},2000);
    toast('OBJ Exported','Vertex colors included — ready for Blender · Unreal · Unity');
  }catch(e){toast('OBJ Failed',e.message);}
}
