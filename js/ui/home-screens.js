var VIZ_IDS=['terrain-stats','terrain-ui','utog','viz-topbar'];

var _tfHomeOnce=false;
function showVisualizer(name){
  var home=$('home-screen');

  // Pre-show viz elements underneath home (home z:200 covers them)
  $('proj-cur-name').textContent=name||'Unsaved Map';
  $('viz-topbar').style.display='flex';
  $('terrain-stats').style.display='flex';
  // Apply hidden class if user toggled it off before
  if(typeof _statsVisible !== 'undefined') updateStatsTog();
  $('terrain-ui').style.display='flex';
  $('utog').style.display='flex';
  updateZoomLevel();

  // Animate home out — canvas reveals naturally beneath
  home.classList.remove('page-entering');
  home.classList.add('page-exiting');

  setTimeout(function(){
    home.style.display='none';
    home.classList.remove('page-exiting');
  }, 260);
}
function showHome(){
  // Hide viz instantly — home z:200 covers canvas
  if(_animOpen) animClose();
  if(coordMode) exitCoordMode();
  $('viz-topbar').style.display='none';
  $('terrain-stats').style.display='none';
  $('terrain-ui').style.display='none';
  $('utog').style.display='none';
  currentProjId=null;
  loadHomeProjects();

  var home=$('home-screen');
  home.style.display='flex';

  // First load: instant, no animation (prevents canvas flash)
  if(!_tfHomeOnce){ _tfHomeOnce=true; return; }

  // Returning from visualizer: slide up + fade
  home.classList.remove('page-exiting');
  home.classList.add('page-entering');
  setTimeout(function(){ home.classList.remove('page-entering'); }, 400);
}

function fmtDate(ts){
  if(!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
}

function loadHomeProjects(){
  getAllMaps(function(maps){
    var grid=$('proj-grid');grid.innerHTML='';
    $('hs-proj-count').textContent=maps.length;
    if(!maps.length){
      grid.innerHTML='<div class="empty-state">'+
        '<div class="empty-icon" style="font-size:0"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px" style="display:block;margin:0 auto 12px;opacity:.5"><path d="M3 20l5.5-11 3.5 6 2.5-4 5.5 9H3z"/></svg></div>'+
        '<h3>No saved maps yet</h3>'+
        '<p>Create your first terrain using the + button above.</p>'+
        '</div>';
      return;
    }
    maps.sort(function(a,b){return(b.updatedAt||0)-(a.updatedAt||0);});
    maps.forEach(function(m){grid.appendChild(mkMapCard(m));});
  });
}

function mkMapCard(proj){
  var card=document.createElement('div');card.className='proj-card';
  var eq=(proj.state&&proj.state.eq)||'—';
  var eqShort=eq.length>44?eq.slice(0,42)+'…':eq;
  var thumb=proj.thumbnail||'';
  card.innerHTML=
    '<div class="proj-thumb">'+
      (thumb?'<img src="'+thumb+'" alt="Map preview" loading="lazy">':'<div class="proj-thumb-placeholder"><svg width=\"36\" height=\"36\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"display:inline-block;vertical-align:middle;flex-shrink:0\"><path d=\"M3 20l5.5-11 3.5 6 2.5-4 5.5 9H3z\"/></svg></div>')+
      '<div class="proj-thumb-overlay"></div>'+
    '</div>'+
    '<div class="proj-info">'+
      '<div class="proj-name">'+escH(proj.name)+'</div>'+
      '<div class="proj-meta"><span class="proj-meta-lbl">Seed</span><span class="proj-meta-val">'+((proj.state&&proj.state.seed)||'—')+'</span></div>'+
      '<div class="proj-meta"><span class="proj-meta-lbl">Updated</span><span class="proj-meta-val">'+fmtDate(proj.updatedAt)+'</span></div>'+
      '<div class="proj-eq"><code>h = '+escH(eqShort)+'</code></div>'+
    '</div>'+
    '<div class="proj-actions">'+
      '<button class="proj-open">▶ Open Map</button>'+
      '<button class="proj-del" title="Delete"><svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"display:inline-block;vertical-align:middle;flex-shrink:0\"><polyline points=\"3 6 5 6 21 6\"/><path d=\"M19 6l-1 14H6L5 6\"/><path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M9 6V4h6v2\"/></svg></button>'+
    '</div>';
  card.querySelector('.proj-open').addEventListener('click',function(e){
    e.stopPropagation();openMap(proj);
  });
  card.querySelector('.proj-del').addEventListener('click',function(e){
    e.stopPropagation();
    var btn=e.currentTarget;
    if(btn.dataset.confirming==='1'){
      btn.dataset.confirming='0';
      deleteMapDB(proj.id,function(){loadHomeProjects();});
    }else{
      btn.dataset.confirming='1';btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg>';
      btn.style.cssText='background:rgba(240,68,102,.32)!important;border-color:#f04466!important;color:#fff!important;';
      setTimeout(function(){
        if(btn.dataset.confirming==='1'){
          btn.dataset.confirming='0';btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>';btn.style.cssText='';
        }
      },2500);
    }
  });
  card.addEventListener('click',function(){openMap(proj);});
  return card;
}

function openMap(proj){
  currentProjId=proj.id;
  showVisualizer(proj.name);
  restoreState(proj.state);
}

function showSaveModal(){
  var inp=$('proj-name-inp');
  inp.value=$('proj-cur-name').textContent==='Unsaved Map'?'':$('proj-cur-name').textContent;
  $('save-modal').classList.add('open');
  setTimeout(function(){inp.focus();inp.select();},60);
}
function hideSaveModal(){$('save-modal').classList.remove('open');}
function doSave(){
  var name=$('proj-name-inp').value.trim()||'Untitled Map';
  var now=Date.now();
  var state=captureState();
  var thumb=captureThumb();
  hideSaveModal();
  function performSave(createdAt){
    var proj={name:name,createdAt:createdAt,updatedAt:now,state:state,thumbnail:thumb};
    if(currentProjId) proj.id=currentProjId;
    saveMapDB(proj,function(id){
      currentProjId=id;
      $('proj-cur-name').textContent=name;
      toast('Saved','"'+escH(name)+'" saved to library.');
    });
  }
  if(currentProjId){
    getMapById(currentProjId,function(ex){performSave(ex?ex.createdAt:now);});
  }else{
    performSave(now);
  }
}
