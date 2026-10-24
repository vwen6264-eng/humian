'use strict';
function day(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function ranking(state,period){return [...state.creatures].sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name));function score(x){return period==='today'?(x.feeding.daily[day()]||0):x.feeding.total;}}
function weatherKind(code){return code>=71&&code<=77||code===85||code===86?'snow':code>=51?'rain':code>=1?'cloud':'clear';}
function movableWindow(node,head,host){
 node._lakeMoveCleanup?.();
 let drag=null,raf=0,latest=null;
 const grip=document.createElement('div');grip.className='lake-modal-resize-handle';grip.tabIndex=0;grip.setAttribute('role','button');grip.setAttribute('aria-label','拖动调整大小，方向键微调');node.append(grip);
 head.dataset.lakeDragBound='true';node.dataset.lakeDraggable='true';head.classList.add('lake-modal-drag-handle');head.title='拖动移动；双击恢复默认大小和位置';
 function paint(){raf=0;if(!drag||!latest)return;const dx=latest.x-drag.x,dy=latest.y-drag.y;
  if(drag.resize){node.style.setProperty('width',Math.max(Math.min(280,drag.hw),Math.min(drag.w+dx,drag.hw-drag.l))+'px','important');node.style.setProperty('height',Math.max(Math.min(180,drag.hh),Math.min(drag.h+dy,drag.hh-drag.t))+'px','important');}
  else{const x=Math.max(0,Math.min(drag.l+dx,drag.hw-drag.w))-drag.l,y=Math.max(0,Math.min(drag.t+dy,drag.hh-drag.h))-drag.t;node.style.setProperty('transform',`translate3d(${x}px,${y}px,0)`,'important');drag.tx=x;drag.ty=y;}
 }
 function start(e,resize){if(e.button!==0||(!resize&&e.target.closest('button,input,select,textarea,a')))return;const box=node.getBoundingClientRect(),bounds=host.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,l:box.left-bounds.left,t:box.top-bounds.top,w:box.width,h:box.height,hw:bounds.width,hh:bounds.height,resize,tx:0,ty:0,id:e.pointerId,target:e.currentTarget};
  node.style.cssText+=';position:absolute!important;inset:auto!important;margin:0!important;max-width:none!important;max-height:none!important;transform:none!important';for(const [k,v] of Object.entries({left:drag.l,top:drag.t,width:drag.w,height:drag.h}))node.style.setProperty(k,v+'px','important');
  node.classList.add('lake-window-manipulating');node.style.willChange=resize?'width,height':'transform';host.classList.add('lake-window-dragging');e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();
 }
 function move(e){if(!drag||e.pointerId!==drag.id)return;latest={x:e.clientX,y:e.clientY};if(!raf)raf=requestAnimationFrame(paint);}
 function stop(e){if(!drag||e.pointerId!==drag.id)return;if(raf)cancelAnimationFrame(raf);paint();if(!drag.resize){node.style.setProperty('left',drag.l+drag.tx+'px','important');node.style.setProperty('top',drag.t+drag.ty+'px','important');node.style.setProperty('transform','none','important');}if(drag.target.hasPointerCapture(drag.id))drag.target.releasePointerCapture(drag.id);drag=null;latest=null;node.classList.remove('lake-window-manipulating');host.classList.remove('lake-window-dragging');node.style.willChange='';}
 const down=e=>start(e,false),size=e=>start(e,true),reset=e=>{if(e.target.closest('button'))return;for(const key of ['position','inset','margin','max-width','max-height','transform','left','top','width','height'])node.style.removeProperty(key);};
 head.addEventListener('pointerdown',down);grip.addEventListener('pointerdown',size);head.addEventListener('dblclick',reset);
 for(const x of [head,grip]){x.addEventListener('pointermove',move);x.addEventListener('pointerup',stop);x.addEventListener('pointercancel',stop);}
 grip.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;const b=node.getBoundingClientRect(),h=host.getBoundingClientRect();node.style.setProperty('width',Math.max(280,Math.min(h.width,b.width+(e.key==='ArrowRight'?12:e.key==='ArrowLeft'?-12:0)))+'px','important');node.style.setProperty('height',Math.max(180,Math.min(h.height,b.height+(e.key==='ArrowDown'?12:e.key==='ArrowUp'?-12:0)))+'px','important');e.preventDefault();});
 node._lakeMoveCleanup=()=>{if(raf)cancelAnimationFrame(raf);head.removeEventListener('pointerdown',down);head.removeEventListener('dblclick',reset);for(const x of [head,grip]){x.removeEventListener('pointermove',move);x.removeEventListener('pointerup',stop);x.removeEventListener('pointercancel',stop);}grip.remove();host.classList.remove('lake-window-dragging');};
 return node._lakeMoveCleanup;
}
function attach(view,{store,openCard,openBirth,api}){
 const {requestUrl}=api;
 const app=view.plugin.app, adapter=app.vault.adapter, file=`${view.plugin.manifest.dir}/pond-play.json`;
 const host=view.containerEl.children[1], frame=view.containerEl.querySelector('iframe.lake-wallpaper');
 const el=(p,t,c,text='')=>{const e=document.createElement(t);e.className=c;e.textContent=text;p.append(e);return e;};
 const toolbar=el(host,'nav','lake-play-toolbar');toolbar.setAttribute('aria-label','湖中玩法');
 const panel=el(host,'aside','lake-play-panel');panel.hidden=true;panel.setAttribute('aria-label','湖中操作面板');
 const info=el(host,'section','lake-play-info');info.hidden=true;info.setAttribute('aria-label','生物信息');
 const status=el(toolbar,'span','lake-play-status','自由观赏');status.setAttribute('role','status');
 let prefs={version:1,weatherMode:'manual',weather:'clear',phase:0,city:null,cache:null}, mode='watch',selected=null,undo=[],closed=false,queue=Promise.resolve(),weatherBusy=false;
 const post=(data)=>frame.contentWindow?.postMessage({type:'lake-play',...data},'*');
 const fail=e=>{status.textContent=`操作失败：${e.message}`;};
 const button=(p,text,fn)=>{const b=el(p,'button','lake-btn',text);b.type='button';b.onclick=()=>Promise.resolve().then(fn).catch(fail);return b;};
 const persist=()=>{const text=JSON.stringify(prefs,null,2);queue=queue.catch(()=>{}).then(async()=>{await adapter.write(file+'.pending',text);await adapter.write(file,text);});return queue;};
 const sync=()=>post({action:'settings',prefs});
 const updateMode=value=>{mode=value;post({action:'mode',mode});status.textContent={watch:'自由观赏',feed:'点击湖面投食',follow:'鱼儿分散跟随指针',steal:'偷食互动：投食后鱼儿争抢'}[mode];};
 async function changePresence(id,present){const s=await store.read(),x=s.creatures.find(x=>x.id===id);if(!x)throw Error('找不到该生物');const before=x.inLake;if(before===present)return;x.inLake=present;await store.save(s);undo.push({id,before,after:present});if(undo.length>30)undo.shift();status.textContent=present?`「${x.name}」回来啦，继续自在游吧`:`「${x.name}」去休息了，想它时双击名字叫它回来`;}
 async function rename(id,name){const s=await store.read(),x=s.creatures.find(x=>x.id===id);if(!x)throw Error('找不到该生物');const before=x.name;x.name=name;const saved=await store.save(s);undo.push({type:'name',id,before,after:saved.creatures.find(x=>x.id===id).name});}
 async function undoLast(){const op=undo.at(-1);if(!op){status.textContent='没有可撤销的操作';return;}if(op.settings){prefs=op.settings;await persist();sync();undo.pop();status.textContent='已撤销环境调整';return;}const s=await store.read(),x=s.creatures.find(x=>x.id===op.id),key=op.type==='name'?'name':'inLake';if(!x||x[key]!==op.after)throw Error('状态已变化，不能覆盖较新的操作');x[key]=op.before;await store.save(s);undo.pop();status.textContent='已撤销操作';}
 const header=title=>{panel._lakeMoveCleanup?.();panel.replaceChildren();panel.hidden=false;const h=el(panel,'header','lake-panel-head');el(h,'h3','',title);button(h,'收起',()=>{panel.hidden=true;});movableWindow(panel,h,host);};
 async function ranks(period='today'){header('谁是湖中小吃货');const tabs=el(panel,'div','lake-pond-toolbar');button(tabs,'今天吃了多少',()=>ranks('today'));button(tabs,'一路吃了多少',()=>ranks('total'));const s=await store.read();ranking(s,period).forEach((x,i)=>el(panel,'p','',`${i+1}. ${x.name} · ${period==='today'?x.feeding.daily[day()]||0:x.feeding.total} 次`));}
 async function loadWeather(){if(weatherBusy)return;weatherBusy=true;try{if(!prefs.city)throw Error('请先搜索并选择城市');status.textContent='正在获取城市天气…';const c=prefs.city;const r=await requestUrl({url:`https://api.open-meteo.com/v1/forecast?latitude=${c.latitude}&longitude=${c.longitude}&current=temperature_2m,weather_code,is_day&timezone=auto`,throw:true});const w=r.json.current;if(!Number.isFinite(w?.weather_code)||!Number.isFinite(w.temperature_2m))throw Error('天气数据格式不正确');prefs.cache={city:c.name,at:new Date().toISOString(),temperature:w.temperature_2m,weather:weatherKind(w.weather_code),phase:w.is_day?0:2};prefs.weatherMode='auto';await persist();sync();status.textContent=`${c.name} ${w.temperature_2m}℃ · 已更新`;}catch(e){sync();throw Error(`${e.message}；保留缓存或手动天气`);}finally{weatherBusy=false;}}
 function weather(){header('城市天气');const label=el(panel,'label','','城市');const input=el(label,'input','');input.placeholder='输入城市，如 Shanghai';const results=el(panel,'div','');button(panel,'搜索城市',async()=>{if(input.value.trim().length<2)throw Error('请输入至少两个字');results.replaceChildren();const r=await requestUrl({url:`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(input.value.trim())}&count=5&language=zh&format=json`,throw:true});if(!r.json.results?.length)throw Error('未找到城市，可尝试拼音');for(const c of r.json.results)button(results,`${c.name} · ${c.admin1||''} ${c.country||''}`,async()=>{prefs.city={name:c.name,latitude:c.latitude,longitude:c.longitude};await loadWeather();weather();});});button(panel,'更新城市天气',loadWeather);el(panel,'p','',prefs.cache?`${prefs.cache.city} ${prefs.cache.temperature}℃ · 缓存于 ${prefs.cache.at}`:'未获取城市天气；当前使用手动模式');for(const [key,name] of [['clear','晴'],['cloud','阴'],['rain','雨'],['snow','雪']])button(panel,`手动 · ${name}`,async()=>{prefs.weatherMode='manual';prefs.weather=key;await persist();sync();});for(const [i,name] of ['白天','黄昏','夜晚'].entries())button(panel,name,async()=>{prefs.weatherMode='manual';prefs.phase=i;await persist();sync();});el(panel,'small','','天气来源 Open-Meteo；断网时显示缓存，不冒充实时天气。');}
 const interactionButton=button(toolbar,'互动',()=>{header('与湖中伙伴玩一会儿');el(panel,'p','','喂一口、散散步，或留住此刻。单击水面会惊动附近的小鱼，双击小伙伴可以看看它。');button(panel,'喂小伙伴吃点东西',()=>updateMode(mode==='feed'?'watch':'feed'));button(panel,'带鱼儿散散步',()=>updateMode('follow'));button(panel,'留一张湖中合影',()=>post({action:'photo'}));button(panel,'看看谁最爱吃',()=>ranks());button(panel,'让大家自在游一会儿',()=>updateMode('watch'));});

 interactionButton.classList.remove('lake-btn');
 interactionButton.classList.add('lake-pond-entry','lake-interaction-entry');
 interactionButton.title='点击打开互动；按住拖动调整位置';
 const creatureButton=host.querySelector('.lake-pond-entry:not(.lake-interaction-entry)');

 function entryIcon(b,label,kind){
  if(!b)return;
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.5');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
  const paths=kind==='fish'?['M7 15c4-6 11-6 16 0-5 6-12 6-16 0Z','M23 15l5-4v8l-5-4','M13 10l3-3 3 3','M4 24c3-2 5 2 8 0s5 2 8 0 5 2 8 0']:['M16 5c0 4-4 6-4 9a4 4 0 0 0 8 0c0-3-4-5-4-9Z','M7 18c-3 1-4 3-4 5 0 3 6 5 13 5s13-2 13-5c0-2-1-4-4-5','M8 22c2 3 14 3 16 0'];
  for(const d of paths){const path=document.createElementNS(ns,'path');path.setAttribute('d',d);svg.append(path);}
  if(kind==='fish'){const eye=document.createElementNS(ns,'circle');eye.setAttribute('cx','11');eye.setAttribute('cy','14');eye.setAttribute('r','.9');eye.setAttribute('fill','currentColor');eye.setAttribute('stroke','none');svg.append(eye);}
  const text=document.createElement('span');text.className='lake-entry-label';text.textContent=label;b.replaceChildren(svg,text);b.setAttribute('aria-label',label);b.title=label+' · 点击打开，按住拖动';
 }
 entryIcon(creatureButton,'湖中生物','fish');entryIcon(interactionButton,'互动','ripple');
 const floatingButtons={interaction:interactionButton,creatures:creatureButton};
 function placeButtons(){for(const [key,b] of Object.entries(floatingButtons)){const pos=prefs.buttonPositions?.[key];if(!b||!pos||!Number.isFinite(pos.x)||!Number.isFinite(pos.y))continue;const box=host.getBoundingClientRect();b.style.left=Math.max(0,Math.min(pos.x,box.width-b.offsetWidth))+'px';b.style.top=Math.max(0,Math.min(pos.y,box.height-b.offsetHeight))+'px';b.style.right='auto';b.style.bottom='auto';}}
 for(const [key,b] of Object.entries(floatingButtons)){
  if(!b)continue;
  b.style.touchAction='none';let drag=null,suppress=false;
  view.registerDomEvent(b,'pointerdown',e=>{if(e.button!==0)return;const rect=b.getBoundingClientRect(),parent=host.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left-parent.left,top:rect.top-parent.top,moved:false};suppress=false;b.setPointerCapture(e.pointerId);});
  view.registerDomEvent(b,'pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<5)return;drag.moved=true;suppress=true;const box=host.getBoundingClientRect(),x=Math.max(0,Math.min(drag.left+dx,box.width-b.offsetWidth)),y=Math.max(0,Math.min(drag.top+dy,box.height-b.offsetHeight));b.style.left=x+'px';b.style.top=y+'px';b.style.right='auto';b.style.bottom='auto';prefs.buttonPositions={...prefs.buttonPositions,[key]:{x,y}};});
  const finish=e=>{if(!drag||drag.id!==e.pointerId)return;const moved=drag.moved;drag=null;if(b.hasPointerCapture(e.pointerId))b.releasePointerCapture(e.pointerId);if(moved)persist().catch(fail);};
  view.registerDomEvent(b,'pointerup',finish);view.registerDomEvent(b,'pointercancel',finish);
  b.addEventListener('click',e=>{if(suppress){e.preventDefault();e.stopImmediatePropagation();suppress=false;}},true);
 }
 view.registerDomEvent(window,'resize',placeButtons);
 let feedQueue=Promise.resolve();
 view.registerDomEvent(window,'message',e=>{if(e.source!==frame.contentWindow)return;const d=e.data;if(d?.type==='lake-pond-ready')sync();if(d?.type==='lake-pond-select')selected=d.id;if(d?.type!=='lake-play-result')return;
  if(d.action==='fed'&&typeof d.id==='string')feedQueue=feedQueue.then(async()=>{const s=await store.read(),x=s.creatures.find(x=>x.id===d.id&&x.inLake);if(!x)return;x.feeding.total++;x.feeding.daily[day()]=(x.feeding.daily[day()]||0)+1;await store.save(s);status.textContent=d.stolen?`${x.name}偷到食物 +1`:`「${x.name}」又吃到一口，已记下这次吃食`;}).catch(fail);
  if(d.action==='photo'&&typeof d.url==='string'&&d.url.startsWith('data:image/png;base64,')){const a=document.createElement('a');a.href=d.url;a.download=`湖中合影-${Date.now()}.png`;a.click();status.textContent='这片湖的此刻，已经为你留好了';}
  if(d.action==='error')status.textContent='这次没能留下合影，请再试一次：'+String(d.message||'未知错误');
  if(d.action==='manual-phase'&&Number.isFinite(d.phase)&&d.phase>=0&&d.phase<=2){undo.push({settings:structuredClone(prefs)});prefs.weatherMode='manual';prefs.phase=d.phase;persist().catch(fail);}
 });
 view.registerDomEvent(window,'message',async e=>{if(e.source!==frame.contentWindow||e.data?.type!=='lake-pond-summary'||mode==='feed')return;try{const s=await store.read(),x=s.creatures.find(x=>x.id===e.data.id);if(!x)return;info.replaceChildren();info.hidden=false;el(info,'strong','',x.name);el(info,'p','',`${x.species} · 今天吃了 ${x.feeding.daily[day()]||0} 次，一共吃了 ${x.feeding.total} 次`);button(info,`看看${x.name}的故事`,()=>openCard(x.id));button(info,'收起看看湖',()=>{info.hidden=true;});}catch(e){fail(e);}});
 const pause=()=>post({action:'pause',paused:document.hidden||!view.containerEl.isShown()});
 view.registerDomEvent(document,'visibilitychange',pause);const observer=new IntersectionObserver(entries=>{post({action:'pause',paused:document.hidden||!entries[0].isIntersecting});});observer.observe(frame);
 const old=view.openSection.bind(view);view.openSection=async id=>{toolbar.hidden=id!=='home';panel.hidden=true;info.hidden=true;post({action:'pause',paused:document.hidden||!view.containerEl.isShown()});return old(id);};
 view.register(()=>{closed=true;panel._lakeMoveCleanup?.();observer.disconnect();toolbar.remove();panel.remove();info.remove();});
 (async()=>{if(await adapter.exists(file)){const saved=JSON.parse(await adapter.read(file));if(saved.version!==1||!['manual','auto'].includes(saved.weatherMode))throw Error('玩法设置格式错误，未覆盖原数据');prefs={...prefs,...saved};}if(!closed){placeButtons();sync();if(prefs.weatherMode==='auto'&&prefs.city)loadWeather().catch(fail);}})().catch(fail);
 const weatherTimer=setInterval(()=>{if(!closed&&!document.hidden&&prefs.weatherMode==='auto'&&prefs.city)loadWeather().catch(fail);},30*60*1000);view.register(()=>clearInterval(weatherTimer));
 return {makeWindow:(node,head,bounds=host)=>movableWindow(node,head,bounds),changePresence,rename,undoLast,persist,getPrefs:()=>prefs,probeWeather:async()=>{const r=await requestUrl({url:'https://api.open-meteo.com/v1/forecast?latitude=31.23&longitude=121.47&current=temperature_2m,weather_code,is_day&timezone=auto',throw:true});return {status:r.status,current:r.json.current};}};
}
module.exports={attach,ranking,weatherKind,movableWindow};
if(require.main===module&&process.argv.includes('--self-test')){const assert=require('node:assert/strict');assert.equal(weatherKind(75),'snow');assert.equal(weatherKind(61),'rain');assert.equal(weatherKind(0),'clear');console.log('pond-play self-test passed');}
