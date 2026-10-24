'use strict';
function open(view,kind,anchor,all,api){
 const host=view.containerEl.children[1],previous=host.querySelector('.lake-travel-stats-popover'),same=previous?.dataset.kind===kind;
 if(previous){previous._lakeTravelClose?.();previous._lakeMoveCleanup?.();previous.remove();}if(same)return;
 const el=(p,t,c='',text='')=>{const n=document.createElement(t);n.className=c;n.textContent=text;p.append(n);return n;};
 const titles={records:'全部旅行记录',countries:'到访国家',cities:'到访城市',recent:'最近旅行'},pop=el(host,'section','lake-play-panel lake-travel-stats-popover');pop.dataset.kind=kind;pop.setAttribute('role','dialog');pop.setAttribute('aria-label',titles[kind]);pop.tabIndex=-1;
 const close=()=>{pop._lakeMoveCleanup?.();pop.remove();for(const b of host.querySelectorAll('.lake-travel-stat'))b.setAttribute('aria-expanded','false');};pop._lakeTravelClose=close;
 for(const b of host.querySelectorAll('.lake-travel-stat')){b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-expanded',String(b===anchor));}
 const head=el(pop,'header','lake-panel-head');el(head,'h3','',titles[kind]);const actions=el(head,'div','lake-panel-actions');
 const button=(parent,text,fn,c='lake-btn')=>{const b=el(parent,'button',c,text);b.type='button';b.onclick=e=>{e.stopPropagation();Promise.resolve().then(fn).catch(error=>new api.Notice(error.message));};return b;};
 const x=button(actions,'',()=>{close();anchor.isConnected&&anchor.focus();},'lake-icon-btn');x.setAttribute('aria-label','收起'+titles[kind]);x.title='收起';api.setIcon(x,'x');
 let items=[...all];if(kind==='recent')items.sort((a,b)=>String(b.date).localeCompare(String(a.date)));if(kind==='countries'){const seen=new Set();items=items.filter(x=>!seen.has(x.country)&&seen.add(x.country));}
 const count=el(pop,'p','lake-travel-stats-caption',kind==='countries'?'点选国家，查看对应的旅行地点':'点选地点，回到地图查看旅行档案');
 const list=el(pop,'div','lake-travel-stats-list');list.setAttribute('aria-label',titles[kind]+'列表');
 for(const item of items){const row=el(list,'article','lake-travel-stats-item'),main=button(row,'',async()=>{close();view.travelSelectedId=item.id;await view.rememberTravelView({selectedId:item.id});await view.openSection('travel');setTimeout(()=>view.travelFocusLocation(item),200);},'lake-travel-stats-main'),text=el(main,'span','lake-travel-stats-text');el(text,'strong','',kind==='countries'?item.country:item.name);el(text,'small','',[kind==='countries'?item.name:item.country,item.date||'日期待补充',(item.visits||1)+' 次到访'].filter(Boolean).join(' · '));main.title='查看「'+item.name+'」的旅行档案';
  const remove=button(row,'',()=>{close();view.travelDeleteDialog(item);},'lake-icon-btn lake-travel-stats-remove');api.setIcon(remove,'trash-2');remove.title='删除「'+item.name+'」的旅行记录';remove.setAttribute('aria-label',remove.title);
 }
 if(!items.length)el(list,'p','lake-empty','这里还没有旅行记录，先去添加一个地点吧。');
 view.pondPlay?.makeWindow(pop,head,host);view.plugin.glassControls?.scan();
 const h=host.getBoundingClientRect(),r=anchor.getBoundingClientRect(),width=Math.min(430,Math.max(180,h.width-24));pop.style.width=width+'px';pop.style.maxWidth='calc(100% - 24px)';pop.style.maxHeight=Math.max(100,Math.min(480,h.height-24))+'px';pop.style.right='auto';pop.style.bottom='auto';pop.style.left=Math.max(12,Math.min(r.left-h.left,h.width-width-12))+'px';pop.style.top=Math.max(12,Math.min(r.bottom-h.top+10,h.height-pop.offsetHeight-12))+'px';
 pop.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();anchor.isConnected&&anchor.focus();}});pop.focus({preventScroll:true});return pop;
}
module.exports={open};
