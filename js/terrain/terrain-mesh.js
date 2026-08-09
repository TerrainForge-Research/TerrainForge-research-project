var terrainMesh, waterMesh, terrainLOD=null;
function buildGridGeometry(hmap, GRID, s, meshScale, climate, linearize){
  var res=GRID-1;
  var geo=new THREE.BufferGeometry();
  var VC=GRID*GRID;
  var pos=new Float32Array(VC*3);
  var col=new Float32Array(VC*3);
  var uv=new Float32Array(VC*2);

  for(var j=0;j<GRID;j++){
    for(var i=0;i<GRID;i++){
      var idx=j*GRID+i;
      var wx=(i-res/2)*s*meshScale, wy=(j-res/2)*s*meshScale;
      var h=hmap[idx];
      pos[idx*3]=wx; pos[idx*3+1]=h; pos[idx*3+2]=wy;
      uv[idx*2]=i/res; uv[idx*2+1]=j/res;
    }
  }
  // Compute slope (rough approx, central differences)
  var slopes=new Float32Array(VC);
  for(var j=1;j<GRID-1;j++){
    for(var i=1;i<GRID-1;i++){
      var idx=j*GRID+i;
      var dx=hmap[idx+1]-hmap[idx-1];
      var dz=hmap[idx+GRID]-hmap[idx-GRID];
      slopes[idx]=Math.sqrt(dx*dx+dz*dz)/(s*meshScale*2);
    }
  }
  var zRng=zMax-zMin||1;
  var useClimate=STATE.climateOn && climate && climate.moisture && climate.temperature;
  for(var k=0;k<VC;k++){
    var hn=(hmap[k]-zMin)/zRng;
    var sl=Math.min(1,slopes[k]);
    var rgb=useClimate ? splatColorClimate(hn,sl,climate.moisture[k],climate.temperature[k]) : splatColor(hn,sl);
    if(linearize){
      col[k*3]=srgbToLinear(rgb[0]); col[k*3+1]=srgbToLinear(rgb[1]); col[k*3+2]=srgbToLinear(rgb[2]);
    } else {
      col[k*3]=rgb[0]; col[k*3+1]=rgb[1]; col[k*3+2]=rgb[2];
    }
  }
  // Indices
  var idxBuf=new Uint32Array(res*res*6);
  var p=0;
  for(var j=0;j<res;j++){
    for(var i=0;i<res;i++){
      var a=j*GRID+i, b=a+1, c=a+GRID, d=c+1;
      idxBuf[p++]=a; idxBuf[p++]=c; idxBuf[p++]=b;
      idxBuf[p++]=b; idxBuf[p++]=c; idxBuf[p++]=d;
    }
  }
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.BufferAttribute(col,3));
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geo.setIndex(new THREE.BufferAttribute(idxBuf,1));
  geo.computeVertexNormals();
  return {geo:geo, slopes:slopes};
}

// ── HEIGHTMAP RESAMPLING (bilinear) — used for LOD levels & mesh export tiers
function resampleHeightmap(hmap, GRID, newGRID){
  if(newGRID===GRID) return hmap;
  var out=new Float32Array(newGRID*newGRID);
  var srcRes=GRID-1, dstRes=newGRID-1;
  for(var j=0;j<newGRID;j++){
    var fy=(j/dstRes)*srcRes;
    var y0=Math.floor(fy), y1=Math.min(GRID-1,y0+1), ty=fy-y0;
    for(var i=0;i<newGRID;i++){
      var fx=(i/dstRes)*srcRes;
      var x0=Math.floor(fx), x1=Math.min(GRID-1,x0+1), tx=fx-x0;
      var h00=hmap[y0*GRID+x0], h10=hmap[y0*GRID+x1];
      var h01=hmap[y1*GRID+x0], h11=hmap[y1*GRID+x1];
      var hx0=h00+(h10-h00)*tx, hx1=h01+(h11-h01)*tx;
      out[j*newGRID+i]=hx0+(hx1-hx0)*ty;
    }
  }
  return out;
}

// Target grid resolution (GRID = res+1) that yields ~targetTris triangles
// (each grid cell = 2 triangles, so res*res*2 ≈ targetTris)
function gridForTriCount(targetTris){
  var res=Math.max(2,Math.round(Math.sqrt(targetTris/2)));
  return res+1;
}


var _terrainDetailTex=null;
function getTerrainDetailTexture(){
  if(_terrainDetailTex) return _terrainDetailTex;
  var N=128;
  var cv=document.createElement('canvas'); cv.width=N; cv.height=N;
  var ctx=cv.getContext('2d');
  var img=ctx.createImageData(N,N);
  for(var y=0;y<N;y++){
    for(var x=0;x<N;x++){
      var u=x/N*Math.PI*2, v=y/N*Math.PI*2;
      var n = Math.sin(u*6)*Math.cos(v*7)*0.35
            + Math.sin(u*13+v*9)*0.25
            + Math.cos(u*21-v*17)*0.15
            + (Math.sin(u*4)+Math.cos(v*5))*0.125;
      n = Math.max(0,Math.min(1, n*0.5+0.5));
      var g=Math.round(n*255), idx=(y*N+x)*4;
      img.data[idx]=g; img.data[idx+1]=g; img.data[idx+2]=g; img.data[idx+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  var tex=new THREE.CanvasTexture(cv);
  tex.wrapS=THREE.RepeatWrapping; tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(48,48);
  tex.needsUpdate=true;
  _terrainDetailTex=tex;
  return tex;
}


function disposeTerrainLOD(){
  if(terrainLOD){
    scene.remove(terrainLOD);
    terrainLOD.levels.forEach(function(lv){
      if(lv.object){ lv.object.geometry.dispose(); lv.object.material.dispose(); }
    });
    terrainLOD=null;
  }
}

function buildTerrainMesh(data){
  if(terrainMesh){ scene.remove(terrainMesh); terrainMesh.geometry.dispose(); terrainMesh.material.dispose(); terrainMesh=null; }
  disposeTerrainLOD();

  var hmap=data.hmap, GRID=data.GRID, s=data.s;
  var meshScale=(STATE.scale||1.0)*(STATE.mapArea||1.0);
  updateSunShadowFrustum(SURF*meshScale);

  var built=buildGridGeometry(hmap, GRID, s, meshScale,
    data.moisture ? {moisture:data.moisture, temperature:data.temperature} : null, true);
  var mat=new THREE.MeshStandardMaterial({
    vertexColors:true,
    wireframe:STATE.wireframe, flatShading:STATE.flatShade,
    side:THREE.FrontSide,
    roughness:0.92, metalness:0.0, dithering:true,
    bumpMap:getTerrainDetailTexture(), bumpScale:0.028
  });
  terrainMesh=new THREE.Mesh(built.geo,mat);
  terrainMesh.receiveShadow=true;
  terrainMesh.castShadow=true;

  
  var res=GRID-1;
  if(STATE.lodEnabled && res>=64){
    terrainLOD=new THREE.LOD();
    terrainLOD.addLevel(terrainMesh, 0);

    var medGRID=Math.max(33, Math.round(res/2)+1);
    var medHmap=resampleHeightmap(hmap, GRID, medGRID);
    var medBuilt=buildGridGeometry(medHmap, medGRID, s*(res/(medGRID-1)), meshScale, null, true);
    var medMesh=new THREE.Mesh(medBuilt.geo, mat.clone());
    medMesh.receiveShadow=true;
    medMesh.castShadow=true;

    var lowGRID=Math.max(17, Math.round(res/4)+1);
    var lowHmap=resampleHeightmap(hmap, GRID, lowGRID);
    var lowBuilt=buildGridGeometry(lowHmap, lowGRID, s*(res/(lowGRID-1)), meshScale, null, true);
    var lowMesh=new THREE.Mesh(lowBuilt.geo, mat.clone());
    lowMesh.receiveShadow=true;
    lowMesh.castShadow=true;

    var worldSize=SURF*meshScale;
    terrainLOD.addLevel(medMesh, worldSize*0.55);
    terrainLOD.addLevel(lowMesh, worldSize*1.5);
    scene.add(terrainLOD);
  } else {
    scene.add(terrainMesh);
  }

  return built.slopes;
}


