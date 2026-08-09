window.addEventListener('DOMContentLoaded',function(){
  try{
    initThree();
    bindEvents();
    syncAllUI();
    updateDNA();
    initPlacementHUD();
    $('loading').style.display='none';
    showHome();
    animate();
  // ── EXPORT DROPDOWN ────────────────────────────────────────
  var expTrigger = $('btn-export-menu');
  var expDropdown = $('export-dropdown');
  var expWrap = $('export-menu-wrap');
  if(expTrigger && expDropdown){
    function openExpMenu(){
      expDropdown.classList.add('open');
      expTrigger.classList.add('active');
    }
    function closeExpMenu(){
      expDropdown.classList.remove('open');
      expTrigger.classList.remove('active');
    }
    expTrigger.addEventListener('click', function(e){
      e.stopPropagation();
      expDropdown.classList.contains('open') ? closeExpMenu() : openExpMenu();
    });
    document.addEventListener('click', function(e){
      if(expWrap && !expWrap.contains(e.target)) closeExpMenu();
    });
    expDropdown.querySelectorAll('.exp-item').forEach(function(item){
      item.addEventListener('click', function(){
        if(item.dataset.exp === '__anim__'){
          closeExpMenu();
          if(ANIM.keyframes.length < 2){
            toast('No Animation','Add at least 2 keyframes in the Animate panel first.');
          } else {
            openAnimExportModal();
          }
          return;
        }
        var realBtn = $(item.dataset.exp);
        closeExpMenu();
        setTimeout(function(){ if(realBtn) realBtn.click(); }, 100);
      });
    });

    // Update "Export Animation" desc whenever dropdown opens
    expTrigger.addEventListener('click', function(){
      var animDesc = $('exp-anim-desc');
      var animItem = $('exp-item-anim');
      if(animDesc){
        if(ANIM.keyframes.length < 2){
          animDesc.textContent = 'Open Animate panel · add 2+ keyframes';
          if(animItem) animItem.style.opacity = '0.5';
        } else {
          animDesc.textContent = ANIM.keyframes.length+' keyframes · '+ANIM.duration+'s duration';
          if(animItem) animItem.style.opacity = '1';
        }
      }
    });
  }

  // ── ANIMATION EXPORT BUTTON (toolbar) ─────────────────────────
  var _animExportBtn = $('anim-btn-export');
  if(_animExportBtn){
    _animExportBtn.addEventListener('click', function(){
      if(ANIM.keyframes.length < 2){
        toast('Not Enough Keyframes','Add at least 2 keyframes before exporting.');
        return;
      }
      openAnimExportModal();
    });
  }

  }catch(e){
    console.error(e);
    $('loading').innerHTML='<h2 style="color:#f04466">Initialisation Error</h2><p style="color:#a0b0c0;font-size:12px">'+e.message+'</p>';
  }
});

