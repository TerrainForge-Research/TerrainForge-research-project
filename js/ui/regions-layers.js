var layN=0;

function addLayer(eq,blend,op,on){
  eq=eq||'fbm(x*2,y*2,4)*0.5';
  blend=blend||'add'; op=op!=null?op:1.0; on=on!=null?on:true;
  var id=++layN;
  var fn=null;
  try{fn=getEquationFn(eq);}catch(e){}
  var lay={id:id,eq:eq,blend:blend,op:op,on:on,fn:fn};
  STATE.layers.push(lay);
  var row=document.createElement('div');
  row.className='lay-row'; row.dataset.lid=id;
  row.innerHTML=
    '<span style="font-family:var(--fm);font-size:9px;color:var(--t3);min-width:18px">L'+STATE.layers.length+'</span>'+
    '<input type="checkbox" '+(on?'checked':'')+' title="Enable layer">'+
    '<input type="text" class="leq" value="'+escH(eq)+'" placeholder="layer equation…" style="flex:1">'+
    '<select class="lblend" title="Blend mode">'+
      '<option value="add"'+(blend==='add'?' selected':'')+'>+ Add</option>'+
      '<option value="multiply"'+(blend==='multiply'?' selected':'')+'>× Mul</option>'+
      '<option value="subtract"'+(blend==='subtract'?' selected':'')+'>- Sub</option>'+
      '<option value="replace"'+(blend==='replace'?' selected':'')+'>= Rep</option>'+
    '</select>'+
    '<input type="range" class="lop" min="0" max="2" step="0.05" value="'+op+'">'+
    '<span class="svs lop-v">'+op.toFixed(2)+'</span>'+
    '<button class="btn sm er lrm" title="Remove"><svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"display:inline-block;vertical-align:middle;flex-shrink:0\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg></button>';
  var eqIn=row.querySelector('.leq');
  var chk=row.querySelector('input[type=checkbox]');
  var blSel=row.querySelector('.lblend');
  var opR=row.querySelector('.lop');
  var opV=row.querySelector('.lop-v');
  eqIn.addEventListener('input',function(){
    lay.eq=eqIn.value;
    try{lay.fn=getEquationFn(eqIn.value);eqIn.style.borderColor='';}
    catch(e){lay.fn=null;eqIn.style.borderColor='var(--er)';}
    updateDNA();
  });
  chk.addEventListener('change',function(){lay.on=chk.checked;});
  blSel.addEventListener('change',function(){lay.blend=blSel.value;});
  opR.addEventListener('input',function(){lay.op=parseFloat(opR.value);opV.textContent=lay.op.toFixed(2);});
  row.querySelector('.lrm').addEventListener('click',function(){
    STATE.layers=STATE.layers.filter(function(l){return l.id!==id;});
    row.remove();updateDNA();renumLayers();
  });
  $('lay-con').appendChild(row);
  updateDNA();renumLayers();
}

function renumLayers(){
  var rows=$('lay-con').querySelectorAll('.lay-row');
  rows.forEach(function(r,i){
    var sp=r.querySelector('span');
    if(sp) sp.textContent='L'+(i+1);
  });
}

// ── TERRAIN REGIONS ──────────────────────────────────────────────
var rgnN = 0;

var RGN_PRESETS = [
  {label:'Mountain Range',  eq:'fbm(x,y,6)*3 + ridge(x,y)*1.5'},
  {label:'Rolling Hills',   eq:'fbm(x,y,4)*2'},
  {label:'Tropical Island', eq:'island(x,y,3.5)'},
  {label:'Canyon Lands',    eq:'canyon(x,y)'},
  {label:'Volcano',         eq:'volcano(x,y)'},
  {label:'Fjord Coast',     eq:'fjord(x,y)'},
  {label:'Desert Mesa',     eq:'mesa(x,y)'},
  {label:'Archipelago',     eq:'archipelago(x,y)'},
  {label:'Flat Plains',     eq:'plains(x,y)'},
  {label:'High Plateau',    eq:'fbm(x*0.5,y*0.5,8)*4-0.5'},
  {label:'Billow Clouds',   eq:'billow(x,y,5)*2.5'},
  {label:'Voronoi Cells',   eq:'voronoi(x,y,0.8)*3'},
  {label:'Domain Warp',     eq:'warp(x,y,1.2)*2'},
  {label:'Ridge + FBM',     eq:'ridge(x,y)*2 + fbm(x*1.5,y*1.5,4)*1.2'},
  {label:'Custom…',         eq:'fbm(x,y,4)*2'}
];

function updateRgnCount(){
  var badge = $('rgn-count-badge');
  var n = STATE.regions ? STATE.regions.length : 0;
  if(badge) badge.textContent = n + (n===1?' zone':' zones');
}

function addRegion(eq, x, y, radius, strength, blend, on){
  eq       = eq       !== undefined ? eq       : RGN_PRESETS[0].eq;
  x        = x        !== undefined ? x        : 0;
  y        = y        !== undefined ? y        : 0;
  radius   = radius   !== undefined ? radius   : 0.5;
  strength = strength !== undefined ? strength : 1.0;
  blend    = blend    !== undefined ? blend    : 'blend';
  on       = on       !== undefined ? on       : true;

  var id = ++rgnN;
  var fn = null;
  try{ fn = getEquationFn(eq); }catch(e){}
  var rgn = {id:id, eq:eq, x:x, y:y, radius:radius, strength:strength, blend:blend, on:on, fn:fn};
  STATE.regions.push(rgn);
  renderRegionRow(rgn);
  updateRgnCount();
  return rgn;
}

function renderRegionRow(rgn){
  var con = $('rgn-con');
  if(!con) return;

  // Remove empty placeholder
  var empty = con.querySelector('.rgn-empty');
  if(empty) empty.remove();

  var row = document.createElement('div');
  row.className = 'rgn-row';
  row.id = 'rgn-' + rgn.id;

  // Build preset options
  var presOpts = RGN_PRESETS.map(function(p, i){
    var isCustom = (i === RGN_PRESETS.length-1);
    var val = isCustom ? '__custom__' : p.eq;
    var sel = isCustom ? '' : (p.eq === rgn.eq ? ' selected' : '');
    return '<option value="'+escH(val)+'"'+sel+'>'+escH(p.label)+'</option>';
  }).join('');
  // If no preset matched, fall back to the "Custom…" option
  var presetMatched = RGN_PRESETS.slice(0,-1).some(function(p){ return p.eq === rgn.eq; });

  var idxLabel = STATE.regions.indexOf(rgn)+1;

  row.innerHTML =
    '<div class="rgn-row-head">'+
      '<span class="rgn-idx" id="rgni-'+rgn.id+'">Z'+idxLabel+'</span>'+
      '<div class="tog on" id="rt-'+rgn.id+'" style="cursor:pointer;flex-shrink:0" title="Enable/disable zone"></div>'+
      '<select class="rgn-preset-sel" data-rid="'+rgn.id+'" style="flex:1;font-size:9px">'+presOpts+'</select>'+
      '<select class="rgn-blend-sel" data-rid="'+rgn.id+'" style="font-size:9px;width:72px">'+
        '<option value="blend"'+(rgn.blend==='blend'?' selected':'')+'>Blend</option>'+
        '<option value="add"'+(rgn.blend==='add'?' selected':'')+'>Add</option>'+
        '<option value="replace"'+(rgn.blend==='replace'?' selected':'')+'>Replace</option>'+
        '<option value="multiply"'+(rgn.blend==='multiply'?' selected':'')+'>Multiply</option>'+
      '</select>'+
      '<button class="btn sm er rgn-del" data-rid="'+rgn.id+'" style="padding:4px 7px;flex-shrink:0">'+
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'+
      '</button>'+
    '</div>'+
    '<div class="rgn-eq-row">'+
      '<span class="rgn-eq-pfx">h(x,y)=</span>'+
      '<input type="text" class="rgn-eq" data-rid="'+rgn.id+'" value="'+escH(rgn.eq)+'" placeholder="fbm(x,y,4)*2 ...">'+
    '</div>'+
    '<div class="rgn-row-sliders">'+
      '<div class="rgn-sl"><span class="slbl">X</span><input type="range" class="rgn-x" data-rid="'+rgn.id+'" min="-1" max="1" step="0.05" value="'+rgn.x+'"><span class="svs rgn-xv">'+rgn.x.toFixed(2)+'</span></div>'+
      '<div class="rgn-sl"><span class="slbl">Y</span><input type="range" class="rgn-y" data-rid="'+rgn.id+'" min="-1" max="1" step="0.05" value="'+rgn.y+'"><span class="svs rgn-yv">'+rgn.y.toFixed(2)+'</span></div>'+
      '<div class="rgn-sl"><span class="slbl">Rad</span><input type="range" class="rgn-r" data-rid="'+rgn.id+'" min="0.1" max="1.5" step="0.05" value="'+rgn.radius+'"><span class="svs rgn-rv">'+rgn.radius.toFixed(2)+'</span></div>'+
      '<div class="rgn-sl"><span class="slbl">Str</span><input type="range" class="rgn-s" data-rid="'+rgn.id+'" min="0.1" max="3" step="0.1" value="'+rgn.strength+'"><span class="svs rgn-sv">'+rgn.strength.toFixed(1)+'</span></div>'+
    '</div>';

  // Wire events
  var togEl  = row.querySelector('#rt-'+rgn.id);
  togEl.classList.toggle('on', rgn.on);
  togEl.addEventListener('click', function(){
    rgn.on = !rgn.on;
    togEl.classList.toggle('on', rgn.on);
  });

  var presetSelEl = row.querySelector('.rgn-preset-sel');
  var eqInEl = row.querySelector('.rgn-eq');
  if(!presetMatched) presetSelEl.value = '__custom__';

  presetSelEl.addEventListener('change', function(e){
    if(e.target.value === '__custom__') return; // keep current custom equation
    rgn.eq = e.target.value;
    eqInEl.value = rgn.eq;
    eqInEl.classList.remove('ie');
    try{ rgn.fn = getEquationFn(rgn.eq); }catch(e2){}
  });
  row.querySelector('.rgn-blend-sel').addEventListener('change', function(e){
    rgn.blend = e.target.value;
  });

  eqInEl.addEventListener('input', function(e){
    rgn.eq = e.target.value;
    try{
      rgn.fn = getEquationFn(rgn.eq);
      eqInEl.classList.remove('ie');
    }catch(e2){
      rgn.fn = null;
      eqInEl.classList.add('ie');
    }
    // Sync preset dropdown: select matching preset, or fall back to "Custom…"
    var match = RGN_PRESETS.slice(0,-1).find(function(p){ return p.eq === rgn.eq; });
    presetSelEl.value = match ? match.eq : '__custom__';
  });
  eqInEl.addEventListener('keydown', function(e){
    if(e.key==='Enter'){ generate(); }
  });

  row.querySelector('.rgn-x').addEventListener('input', function(e){
    rgn.x = parseFloat(e.target.value);
    row.querySelector('.rgn-xv').textContent = rgn.x.toFixed(2);
  });
  row.querySelector('.rgn-y').addEventListener('input', function(e){
    rgn.y = parseFloat(e.target.value);
    row.querySelector('.rgn-yv').textContent = rgn.y.toFixed(2);
  });
  row.querySelector('.rgn-r').addEventListener('input', function(e){
    rgn.radius = parseFloat(e.target.value);
    row.querySelector('.rgn-rv').textContent = rgn.radius.toFixed(2);
  });
  row.querySelector('.rgn-s').addEventListener('input', function(e){
    rgn.strength = parseFloat(e.target.value);
    row.querySelector('.rgn-sv').textContent = rgn.strength.toFixed(1);
  });

  row.querySelector('.rgn-del').addEventListener('click', function(){
    STATE.regions = STATE.regions.filter(function(r){ return r.id !== rgn.id; });
    row.remove();
    renumRegions();
    updateRgnCount();
    if(!STATE.regions.length && !STATE.importedTerrains.length){
      var c = $('rgn-con');
      if(c) c.innerHTML = '<div class="rgn-empty">No zones yet — add or import one below</div>';
    }
  });

  con.appendChild(row);
}

function renumRegions(){
  if(!STATE.regions) return;
  STATE.regions.forEach(function(rgn, i){
    var lbl = document.getElementById('rgni-'+rgn.id);
    if(lbl) lbl.textContent = 'Z'+(i+1);
  });
}
