var NG = {
  nodes: {},
  connections: [],   
  dragging:  null,   
  connecting: null,  
  nodeIdCounter: 0,

  /* ── Node type registry ─────────────────────────────────────────── */
  types: {
    fbm:        {label:'FBM Noise',      color:'#1a4d7a', inputs:[],        outputs:['h'],   params:{oct:6, rough:0.5, scale:1.0, amp:1.0}},
    ridge:      {label:'Ridge Noise',    color:'#1a4d7a', inputs:[],        outputs:['h'],   params:{scale:1.0}},
    billow:     {label:'Billow Noise',   color:'#0d3a6a', inputs:[],        outputs:['h'],   params:{scale:1.0, oct:5, rough:0.5}},
    voronoi:    {label:'Voronoi',        color:'#0a2d52', inputs:[],        outputs:['h'],   params:{scale:1.0, jitter:0.8}},
    warp:       {label:'Domain Warp',    color:'#1a4060', inputs:[],        outputs:['h'],   params:{strength:0.8, scale:1.0}},
    island:     {label:'Island',         color:'#1a5c3a', inputs:[],        outputs:['h'],   params:{radius:3.5}},
    canyon:     {label:'Canyon',         color:'#5c3a1a', inputs:[],        outputs:['h'],   params:{}},
    volcano:    {label:'Volcano',        color:'#7a1a1a', inputs:[],        outputs:['h'],   params:{}},
    mesa:       {label:'Mesa',           color:'#5c4a1a', inputs:[],        outputs:['h'],   params:{}},
    terrace:    {label:'Terrace',        color:'#3a4a1a', inputs:['a'],     outputs:['out'], params:{steps:5}},
    abs:        {label:'Abs |A|',        color:'#2a3a5e', inputs:['a'],     outputs:['out'], params:{}},
    clamp:      {label:'Clamp',          color:'#2a3a5e', inputs:['a'],     outputs:['out'], params:{lo:0.0, hi:1.0}},
    smoothstep: {label:'Smoothstep',     color:'#2a3a5e', inputs:['a'],     outputs:['out'], params:{lo:0.0, hi:1.0}},
    power:      {label:'Power A^n',      color:'#2a3a5e', inputs:['a'],     outputs:['out'], params:{exp:2.0}},
    add:        {label:'Add A+B',        color:'#2d2d6e', inputs:['a','b'], outputs:['out'], params:{}},
    multiply:   {label:'Multiply AxB',   color:'#2d2d6e', inputs:['a','b'], outputs:['out'], params:{k:1.0}},
    subtract:   {label:'Subtract A-B',   color:'#2d2d6e', inputs:['a','b'], outputs:['out'], params:{}},
    scale:      {label:'Scale Axk',      color:'#2d2d6e', inputs:['a'],     outputs:['out'], params:{k:1.5}},
    offset:     {label:'Offset A+k',     color:'#2d2d6e', inputs:['a'],     outputs:['out'], params:{k:0.5}},
    mix:        {label:'Mix A-B',        color:'#3a2d6e', inputs:['a','b'], outputs:['out'], params:{t:0.5}},
    max_n:      {label:'Max(A,B)',       color:'#2d3a6e', inputs:['a','b'], outputs:['out'], params:{}},
    min_n:      {label:'Min(A,B)',       color:'#2d3a6e', inputs:['a','b'], outputs:['out'], params:{}},
    output:     {label:'Output',         color:'#3d1a5c', inputs:['h'],     outputs:[],      params:{}}
  },



  
  _topoSort: function(){
    var ids=Object.keys(NG.nodes), inDeg={}, adj={};
    ids.forEach(function(id){ inDeg[id]=0; adj[id]=[]; });
    NG.connections.forEach(function(c){
      inDeg[c.toId]=(inDeg[c.toId]||0)+1;
      adj[c.fromId].push(c.toId);
    });
    var queue=ids.filter(function(id){ return inDeg[id]===0; }), order=[];
    while(queue.length){
      var u=queue.shift(); order.push(u);
      adj[u].forEach(function(v){ if(--inDeg[v]===0) queue.push(v); });
    }
    if(order.length!==ids.length){
      var cycle=ids.filter(function(id){ return inDeg[id]>0; });
      return {order:null, cycle:cycle};
    }
    return {order:order, cycle:null};
  },

  /* ── PASS 2: DFS reachability from Output node (dead-code elim) ── */
  _reachable: function(){
    var outNode=null;
    Object.values(NG.nodes).forEach(function(n){ if(n.type==='output') outNode=n; });
    if(!outNode) return {live:new Set(), dead:Object.keys(NG.nodes)};
    var prev={};
    NG.connections.forEach(function(c){
      if(!prev[c.toId]) prev[c.toId]=[];
      prev[c.toId].push(c.fromId);
    });
    var live=new Set(), stack=[outNode.id];
    while(stack.length){
      var u=stack.pop(); if(live.has(u)) continue; live.add(u);
      (prev[u]||[]).forEach(function(p){ if(!live.has(p)) stack.push(p); });
    }
    return {live:live, dead:Object.keys(NG.nodes).filter(function(id){ return !live.has(id); })};
  },

  /* ── PASS 3: CSE + strength-reduction expression assembly ─────── */
  _buildExpr: function(topo, reach){
    var nodes=NG.nodes, conns=NG.connections;
    var exprOf={}, cseMap={}, stats={cse:0,sr:0,dead:reach.dead.length};
    var RZ=/^0(\.0+)?$/, RO=/^1(\.0+)?$/;

    // Filter node types that take a single 'a' input and transform it.
    // If their input is unconnected we fall back to a base FBM so they
    // produce real terrain instead of a flat black plain.
    var FILTER_NODES = ['terrace','abs','clamp','smoothstep','power','scale','offset'];

    function feed(toId,port){
      var c=conns.find(function(c){ return c.toId===toId&&c.toPort===port; });
      if(c) return exprOf[c.fromId]||'0';
      // Smart default for single-input filter nodes: use base FBM
      var nodeType = nodes[toId] && nodes[toId].type;
      if(port==='a' && FILTER_NODES.indexOf(nodeType)>=0){
        return 'fbm(x,y,6,0.500)';
      }
      return '0';
    }

    topo.order.forEach(function(nid){
      if(!reach.live.has(nid)) return;
      var node=nodes[nid], p=node.params, expr;
      switch(node.type){
        case 'fbm':{
          var sc=(p.scale||1).toFixed(3),oc=0|p.oct,ro=(p.rough||0.5).toFixed(3),am=p.amp||1;
          expr='fbm(x*'+sc+',y*'+sc+','+oc+','+ro+')';
          if(Math.abs(am-1)>0.005) expr='('+expr+'*'+am.toFixed(3)+')';
          break;
        }
        case 'ridge':{
          var sc=(p.scale||1).toFixed(3);
          expr='ridge(x*'+sc+',y*'+sc+')'; break;
        }
        case 'billow':{
          var sc=(p.scale||1).toFixed(3),oc=0|p.oct,ro=(p.rough||0.5).toFixed(3);
          expr='billow(x*'+sc+',y*'+sc+','+oc+','+ro+')'; break;
        }
        case 'voronoi':{
          var sc=(p.scale||1).toFixed(3),ji=(p.jitter||0.8).toFixed(3);
          expr='voronoi(x*'+sc+',y*'+sc+','+ji+')'; break;
        }
        case 'warp':{
          var sc=(p.scale||1).toFixed(3),st=(p.strength||0.8).toFixed(3);
          expr='warp(x*'+sc+',y*'+sc+','+st+')'; break;
        }
        case 'island': expr='island(x,y,'+(p.radius||3.5).toFixed(2)+')'; break;
        case 'canyon': expr='canyon(x,y)'; break;
        case 'volcano':expr='volcano(x,y)'; break;
        case 'mesa':   expr='mesa(x,y)'; break;
        case 'terrace':{
          var a=feed(nid,'a'),st=Math.max(2,(0|p.steps)||5);
          expr='(floor(('+a+')*'+st+'.0)/'+st+'.0)'; break;
        }
        case 'abs':  expr='abs('+feed(nid,'a')+')'; break;
        case 'clamp':{
          var a=feed(nid,'a'),lo=(p.lo||0).toFixed(3),hi=(p.hi||1).toFixed(3);
          expr='max('+lo+',min('+hi+',('+a+')))'; break;
        }
        case 'smoothstep':{
          var a=feed(nid,'a'),lo=(p.lo||0).toFixed(3),hi=(p.hi||1).toFixed(3);
          expr='smoothstep('+lo+','+hi+',('+a+'))'; break;
        }
        case 'power':{
          var a=feed(nid,'a'),e=p.exp||2;
          if(Math.abs(e-1)<0.005){expr=a;stats.sr++;}
          else if(Math.abs(e)<0.005){expr='1';stats.sr++;}
          else expr='pow(max(0,('+a+')),'+e.toFixed(3)+')'; break;
        }
        case 'add':{
          var a=feed(nid,'a'),b=feed(nid,'b');
          if(RZ.test(a)){expr=b;stats.sr++;}
          else if(RZ.test(b)){expr=a;stats.sr++;}
          else expr='(('+a+')+('+b+'))'; break;
        }
        case 'subtract':{
          var a=feed(nid,'a'),b=feed(nid,'b');
          if(RZ.test(b)){expr=a;stats.sr++;}
          else expr='(('+a+')-('+b+'))'; break;
        }
        case 'multiply':{
          var a=feed(nid,'a'),b=feed(nid,'b'),k=p.k||1;
          if(RZ.test(a)||RZ.test(b)){expr='0';stats.sr++;}
          else if(RO.test(a)){expr=b;stats.sr++;}
          else if(RO.test(b)){expr=a;stats.sr++;}
          else{
            expr='(('+a+')*('+b+'))';
            if(Math.abs(k-1)>0.005) expr='('+expr+'*'+k.toFixed(3)+')';
          } break;
        }
        case 'scale':{
          var a=feed(nid,'a'),k=p.k||1.5;
          if(Math.abs(k-1)<0.005){expr=a;stats.sr++;}
          else if(Math.abs(k)<0.005){expr='0';stats.sr++;}
          else expr='(('+a+')*'+k.toFixed(3)+')'; break;
        }
        case 'offset':{
          var a=feed(nid,'a'),k=p.k||0;
          if(Math.abs(k)<0.005){expr=a;stats.sr++;}
          else expr='(('+a+')+'+k.toFixed(3)+')'; break;
        }
        case 'mix':{
          var a=feed(nid,'a'),b=feed(nid,'b'),t=p.t||0.5;
          if(Math.abs(t)<0.005){expr=a;stats.sr++;}
          else if(Math.abs(t-1)<0.005){expr=b;stats.sr++;}
          else expr='((1-'+t.toFixed(3)+')*('+a+')+'+t.toFixed(3)+'*('+b+'))'; break;
        }
        case 'max_n':{
          var a=feed(nid,'a'),b=feed(nid,'b');
          expr='max(('+a+'),('+b+'))'; break;
        }
        case 'min_n':{
          var a=feed(nid,'a'),b=feed(nid,'b');
          expr='min(('+a+'),('+b+'))'; break;
        }
        case 'output':{
          var c=conns.find(function(c){ return c.toId===nid&&c.toPort==='h'; });
          exprOf[nid]=c?(exprOf[c.fromId]||'0'):'0'; return;
        }
        default: expr='0';
      }
      // CSE fingerprint
      var inputExprs=(NG.types[node.type].inputs||[]).map(function(port){ return feed(nid,port); });
      var fp=node.type+'|'+JSON.stringify(p)+'|'+inputExprs.join(',');
      if(cseMap[fp]){ exprOf[nid]=cseMap[fp]; stats.cse++; }
      else           { exprOf[nid]=expr; cseMap[fp]=expr; }
    });
    return {exprOf:exprOf, stats:stats};
  },

  /* ── MAIN compile() ─────────────────────────────────────────────── */
  compile: function(){
    var status=$('ng-status'), diagPanel=$('ng-diag');

    // Pass 1: topological sort
    var topo=NG._topoSort();
    if(topo.cycle){
      var msg='Cycle detected ('+topo.cycle.length+' node'+(topo.cycle.length>1?'s':'')+' involved)';
      if(status){status.textContent='\u2717 '+msg;status.style.color='var(--er)';}
      if(diagPanel) diagPanel.innerHTML='<span style="color:var(--er)">\u2717 '+msg+'</span>';
      return null;
    }

    // Pass 2: locate Output node
    var outNode=null;
    Object.values(NG.nodes).forEach(function(n){ if(n.type==='output') outNode=n; });
    if(!outNode){
      var msg='No Output node in graph';
      if(status){status.textContent='\u2717 '+msg;status.style.color='var(--er)';}
      if(diagPanel) diagPanel.innerHTML='<span style="color:var(--er)">\u2717 '+msg+'</span>';
      return null;
    }

    // Pass 3: dead-code elimination
    var reach=NG._reachable();

    // Pass 4: CSE + strength-reduction code generation
    var build=NG._buildExpr(topo,reach);
    var eq=build.exprOf[outNode.id]||null;
    if(!eq||eq==='0'){
      var msg='Output has no connected input';
      if(status){status.textContent='\u26a0 '+msg;status.style.color='var(--go)';}
      if(diagPanel) diagPanel.innerHTML='<span style="color:var(--go)">\u26a0 '+msg+'</span>';
      return null;
    }

    // Diagnostics
    var s=build.stats, live=reach.live.size, total=Object.keys(NG.nodes).length;
    var lines=[];
    if(s.dead>0)  lines.push('<span style="color:var(--ok)">\u26a1 DCE pruned '+s.dead+' dead node'+(s.dead>1?'s':'')+'</span>');
    if(s.cse>0)   lines.push('<span style="color:var(--ok)">\u26a1 CSE eliminated '+s.cse+' duplicate subexpr'+(s.cse>1?'s':'')+'</span>');
    if(s.sr>0)    lines.push('<span style="color:var(--ok)">\u26a1 '+s.sr+' strength reduction'+(s.sr>1?'s':'')+' (\xd71\u2192id, +0\u2192id, \xd70\u21920\u2026)</span>');
    lines.push('<span style="color:var(--t3)">'+live+'/'+total+' nodes live \xb7 expr '+eq.length+' chars</span>');
    if(diagPanel) diagPanel.innerHTML=lines.join('<br>');

    if(status){
      status.textContent='\u2713 '+eq.slice(0,54)+(eq.length>54?'\u2026':'');
      status.style.color='var(--ok)';
    }
    return eq;
  },

  /* ── Node DOM rendering ─────────────────────────────────────────── */
  init: function(){
    var wrap=document.getElementById('ng-canvas-wrap'); if(!wrap) return;
    var nodes=document.getElementById('ng-nodes');
    var svg=document.getElementById('ng-svg');
    var status=document.getElementById('ng-status');

    document.getElementById('ng-add-node').addEventListener('change',function(){
      var t=this.value; if(!t) return; this.value='';
      NG.addNode(t,60+Math.random()*180,30+Math.random()*140);
    });

    document.getElementById('ng-compile').addEventListener('click',function(){
      var eq=NG.compile(); if(!eq) return;
      STATE.eq=eq;
      document.getElementById('terrain-eq').value=eq;
      document.getElementById('terrain-eq').classList.remove('ie');
      updateDNA(); generate();
    });

    document.getElementById('ng-clear').addEventListener('click',function(){
      NG.nodes={}; NG.connections=[]; NG.nodeIdCounter=0;
      nodes.innerHTML=''; NG.renderEdges();
      if(status){status.textContent='Graph cleared.';status.style.color='var(--t3)';}
      var dp=$('ng-diag');
      if(dp) dp.innerHTML='<span style="color:rgba(140,155,175,.5)">Compile graph to see diagnostics</span>';
    });

    wrap.addEventListener('mousedown',function(e){
      if(e.target===wrap||e.target===nodes||e.target===svg){
        if(NG.connecting){NG.connecting=null;NG.renderEdges();}
      }
    });

    wrap.addEventListener('touchstart',function(e){
      if(e.target===wrap||e.target===nodes||e.target===svg){
        if(NG.connecting){NG.connecting=null;NG.renderEdges();}
      }
    });

    NG.addNode('fbm',   30, 20);
    NG.addNode('ridge', 30, 120);
    NG.addNode('add',   210, 70);
    NG.addNode('output',370, 70);
  },

  addNode: function(type,x,y){
    var def=NG.types[type]; if(!def) return;
    var id='n'+(++NG.nodeIdCounter);
    var node={id:id,type:type,x:x,y:y,params:JSON.parse(JSON.stringify(def.params||{}))};
    NG.nodes[id]=node; NG.renderNode(node); NG.clampNode(node); NG.renderEdges();
    return node;
  },

  /* ── Keep a node's position inside the visible board area ──────────
     No-ops if the board is currently hidden (e.g. another tab is
     active), since its size reads as 0x0 in that case — fitAll() below
     re-clamps everyone once the board actually becomes visible. */
  clampNode: function(node){
    var wrap=document.getElementById('ng-canvas-wrap');
    var el=document.getElementById('ngn-'+node.id);
    if(!wrap||!el) return;
    if(!wrap.clientWidth||!wrap.clientHeight) return;
    var pad=4;
    var maxX=Math.max(pad,wrap.clientWidth-el.offsetWidth-pad);
    var maxY=Math.max(pad,wrap.clientHeight-el.offsetHeight-pad);
    node.x=Math.max(pad,Math.min(maxX,node.x));
    node.y=Math.max(pad,Math.min(maxY,node.y));
    el.style.left=node.x+'px';
    el.style.top=node.y+'px';
  },

  /* Re-fit the whole graph — called when the Nodes tab is opened, so
     nodes placed while the board was hidden (e.g. the default graph,
     laid out for a desktop-width board) land back on screen on phones.
     Scales positions (not node size) down uniformly so the relative
     layout is preserved instead of independently clamping each node,
     which would stack several of them on the same edge. */
  fitAll: function(){
    var wrap=document.getElementById('ng-canvas-wrap'); if(!wrap) return;
    var bw=wrap.clientWidth, bh=wrap.clientHeight;
    if(!bw||!bh) return;
    var pad=4, ids=Object.keys(NG.nodes); if(!ids.length) return;
    var maxRight=0, maxBottom=0;
    ids.forEach(function(id){
      var node=NG.nodes[id], el=document.getElementById('ngn-'+id);
      var w=el?el.offsetWidth:130, h=el?el.offsetHeight:90;
      maxRight=Math.max(maxRight,node.x+w);
      maxBottom=Math.max(maxBottom,node.y+h);
    });
    var scale=Math.min(1,(bw-pad)/Math.max(1,maxRight),(bh-pad)/Math.max(1,maxBottom));
    if(scale<1){
      ids.forEach(function(id){
        var node=NG.nodes[id];
        node.x=Math.round(node.x*scale);
        node.y=Math.round(node.y*scale);
      });
    }
    ids.forEach(function(id){ NG.clampNode(NG.nodes[id]); });
    NG.renderEdges();
  },

  renderNode: function(node){
    var def=NG.types[node.type];
    var wrap=document.getElementById('ng-nodes');
    var old=document.getElementById('ngn-'+node.id); if(old) old.remove();

    var el=document.createElement('div');
    el.id='ngn-'+node.id;
    el.className='ng-node';
    el.style.cssText='position:absolute;left:'+node.x+'px;top:'+node.y+'px;'+
      'background:'+def.color+';border:1px solid rgba(255,255,255,.18);border-radius:7px;'+
      'min-width:118px;cursor:move;z-index:5;user-select:none;'+
      'box-shadow:0 3px 14px rgba(0,0,0,.65)';

    var title='<div style="font-family:var(--fd);font-size:9px;font-weight:600;'+
      'color:rgba(235,245,255,.95);padding:5px 9px 4px;letter-spacing:.06em;'+
      'border-bottom:1px solid rgba(255,255,255,.12)">'+def.label+'</div>';

    // Per-parameter range metadata
    var RANGES={
      oct:{min:1,max:12,step:1}, steps:{min:2,max:20,step:1},
      rough:{min:0.01,max:1,step:0.01}, jitter:{min:0,max:1,step:0.01},
      t:{min:0,max:1,step:0.01},
      scale:{min:0.1,max:8,step:0.05}, amp:{min:0.1,max:5,step:0.05},
      radius:{min:0.5,max:8,step:0.1}, exp:{min:0.1,max:8,step:0.1},
      lo:{min:-2,max:4,step:0.05}, hi:{min:-2,max:4,step:0.05},
      k:{min:-6,max:10,step:0.05}, strength:{min:0,max:4,step:0.05}
    };
    var INT_PARAMS={oct:true,steps:true};

    var paramHTML='';
    Object.keys(node.params).forEach(function(k){
      var v=node.params[k], r=RANGES[k]||{min:-4,max:12,step:0.1}, isInt=INT_PARAMS[k];
      paramHTML+='<div style="display:flex;align-items:center;gap:4px;padding:2px 8px">'+
        '<span style="font-size:7.5px;color:rgba(200,220,255,.65);min-width:30px;font-family:var(--fd)">'+k+'</span>'+
        '<input type="range" data-pid="'+k+'" data-int="'+(isInt?1:0)+
          '" min="'+r.min+'" max="'+r.max+'" step="'+r.step+'" value="'+v+
          '" style="width:50px;height:2px;accent-color:#58c8f8">'+
        '<span class="ngpv" style="font-family:var(--fm);font-size:8px;color:#58c8f8;min-width:28px">'+
          (isInt?Math.round(v):parseFloat(v).toFixed(2))+'</span>'+
      '</div>';
    });

    var lp='<div style="display:flex;flex-direction:column;gap:3px">';
    def.inputs.forEach(function(p){
      lp+='<div style="display:flex;align-items:center;gap:3px">'+
        '<div class="ng-port" data-nid="'+node.id+'" data-port="'+p+'" data-dir="in" '+
          'style="width:10px;height:10px;border-radius:50%;background:rgba(88,200,248,.35);'+
          'border:1px solid #58c8f8;cursor:pointer;margin-left:-5px;flex-shrink:0"></div>'+
        '<span style="font-size:7px;color:rgba(170,200,235,.75);font-family:var(--fd)">'+p+'</span>'+
      '</div>';
    });
    lp+='</div>';
    var rp='<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end">';
    def.outputs.forEach(function(p){
      rp+='<div style="display:flex;align-items:center;gap:3px">'+
        '<span style="font-size:7px;color:rgba(170,200,235,.75);font-family:var(--fd)">'+p+'</span>'+
        '<div class="ng-port" data-nid="'+node.id+'" data-port="'+p+'" data-dir="out" '+
          'style="width:10px;height:10px;border-radius:50%;background:rgba(238,187,85,.4);'+
          'border:1px solid #eebb55;cursor:pointer;margin-right:-5px;flex-shrink:0"></div>'+
      '</div>';
    });
    rp+='</div>';

    var del='<div style="text-align:right;padding:0 6px 5px">'+
      '<button data-del="'+node.id+
      '" style="font-size:8px;color:rgba(240,68,102,.75);background:none;border:none;cursor:pointer;font-family:var(--fd)">\u2715 del</button></div>';

    el.innerHTML=title+paramHTML+
      '<div style="display:flex;justify-content:space-between;padding:4px 0 5px">'+lp+rp+'</div>'+del;
    wrap.appendChild(el);

    el.querySelectorAll('input[type=range][data-pid]').forEach(function(inp){
      var vSpan=inp.nextElementSibling, pid=inp.dataset.pid, isInt=inp.dataset.int==='1';
      inp.addEventListener('input',function(){
        var v=parseFloat(inp.value); if(isInt) v=Math.round(v);
        node.params[pid]=v;
        if(vSpan) vSpan.textContent=isInt?v:v.toFixed(2);
      });
    });

    el.querySelector('[data-del]').addEventListener('click',function(e){
      e.stopPropagation();
      var nid=e.currentTarget.dataset.del;
      NG.connections=NG.connections.filter(function(c){return c.fromId!==nid&&c.toId!==nid;});
      delete NG.nodes[nid]; el.remove(); NG.renderEdges();
    });

    el.querySelectorAll('.ng-port').forEach(function(port){
      port.addEventListener('mousedown',function(e){
        e.stopPropagation();
        var nid=port.dataset.nid, pn=port.dataset.port, dir=port.dataset.dir;
        if(dir==='out'){
          var r=port.getBoundingClientRect();
          var wR=document.getElementById('ng-canvas-wrap').getBoundingClientRect();
          NG.connecting={fromId:nid,fromPort:pn,x:r.left-wR.left+5,y:r.top-wR.top+5};
        } else if(dir==='in'&&NG.connecting){
          NG.connections=NG.connections.filter(function(c){return!(c.toId===nid&&c.toPort===pn);});
          NG.connections.push({fromId:NG.connecting.fromId,fromPort:NG.connecting.fromPort,toId:nid,toPort:pn});
          NG.connecting=null; NG.renderEdges();
        }
      });

      port.addEventListener('touchstart',function(e){
        e.stopPropagation();
        var t=e.touches[0]; if(!t) return;
        var nid=port.dataset.nid, pn=port.dataset.port, dir=port.dataset.dir;
        if(dir==='out'){
          var r=port.getBoundingClientRect();
          var wR=document.getElementById('ng-canvas-wrap').getBoundingClientRect();
          NG.connecting={fromId:nid,fromPort:pn,x:r.left-wR.left+5,y:r.top-wR.top+5};
        } else if(dir==='in'&&NG.connecting){
          NG.connections=NG.connections.filter(function(c){return!(c.toId===nid&&c.toPort===pn);});
          NG.connections.push({fromId:NG.connecting.fromId,fromPort:NG.connecting.fromPort,toId:nid,toPort:pn});
          NG.connecting=null; NG.renderEdges();
        }
        e.preventDefault();
      },{passive:false});
    });

    el.addEventListener('mousedown',function(e){
      if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON') return;
      e.stopPropagation();
      NG.dragging={id:node.id,ox:e.clientX-node.x,oy:e.clientY-node.y};
    });

    el.addEventListener('touchstart',function(e){
      if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON') return;
      e.stopPropagation();
      var t=e.touches[0]; if(!t) return;
      NG.dragging={id:node.id,ox:t.clientX-node.x,oy:t.clientY-node.y};
      e.preventDefault();
    },{passive:false});
  },

  getPortPos: function(nid,port,dir){
    var el=document.getElementById('ngn-'+nid); if(!el) return{x:0,y:0};
    var wR=document.getElementById('ng-canvas-wrap').getBoundingClientRect();
    var ports=el.querySelectorAll('.ng-port');
    for(var i=0;i<ports.length;i++){
      if(ports[i].dataset.port===port&&ports[i].dataset.dir===dir){
        var r=ports[i].getBoundingClientRect();
        return{x:r.left-wR.left+5,y:r.top-wR.top+5};
      }
    }
    return{x:dir==='in'?NG.nodes[nid].x:NG.nodes[nid].x+120,y:NG.nodes[nid].y+30};
  },

  renderEdges: function(){
    var svg=document.getElementById('ng-svg'); if(!svg) return;
    svg.innerHTML='';
    NG.connections.forEach(function(c){
      var p0=NG.getPortPos(c.fromId,c.fromPort,'out');
      var p1=NG.getPortPos(c.toId,c.toPort,'in');
      var dx=Math.abs(p1.x-p0.x)*0.5;
      var path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d','M'+p0.x+','+p0.y+' C'+(p0.x+dx)+','+p0.y+' '+(p1.x-dx)+','+p1.y+' '+p1.x+','+p1.y);
      path.setAttribute('stroke','rgba(88,200,248,.65)');
      path.setAttribute('stroke-width','1.5');
      path.setAttribute('fill','none');
      svg.appendChild(path);
    });
    if(NG.connecting){
      var p0={x:NG.connecting.x,y:NG.connecting.y};
      var p1={x:NG.connecting.mx||p0.x,y:NG.connecting.my||p0.y};
      var path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d','M'+p0.x+','+p0.y+' L'+p1.x+','+p1.y);
      path.setAttribute('stroke','rgba(238,187,85,.6)');
      path.setAttribute('stroke-width','1.5');
      path.setAttribute('stroke-dasharray','4,3');
      path.setAttribute('fill','none');
      svg.appendChild(path);
    }
  }
};


// Global mouse handlers for node dragging
document.addEventListener('mousemove',function(e){
  if(NG.dragging){
    var node=NG.nodes[NG.dragging.id];
    if(node){
      node.x=e.clientX-NG.dragging.ox;
      node.y=e.clientY-NG.dragging.oy;
      NG.clampNode(node);
      NG.renderEdges();
    }
  }
  if(NG.connecting){
    var wrapR=document.getElementById('ng-canvas-wrap');
    if(wrapR){
      var r=wrapR.getBoundingClientRect();
      NG.connecting.mx=e.clientX-r.left;
      NG.connecting.my=e.clientY-r.top;
      NG.renderEdges();
    }
  }
});
document.addEventListener('mouseup',function(){ NG.dragging=null; });

// Global touch handlers for node dragging (mobile/touch parity with mouse above)
document.addEventListener('touchmove',function(e){
  if(NG.dragging){
    var t=e.touches[0];
    var node=NG.nodes[NG.dragging.id];
    if(node&&t){
      node.x=t.clientX-NG.dragging.ox;
      node.y=t.clientY-NG.dragging.oy;
      NG.clampNode(node);
      NG.renderEdges();
    }
    e.preventDefault();
  }
  if(NG.connecting){
    var t2=e.touches[0];
    var wrapR=document.getElementById('ng-canvas-wrap');
    if(wrapR&&t2){
      var r=wrapR.getBoundingClientRect();
      NG.connecting.mx=t2.clientX-r.left;
      NG.connecting.my=t2.clientY-r.top;
      NG.renderEdges();
    }
  }
},{passive:false});
document.addEventListener('touchend',function(){ NG.dragging=null; });

