/* Made by Hotchkiss_Chronoshii */
/* Note to self: this is a prototype source code and may need alterations */
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], uid=()=>Math.random().toString(36).slice(2,10);
const DB='galaxyVirtusDB', STORE='app', KEY='state', ADMIN_CODE='virtus25';
const FIREBASE_CONFIG={apiKey:'AIzaSyBRQ_UztF2lwcX81RVinv-5FBaumAclAuk',authDomain:'schungdar.firebaseapp.com',databaseURL:'https://schungdar-default-rtdb.firebaseio.com',projectId:'schungdar',storageBucket:'schungdar.firebasestorage.app',messagingSenderId:'448271329140',appId:'1:448271329140:web:a69f2a5574d243e800ae21'};
let cloudRef=null, cloudReady=false, cloudApplying=false;
let state={territories:[]}, admin=false, filter='territory', pendingFlag=null, editorHidden=false, borderEditing=null, boundaryMode=null, tool=null, session=null, editingId=null, currentEditor=null;
let undoStack=[], editorUndoRecorded=false, activeTerritoryId=null, pureMap=false;
const view={z:1,tx:0,ty:0}; let natural={w:0,h:0};
const viewport=$('#viewport'), world=$('#world'), map=$('#map'), overlay=$('#overlay'), terrG=$('#territories'), previewG=$('#preview'), editG=$('#editHandles');
let dbPromise;
function db(){return dbPromise ||= new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function readState(){try{const d=await db();return await new Promise((res,rej)=>{const r=d.transaction(STORE,'readonly').objectStore(STORE).get(KEY);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}catch{return null}}
async function writeState(){try{const d=await db();await new Promise((res,rej)=>{const t=d.transaction(STORE,'readwrite');t.objectStore(STORE).put(state,KEY);t.oncomplete=res;t.onerror=()=>rej(t.error)});$('#storage').textContent='INDEXEDDB SAVED'}catch{$('#storage').textContent='STORAGE UNAVAILABLE'}}
const save=(()=>{let t;return()=>{clearTimeout(t);t=setTimeout(()=>{writeState();pushCloud()},180)}})();
function pushCloud(){
  if(!cloudReady||cloudApplying||!cloudRef)return;
  cloudRef.set(state.territories).then(()=>$('#storage').textContent='CLOUD SAVED · INDEXEDDB SAVED').catch(()=>$('#storage').textContent='LOCAL ONLY');
}
async function startCloud(){
  if(typeof firebase==='undefined'||!firebase.initializeApp){$('#storage').textContent='LOCAL ONLY';return}
  try{
    const app=firebase.apps?.find(a=>a.name==='project-starlight')||firebase.initializeApp(FIREBASE_CONFIG,'project-starlight');
    cloudRef=firebase.database(app).ref('project-starlight/boards/main/territories');
    const snap=await cloudRef.once('value'); const remote=snap.val();
    if(Array.isArray(remote)&&remote.length){
      const merged=new Map(state.territories.map(t=>[t.id,t]));
      remote.forEach(t=>{const old=merged.get(t.id);if(!old||(t.placedAt||0)>=(old.placedAt||0))merged.set(t.id,t)});
      state.territories=[...merged.values()]; normalizeTerritories(); await writeState();
    } else if(state.territories.length) await cloudRef.set(state.territories);
    cloudRef.on('value',s=>{const v=s.val();if(!Array.isArray(v))return;const local=new Map(state.territories.map(t=>[t.id,t]));v.forEach(t=>{const old=local.get(t.id);if(!old||(t.updatedAt||t.placedAt||0)>(old.updatedAt||old.placedAt||0))local.set(t.id,t)});state.territories=[...local.values()];normalizeTerritories();if(currentEditor)currentEditor=state.territories.find(t=>t.id===currentEditor.id)||null;writeState();render();}); cloudReady=true;
    $('#storage').textContent='CLOUD CONNECTED'; notice('CLOUD BOARD CONNECTED');
  }catch(e){console.warn('Cloud sync unavailable',e);$('#storage').textContent='LOCAL ONLY'}
}

/* Whoever is reading this SC, I apologize, I hate to have bjillions of lines. I am very disorganized */
function stateSnapshot(){return JSON.parse(JSON.stringify(state.territories||[]))}
function remember(){undoStack.push(stateSnapshot());if(undoStack.length>50)undoStack.shift();$('#undoBtn').disabled=false}
function undo(){if(!undoStack.length)return;state.territories=undoStack.pop();currentEditor=null;$('#editor').classList.add('hidden');session=null;boundaryMode=null;editingId=null;save();render();notice('LAST CHANGE UNDONE')}
function ensureEditorUndo(){if(!editorUndoRecorded){remember();editorUndoRecorded=true}}
function setEditorAccent(c){const color=c||'#b388ff';$('#editor').style.setProperty('--editor-accent',color);$('#editorTitle').style.color=color}
function notice(text,color=''){const n=$('#notice');n.textContent=text;n.className='notice '+color;clearTimeout(notice.t);notice.t=setTimeout(()=>n.classList.add('hidden'),2300)}
function zoomAt(px,py,factor){const nz=Math.max(.08,Math.min(8,view.z*factor));if(nz===view.z)return;view.tx=px-(px-view.tx)*(nz/view.z);view.ty=py-(py-view.ty)*(nz/view.z);view.z=nz;apply()}
function fit(){if(!natural.w)return;const z=Math.min(viewport.clientWidth/natural.w,viewport.clientHeight/natural.h)*.97;Object.assign(view,{z,tx:(viewport.clientWidth-natural.w*z)/2,ty:(viewport.clientHeight-natural.h*z)/2});apply()}
function apply(){world.style.transform=`translate3d(${view.tx}px,${view.ty}px,0) scale(${view.z})`;$('#zoom').textContent=Math.round(view.z*100)+'%';$('#zoomReadout').textContent=Math.round(view.z*100)+'%';render();}
function mapPoint(e){const r=viewport.getBoundingClientRect();return{x:(e.clientX-r.left-view.tx)/view.z,y:(e.clientY-r.top-view.ty)/view.z}}
function path(points){return points.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ')+' Z'}
function ringPath(ring){return ring.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ')+' Z'}
function geomPath(g){return (g||[]).flatMap(poly=>poly||[]).map(ringPath).join(' ')}
function toMulti(points){return [[points.map(p=>[p.x,p.y])]]}
function legacyGeometry(t){let g=toMulti(t.points);for(const a of (t.additions||[])){try{g=polygonClipping.union(g,toMulti(a))}catch{}}for(const a of (t.erasures||[])){try{g=polygonClipping.difference(g,toMulti(a))}catch{}}return g}
function normalizeTerritories(){for(const t of state.territories){if(!t.geometry||!t.geometry.length)t.geometry=legacyGeometry(t);}}
function geomCenter(g){const ring=g?.[0]?.[0];if(!ring?.length)return{x:0,y:0};let x=0,y=0;for(const p of ring){x+=p[0];y+=p[1]}return{x:x/ring.length,y:y/ring.length}}
function bbox(poly){return poly.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity})}
function inPoly(p,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],cross=((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x);if(cross)hit=!hit}return hit}
function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)}
function segHit(a,b,c,d){const x1=cross(a,b,c),x2=cross(a,b,d),x3=cross(c,d,a),x4=cross(c,d,b);return ((x1===0&&x2===0&&x3===0&&x4===0)||((x1>0)!==(x2>0)&&((x3>0)!==(x4>0))))}
function polysOverlap(a,b){const A=bbox(a),B=bbox(b);if(A.maxX<B.minX||B.maxX<A.minX||A.maxY<B.minY||B.maxY<A.minY)return false;if(a.some(p=>inPoly(p,b))||b.some(p=>inPoly(p,a)))return true;for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)if(segHit(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length]))return true;return false}
function territoryShapes(t){return [t.points,...(t.additions||[])].filter(p=>p&&p.length>2)}
function territoriesOverlap(a,b){return territoryShapes(a).some(x=>territoryShapes(b).some(y=>polysOverlap(x,y)))}
function consumeOverlaps(owner, shapes){for(const old of state.territories){if(old.id===owner.id)continue;if(shapes.some(shape=>territoryShapes(old).some(existing=>polysOverlap(shape,existing)))){old.erasures ||= [];for(const shape of shapes)old.erasures.push(shape.map(p=>({x:p.x,y:p.y})));}}}
function centerOf(points){let a=0,x=0,y=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length],cross=p.x*q.y-q.x*p.y;a+=cross;x+=(p.x+q.x)*cross;y+=(p.y+q.y)*cross}if(Math.abs(a)<.001)return points.reduce((r,p)=>({x:r.x+p.x/points.length,y:r.y+p.y/points.length}),{x:0,y:0});return{x:x/(3*a),y:y/(3*a)}}
function newerThan(a,b){return (a.placedAt||0)>(b.placedAt||0)}
function render(){
  overlay.classList.toggle('hidden',pureMap);
  terrG.innerHTML=''; previewG.innerHTML=''; editG.innerHTML='';
  const visible=state.territories.filter(t=>!t.hidden);
  for(const t of visible){if(!t.geometry?.length)continue;const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.classList.add('territory');if(currentEditor?.id===t.id)p.classList.add('selected');p.dataset.id=t.id;p.setAttribute('d',geomPath(t.geometry));p.setAttribute('fill',t.color||'#b388ff');p.setAttribute('fill-opacity','.28');p.setAttribute('stroke',t.color||'#b388ff');p.setAttribute('stroke-width','2');
    const later=visible.filter(o=>o.id!==t.id&&newerThan(o,t));if(later.length||(t.erasures||[]).length){const mask=document.createElementNS('http://www.w3.org/2000/svg','mask');mask.id='m'+t.id;const white=document.createElementNS('http://www.w3.org/2000/svg','path');white.setAttribute('d',geomPath(t.geometry));white.setAttribute('fill','white');mask.appendChild(white);(t.erasures||[]).forEach(a=>{const hole=document.createElementNS('http://www.w3.org/2000/svg','path');hole.setAttribute('d',path(a));hole.setAttribute('fill','black');mask.appendChild(hole)});later.forEach(o=>{const hole=document.createElementNS('http://www.w3.org/2000/svg','path');hole.setAttribute('d',geomPath(o.geometry));hole.setAttribute('fill','black');mask.appendChild(hole)});terrG.appendChild(mask);p.setAttribute('mask',`url(#m${t.id})`)}
    p.addEventListener('click',e=>{e.stopPropagation();if(admin)openEditor(t);else{currentEditor=t;showEditor(t,true)}});terrG.appendChild(p);
    const c=geomCenter(t.geometry);
    if(t.flag){const fi=document.createElementNS('http://www.w3.org/2000/svg','image');fi.setAttribute('href',t.flag);fi.setAttribute('x',c.x-18);fi.setAttribute('y',c.y-38);fi.setAttribute('width','36');fi.setAttribute('height','22');fi.setAttribute('preserveAspectRatio','xMidYMid slice');fi.setAttribute('pointer-events','none');terrG.appendChild(fi)}
    const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.classList.add('territory-label');label.setAttribute('x',c.x);label.setAttribute('y',c.y);label.setAttribute('fill',t.color||'#b388ff');label.textContent=(t.faction||'UNASSIGNED').toUpperCase();terrG.appendChild(label);
  }
  if(session?.points?.length){const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.classList.add('preview');p.setAttribute('d',path(session.points));previewG.appendChild(p)}
  if(borderEditing){const bt=state.territories.find(x=>x.id===borderEditing);if(bt)bt.points.forEach((q,i)=>{const h=document.createElementNS('http://www.w3.org/2000/svg','circle');h.classList.add('border-handle');h.dataset.index=i;h.setAttribute('cx',q.x);h.setAttribute('cy',q.y);h.setAttribute('r',Math.max(5,8/view.z));h.addEventListener('pointerdown',startHandleDrag);editG.appendChild(h)})}
  renderList();
}
function renderList(){const list=$('#territoryList');list.innerHTML='';$('#count').textContent=state.territories.length;$('#status').textContent='NATIONS';if(!state.territories.length){list.innerHTML='<div class="empty">NO TERRITORIES DEFINED</div>';return}for(const t of state.territories){const row=document.createElement('div');row.className='territory-row';row.innerHTML=`${t.flag?`<img class="row-flag" src="${t.flag}" alt="">`:`<span class="swatch" style="background:${t.color};color:${t.color}"></span>`}<span class="territory-name">${esc(t.faction||'UNASSIGNED')}</span><span class="territory-meta">${t.hidden?'HIDDEN':'ACTIVE'}</span>`;row.onclick=()=>{activeTerritoryId=t.id;filter='territory';syncFilter();center(t);};list.appendChild(row)}}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function syncFilter(){$('#territoryView').classList.add('active');render()}
function syncTools(){$('#adminBtn').textContent=admin?'🔓 LOCK EDITING':'🔒 UNLOCK EDITING';$('#adminBtn').classList.toggle('active',admin); $$('#toolPalette button').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));$('#addModeBtn').classList.toggle('active',boundaryMode==='add');$('#eraseModeBtn').classList.toggle('active',boundaryMode==='erase');$('#toolPalette').classList.toggle('hidden',editorHidden||!admin||filter!=='territory');$('#editorToggle').textContent=editorHidden?'SHOW EDITOR':'HIDE EDITOR';$('#editorToggle').classList.toggle('active',!editorHidden) }
let pendingAction=null;function requireAdmin(next){if(admin){next();return}pendingAction=next;$('#modal').classList.remove('hidden');$('#codeInput').value='';setTimeout(()=>$('#codeInput').focus(),20)}
function unlockAdmin(){if($('#codeInput').value.trim()!==ADMIN_CODE){notice('INVALID ACCESS CODE');return}admin=true;$('#modal').classList.add('hidden');syncTools();const next=pendingAction;pendingAction=null;next?.();notice('EDITING UNLOCKED')}
function toggleAdmin(){if(admin){admin=false;doneBoundaryMode();syncTools();notice('EDITING LOCKED')}else requireAdmin(()=>{})}
function setFilter(f){filter='territory';syncFilter();syncTools();syncFilter()}
function finish(points){
  if(!points||points.length<3){session=null;render();return}
  const clip=toMulti(points), now=Date.now();remember();
  if(boundaryMode&&editingId){
    const t=state.territories.find(x=>x.id===editingId); if(!t)return;
    try{
      if(boundaryMode==='add'){
        t.geometry=polygonClipping.union(t.geometry,clip);
        for(const old of state.territories){if(old.id!==t.id){old.geometry=polygonClipping.difference(old.geometry,clip);old.updatedAt=now}}
      }else t.geometry=polygonClipping.difference(t.geometry,clip);
    }catch(e){notice('GEOMETRY OPERATION FAILED');return}
    t.updatedAt=now;t.placedAt=now;state.territories=state.territories.filter(x=>x.geometry?.length);save();const action=boundaryMode==='add'?'AREA MERGED':'AREA ERASED';session=null;editingId=t.id;render();syncTools();notice(action+' — DRAW ANOTHER AREA OR PRESS DONE');return;
  }
  let t={id:uid(),geometry:clip,faction:'UNASSIGNED',color:'#b388ff',note:'',placedAt:now,updatedAt:now,hidden:false};
  for(const old of state.territories){try{old.geometry=polygonClipping.difference(old.geometry,clip);old.updatedAt=now}catch{}}
  state.territories=state.territories.filter(x=>x.geometry?.length);state.territories.push(t);session=null;editingId=null;save();render();openEditor(t);notice('TERRITORY READY — ASSIGN A FACTION')
}
function beginBoundaryEdit(t,kind){requireAdmin(()=>{closeEditor();activeTerritoryId=t.id;editingId=t.id;boundaryMode=kind;filter='territory';tool=kind==='add'?'boundary-add':'boundary-erase';syncFilter();syncTools();notice(kind==='add'?'DRAW AN AREA TO ADD TO THIS TERRITORY':'DRAW AN AREA TO CARVE OUT OF THIS TERRITORY')})}
function openEditor(t,readonly=false){currentEditor=t;showEditor(t,readonly)}
function showEditor(t,readonly){pendingFlag=null;editorUndoRecorded=false;setEditorAccent(t.color);$('#editorTitle').textContent=readonly?'NATION INFORMATION':'FACTION TERRITORY';$('#factionInput').value=t.faction||'UNASSIGNED';$('#colorInput').value=t.color||'#b388ff';$('#noteInput').value=t.note||'';$('#flagInput').value='';const fp=$('#flagPreview');if(t.flag){fp.src=t.flag;fp.classList.remove('hidden')}else fp.classList.add('hidden');$('#editor').classList.remove('hidden');$('#factionInput').disabled=readonly;$('#colorInput').disabled=readonly;$('#noteInput').disabled=readonly;$('#saveTerritory').classList.toggle('hidden',readonly);$('#deleteTerritory').classList.toggle('hidden',readonly);$('#addBorderArea').classList.toggle('hidden',readonly);$('#eraseBorderArea').classList.toggle('hidden',readonly)}
function closeEditor(){currentEditor=null;$('#editor').classList.add('hidden');if(borderEditing){borderEditing=null;render()}}
function startHandleDrag(e){
  e.stopPropagation(); e.preventDefault();
  const id=borderEditing, index=+e.currentTarget.dataset.index, t=state.territories.find(x=>x.id===id); if(!t)return;
  e.currentTarget.setPointerCapture(e.pointerId);
  const move=ev=>{const p=mapPoint(ev);t.points[index]=p;e.currentTarget.setAttribute('cx',p.x);e.currentTarget.setAttribute('cy',p.y);const shape=terrG.querySelector(`[data-id="${id}"]`);if(shape)shape.setAttribute('d',path(t.points));};
  const up=()=>{e.currentTarget.removeEventListener('pointermove',move);e.currentTarget.removeEventListener('pointerup',up);t.placedAt=Date.now();save();render();notice('BORDER UPDATED')};
  e.currentTarget.addEventListener('pointermove',move);e.currentTarget.addEventListener('pointerup',up);
}
function deleteCurrent(){if(!currentEditor)return;remember();state.territories=state.territories.filter(t=>t.id!==currentEditor.id);closeEditor();save();render();notice('TERRITORY REMOVED')}
function center(t){const c=geomCenter(t.geometry);view.z=Math.max(view.z,Math.min(1.1,fitZoom()*2));view.tx=viewport.clientWidth/2-c.x*view.z;view.ty=viewport.clientHeight/2-c.y*view.z;apply()}
function fitZoom(){return Math.min(viewport.clientWidth/natural.w,viewport.clientHeight/natural.h)*.97}
let pan=null;
viewport.addEventListener('pointerdown',e=>{if(e.button!==0)return;if(e.target.closest('#editor,.palette,.territory,.border-handle'))return;const p=mapPoint(e);if(admin&&filter==='territory'&&tool){if(tool==='lasso'||tool==='boundary-add'||tool==='boundary-erase'){e.preventDefault();viewport.classList.add('drawing');session={points:[p]};pan=null;viewport.setPointerCapture(e.pointerId);render();return}if(tool==='polygon'){if(!session){session={points:[]};pan=null}session.points.push(p);render();viewport.setPointerCapture(e.pointerId);return}}pan={x:e.clientX,y:e.clientY,tx:view.tx,ty:view.ty,moved:false};viewport.setPointerCapture(e.pointerId)});
viewport.addEventListener('pointermove',e=>{const p=mapPoint(e);$('#coords').textContent=`X ${Math.round(p.x)} · Y ${Math.round(p.y)}`;if(session?.points&&(tool==='lasso'||tool==='boundary-add'||tool==='boundary-erase')){const last=session.points.at(-1);if(Math.hypot(p.x-last.x,p.y-last.y)>3/view.z){session.points.push(p);render()}return}if(pan){if(Math.hypot(e.clientX-pan.x,e.clientY-pan.y)>4)pan.moved=true;if(pan.moved){view.tx=pan.tx+e.clientX-pan.x;view.ty=pan.ty+e.clientY-pan.y;apply()}}});
viewport.addEventListener('pointerup',e=>{if(session&&['lasso','boundary-add','boundary-erase'].includes(tool)){viewport.classList.remove('drawing');finish(session.points);return}if(pan){pan=null}});
viewport.addEventListener('wheel',e=>{e.preventDefault();const r=viewport.getBoundingClientRect();zoomAt(e.clientX-r.left,e.clientY-r.top,Math.exp(-e.deltaY*.0012))},{passive:false});
viewport.addEventListener('pointercancel',()=>{session=null;pan=null;viewport.classList.remove('drawing');render()});
viewport.addEventListener('dblclick',e=>{if(session&&tool==='polygon'){e.preventDefault();viewport.classList.remove('drawing');session.points.pop();finish(session.points)}});
$('#zoomIn').onclick=()=>zoomAt(viewport.clientWidth/2,viewport.clientHeight/2,1.25);$('#zoomOut').onclick=()=>zoomAt(viewport.clientWidth/2,viewport.clientHeight/2,.8);$('#zoomReadout').onclick=()=>{view.z=1;view.tx=(viewport.clientWidth-natural.w)/2;view.ty=(viewport.clientHeight-natural.h)/2;apply()};
function doneBoundaryMode(){boundaryMode=null;editingId=null;activeTerritoryId=null;tool=null;session=null;viewport.classList.remove('drawing');syncTools();render();notice('TERRITORY EDIT MODE FINISHED')}
function togglePureMap(){pureMap=!pureMap;$('#pureMapBtn').textContent=pureMap?'SHOW TERRITORIES':'PURE MAP';$('#pureMapBtn').classList.toggle('active',pureMap);if(pureMap){closeEditor();tool=null;boundaryMode=null;session=null}render();syncTools()}
function init(){map.onload=()=>{natural={w:map.naturalWidth,h:map.naturalHeight};fit()};map.src=map.src;readState().then(async s=>{if(s?.territories)state=s;normalizeTerritories();render();await startCloud();});syncTools();syncFilter()}
$('#undoBtn').onclick=undo;$('#adminBtn').onclick=toggleAdmin;$('#unlockCode').onclick=unlockAdmin;$('#cancelCode').onclick=()=>$('#modal').classList.add('hidden');$('#codeInput').onkeydown=e=>{if(e.key==='Enter')unlockAdmin()};$('#territoryView').onclick=()=>setFilter('territory');document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')){e.preventDefault();undo()}});$('#editorToggle').onclick=()=>{editorHidden=!editorHidden;if(editorHidden)closeEditor();syncTools();};$('#flagInput').onchange=e=>{const f=e.target.files[0];if(!f||!currentEditor)return;ensureEditorUndo();const r=new FileReader();r.onload=()=>{pendingFlag=r.result;currentEditor.flag=pendingFlag;currentEditor.placedAt=Date.now();$('#flagPreview').src=pendingFlag;$('#flagPreview').classList.remove('hidden');save();render();notice('FLAG SAVED')};r.readAsDataURL(f)};
$$('#toolPalette button').forEach(b=>b.onclick=()=>{requireAdmin(()=>{filter='territory';tool=b.dataset.tool;syncFilter();syncTools();notice(tool==='lasso'?'DRAG TO DRAW TERRITORY':'CLICK POINTS, DOUBLE-CLICK TO FINISH')})});
$('#factionInput').oninput=()=>{if(currentEditor&&!$('#factionInput').disabled){ensureEditorUndo();currentEditor.faction=$('#factionInput').value.trim()||'UNASSIGNED';currentEditor.placedAt=Date.now();currentEditor.updatedAt=Date.now();save();render()}};$('#colorInput').oninput=()=>{if(currentEditor&&!$('#colorInput').disabled){ensureEditorUndo();currentEditor.color=$('#colorInput').value;setEditorAccent(currentEditor.color);currentEditor.placedAt=Date.now();currentEditor.updatedAt=Date.now();save();render()}};$('#noteInput').oninput=()=>{if(currentEditor&&!$('#noteInput').disabled){ensureEditorUndo();currentEditor.note=$('#noteInput').value;currentEditor.placedAt=Date.now();save()}};
$('#addModeBtn').onclick=()=>{const t=state.territories.find(x=>x.id===activeTerritoryId)||currentEditor;if(t)beginBoundaryEdit(t,'add');else notice('SELECT A TERRITORY FIRST')};$('#eraseModeBtn').onclick=()=>{const t=state.territories.find(x=>x.id===activeTerritoryId)||currentEditor;if(t)beginBoundaryEdit(t,'erase');else notice('SELECT A TERRITORY FIRST')};$('#doneModeBtn').onclick=doneBoundaryMode;$('#pureMapBtn').onclick=togglePureMap;$('#addBorderArea').onclick=()=>currentEditor&&beginBoundaryEdit(currentEditor,'add');$('#eraseBorderArea').onclick=()=>currentEditor&&beginBoundaryEdit(currentEditor,'erase');$('#editorClose').onclick=closeEditor;$('#deleteTerritory').onclick=()=>requireAdmin(deleteCurrent);$('#saveTerritory').onclick=()=>{if(!currentEditor)return;currentEditor.faction=$('#factionInput').value.trim()||'UNASSIGNED';currentEditor.color=$('#colorInput').value;currentEditor.note=$('#noteInput').value.trim();if(pendingFlag)currentEditor.flag=pendingFlag;currentEditor.placedAt=Date.now();currentEditor.updatedAt=Date.now();save();render();notice('TERRITORY SAVED');};$('#fitBtn').onclick=fit;$('#resetBtn').onclick=()=>{view.z=1;fit();};$('#exportBtn').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='galaxy-territories.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)};
window.addEventListener('resize',fit);init();
