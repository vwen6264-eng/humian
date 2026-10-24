'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
function attach(view,{requestUrl,Notice}){
 const host=view.containerEl.children[1],base=path.join(view.app.vault.adapter.basePath,view.plugin.manifest.dir),channel='lake-music-'+crypto.randomUUID();
 const el=(p,t,c,text='')=>{const n=document.createElement(t);n.className=c;n.textContent=text;p.append(n);return n;};
 const button=el(host,'button','lake-pond-entry lake-music-entry','♫ 音乐');button.type='button';button.title='音乐 · 点击聆听，按住拖动';button.setAttribute('aria-label','音乐');button.innerHTML='<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 23V9l13-3v14M13 13l13-3"/><ellipse cx="9" cy="24" rx="4" ry="3"/><ellipse cx="22" cy="21" rx="4" ry="3"/><path d="M3 30c4-2 6 1 10 0s7-2 12 0"/></svg><span class="lake-entry-label">音乐</span>';button.style.cssText='left:24px;top:220px;right:auto;bottom:auto;touch-action:none';
 const panel=el(host,'section','lake-play-panel lake-music-window');panel.hidden=true;panel.style.cssText='width:min(1050px,92%);height:min(720px,84%);padding:0;overflow:hidden;display:flex;flex-direction:column';
 const head=el(panel,'header','lake-panel-head');head.style.cssText='min-height:52px;flex:none;padding:10px 18px';el(head,'h3','','音乐 · 湖畔播放器');const close=el(head,'button','lake-btn','收起聆听');close.type='button';close.onclick=()=>{panel.hidden=true;};
 const frame=el(panel,'iframe','lake-music-frame');frame.title='湖畔播放器';frame.allow='autoplay';frame.style.cssText='width:100%;flex:1;min-height:0;border:0;background:transparent';
 const {movableWindow}=require(path.join(base,'pond-play.js'));const cleanup=movableWindow(panel,head,host);
 const positionFile=path.join(base,'music-position.json');let drag=null,suppress=false,loaded=false,closed=false,busy=0;
 try{const p=JSON.parse(fs.readFileSync(positionFile,'utf8'));if(Number.isFinite(p.x)&&Number.isFinite(p.y)){button.style.left=Math.max(0,Math.min(p.x,host.clientWidth-100))+'px';button.style.top=Math.max(0,Math.min(p.y,host.clientHeight-44))+'px';}}catch{}
 const source=()=>fs.readFileSync(path.join(base,'music-player.html'),'utf8').replace('__CHANNEL__',JSON.stringify(channel)).replace('__PLAYER_CODE__',()=>fs.readFileSync(path.join(base,'music-player-client.js'),'utf8').replace(/<\/script/gi,'<\\/script'));
 button.onclick=()=>{if(suppress){suppress=false;return;}if(!loaded){frame.srcdoc=source().replace('const channel=', 'window.lakeDemoURL='+JSON.stringify(view.app.vault.adapter.getResourcePath(view.plugin.manifest.dir+'/music-water.wav'))+';const channel=');loaded=true;}panel.hidden=!panel.hidden;view.plugin.glassControls?.scan();};
 view.registerDomEvent(button,'pointerdown',e=>{if(e.button!==0)return;suppress=false;const r=button.getBoundingClientRect(),h=host.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,l:r.left-h.left,t:r.top-h.top};button.setPointerCapture(e.pointerId);});
 view.registerDomEvent(button,'pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)<5&&!suppress)return;suppress=true;button.style.left=Math.max(0,Math.min(drag.l+dx,host.clientWidth-button.offsetWidth))+'px';button.style.top=Math.max(0,Math.min(drag.t+dy,host.clientHeight-button.offsetHeight))+'px';});
 const stop=e=>{if(!drag||e.pointerId!==drag.id)return;drag=null;if(button.hasPointerCapture(e.pointerId))button.releasePointerCapture(e.pointerId);if(suppress)try{fs.writeFileSync(positionFile,JSON.stringify({x:parseFloat(button.style.left),y:parseFloat(button.style.top)}));}catch(e){new Notice('音乐入口位置未保存：'+e.message);}};
 view.registerDomEvent(button,'pointerup',stop);view.registerDomEvent(button,'pointercancel',stop);
 async function music(params){
  if(!['search','url','lyric','pic','playlist'].includes(params.get('types')))throw Error('不支持的音乐请求');
  return requestUrl({url:'http://yinyueku.cn/api.php',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Referer':'http://yinyueku.cn/','User-Agent':'Mozilla/5.0'},body:params.toString(),throw:false});
 }
 const receive=async e=>{
  if(e.source!==frame.contentWindow||e.data?.channel!==channel||typeof e.data.url!=='string')return;
  const {id,url}=e.data;const reply=d=>{if(!closed)frame.contentWindow?.postMessage({channel,id,...d},'*');};
  if(busy>=6)return reply({error:'请求较多，请稍候再试'});busy++;
  try{const u=new URL(url,'https://lake.invalid');if(!['/api/music','/api/download'].includes(u.pathname))throw Error('请求地址不可用');const r=await music(u.searchParams);if(r.status!==200)throw Error('音乐库暂不可用（'+r.status+'）');const data=JSON.parse(r.text);if(u.pathname==='/api/music')reply({body:r.text,status:r.status});else{if(!data.url||!/^https?:\/\//.test(data.url))throw Error('歌曲暂时无法下载');const audio=await requestUrl({url:data.url,headers:{Referer:'http://yinyueku.cn/'},throw:false});if(audio.status!==200)throw Error('下载失败（'+audio.status+'）');reply({body:Buffer.from(audio.arrayBuffer).toString('base64'),binary:true,mime:audio.headers['content-type']||'audio/mpeg',status:200});}}
  catch(error){reply({error:error.message});}finally{busy--;}
 };
 view.registerDomEvent(window,'message',receive);
 const original=view.openSection.bind(view);view.openSection=async id=>{panel.hidden=true;button.hidden=id!=='home';return original(id);};
 view.register(()=>{closed=true;cleanup();frame.src='about:blank';panel.remove();button.remove();});
 view.plugin.music={request:async params=>{const r=await music(new URLSearchParams(params));return {status:r.status,data:JSON.parse(r.text)};},frame,button,panel};
}
module.exports={attach};
