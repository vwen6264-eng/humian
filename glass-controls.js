'use strict';
const SURFACES='.lake-workbench-view .lake-assistant-window,.lake-workbench-view .lake-panel,.lake-workbench-view .lake-detail,.lake-workbench-view .lake-play-panel,.lake-workbench-view .lake-play-info,.lake-workbench-view .lake-wiki-preview-drawer,.lake-pond-birth-modal .modal,.lake-pond-remove-modal .modal,.lake-lingxi-modal .modal,.lake-taskboard-modal .modal';
function alphaOf(transparency){if(!Number.isFinite(transparency)||transparency<0||transparency>100)throw Error('透明度应为 0–100');return (100-transparency)/100;}
function attach(view,api){
 const plugin=view.plugin;if(plugin.glassControls){plugin.glassControls.scan();return;}
 const adapter=plugin.app.vault.adapter,file=plugin.manifest.dir+'/glass.json',tracked=new Map();
 let transparency=100,popover=null,trigger=null,raf=0,closed=false,saveQueue=Promise.resolve(),revision=0,serial=0;
 const notice=message=>new api.Notice(message);
 const apply=node=>{node.style.setProperty('background',`rgba(9,43,53,${alphaOf(transparency)})`,'important');};
 function setValue(value){alphaOf(value);transparency=value;revision++;for(const node of tracked.keys())apply(node);if(popover){popover.querySelector('input').value=String(value);popover.querySelector('output').textContent=value+'%';}}
 function persist(){const text=JSON.stringify({version:1,transparency},null,2);saveQueue=saveQueue.catch(()=>{}).then(()=>adapter.write(file,text));saveQueue.catch(()=>notice('背景透明度暂时没能保存，请再试一次。'));return saveQueue;}
 function hide(){if(!popover)return;popover.remove();popover=null;trigger?.setAttribute('aria-expanded','false');trigger=null;}
 function position(){if(!popover||!trigger)return;const rect=trigger.getBoundingClientRect(),box=popover.getBoundingClientRect(),width=document.documentElement.clientWidth,height=document.documentElement.clientHeight;popover.style.left=Math.max(8,Math.min(rect.right-box.width,width-box.width-8))+'px';popover.style.top=Math.max(8,Math.min(rect.bottom+8,height-box.height-8))+'px';}
 function show(button){if(trigger===button&&popover){hide();return;}hide();trigger=button;button.setAttribute('aria-expanded','true');
  popover=document.createElement('section');popover.className='lake-glass-popover';popover.setAttribute('role','dialog');popover.setAttribute('aria-label','背景透明度');
  const top=document.createElement('div');top.className='lake-glass-popover-head';const label=document.createElement('label');label.textContent='背景透明度';const id='lake-glass-range-'+(++serial);label.htmlFor=id;const output=document.createElement('output');output.htmlFor=id;output.textContent=transparency+'%';top.append(label,output);popover.append(top);
  const range=document.createElement('input');range.id=id;range.type='range';range.min='0';range.max='100';range.step='1';range.value=String(transparency);range.setAttribute('aria-label','背景透明度，100% 为全透明');range.oninput=()=>setValue(Number(range.value));range.onchange=persist;popover.append(range);
  const hint=document.createElement('p');hint.textContent='调低更清晰，调高更通透；不改变文字和图片。';popover.append(hint);
  const row=document.createElement('div');row.className='lake-glass-presets';for(const [text,value] of [['清晰',20],['轻透',65],['全透',100]]){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{setValue(value);persist();};row.append(b);}popover.append(row);
  document.body.append(popover);position();range.focus();
 }
 function restore(node,state){if(state.background)node.style.setProperty('background',state.background,state.priority);else node.style.removeProperty('background');state.button?.remove();if(state.actions?.childElementCount===0)state.actions.remove();node.classList.remove('lake-glass-surface');}
 function scan(){if(closed)return;
  for(const [node,state] of tracked)if(!node.isConnected){restore(node,state);tracked.delete(node);}
  for(const node of document.querySelectorAll(SURFACES)){
   let state=tracked.get(node);if(!state){state={background:node.style.getPropertyValue('background'),priority:node.style.getPropertyPriority('background')};tracked.set(node,state);node.classList.add('lake-glass-surface');apply(node);}
   if(state.button?.isConnected)continue;
   const head=node.querySelector(':scope > .lake-panel-head,:scope > .lake-wiki-preview-head,:scope > .lake-travel-dialog-head,:scope > .modal-header');if(!head)continue;
   head.classList.add('lake-glass-header');let actions=head.querySelector(':scope > .lake-panel-actions');if(!actions){actions=document.createElement('span');actions.className='lake-glass-actions';head.append(actions);state.actions=actions;}
   const button=document.createElement('button');button.type='button';button.className='lake-btn lake-glass-toggle';button.title='调节背景透明度';button.setAttribute('aria-label','调节背景透明度');button.setAttribute('aria-expanded','false');button.setAttribute('aria-haspopup','dialog');button.textContent='背景';button.onclick=e=>{e.stopPropagation();show(button);};actions.prepend(button);state.button=button;
  }
 }
 const observer=new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1))&&!raf)raf=requestAnimationFrame(()=>{raf=0;scan();if(trigger&&!trigger.isConnected)hide();});});observer.observe(document.body,{childList:true,subtree:true});
 const outside=e=>{if(popover&&!popover.contains(e.target)&&!trigger?.contains(e.target))hide();};
 const escape=e=>{if(e.key==='Escape'&&popover){const button=trigger;hide();button?.focus();e.preventDefault();e.stopImmediatePropagation();}};
 document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);window.addEventListener('resize',position);
 plugin.glassControls={scan,setValue,persist,getValue:()=>transparency,flush:()=>saveQueue,dispose};
 function dispose(){if(closed)return;closed=true;observer.disconnect();if(raf)cancelAnimationFrame(raf);hide();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);window.removeEventListener('resize',position);for(const [node,state] of tracked)restore(node,state);tracked.clear();plugin.glassControls=null;}plugin.register(dispose);
 scan();const initialRevision=revision;
 (async()=>{if(await adapter.exists(file)){const saved=JSON.parse(await adapter.read(file));if(saved.version!==1)throw Error('不支持的设置版本');alphaOf(saved.transparency);if(!closed&&revision===initialRevision)setValue(saved.transparency);}})().catch(()=>notice('背景透明度设置读取失败，暂时保持全透明；原文件未改动。'));
}
module.exports={attach,alphaOf};
if(require.main===module&&process.argv.includes('--self-test')){const assert=require('node:assert/strict');assert.equal(alphaOf(100),0);assert.equal(alphaOf(0),1);assert.equal(alphaOf(65),.35);for(const x of [-1,101,NaN,'50'])assert.throws(()=>alphaOf(x));console.log('背景透明度自测通过');}
