'use strict';
const {SecureState,digest,parseCommand,gateway,safeName}=require('./wechat-state.js');
function loadCore(api){const path=require('path'),file=path.join(__dirname,'wechat-core.js'),Module=require('module'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(__dirname);m.require=id=>id==='obsidian'?api:require(id);m._compile(require('fs').readFileSync(file,'utf8'),file);return m.exports;}
const REMOTE={id:'用户',session:'wechat-owner'},RAW='原始资料 raw',MEDIA='原始资料 raw/附件 assets';
const HELP='直接像聊天一样说就行。\n比如：按钮没了修一下、这个改小点、做得怎么样了。\n需求清楚就安排，完成后给你验收；不需要口令或任务编号。要是涉及删除、覆盖等风险操作，或没听明白你指哪件事，我会再问一句。\n只想讨论时告诉我“先聊方案，别执行”；想保存资料就说“记下来”。';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class Bridge{
 constructor(plugin,api,options={}){
  this.plugin=plugin;this.app=plugin.app;this.api=api;this.core=options.core||loadCore(api);this.secure=options.state||new SecureState(this.app.vault.adapter.basePath);this.s=this.secure.data;
  if(!this.s.conversationId){const id=this.app.plugins?.plugins?.realclaudian?.views?.getView?.()?.getActiveTab?.()?.conversationId;if(id){this.s.conversationId=id;this.secure.save();}}
  this.transport=options.transport||new this.core.ObsidianTransport();this.status=this.s.auth?'disconnected':'unbound';this.listeners=new Set();this.generation=0;this.busy=false;this.sendBusy=false;this.qrGeneration=0;this.notificationBaseline=null;
  this.receiveQueue=Promise.resolve();this.processing=false;
  this.interval=setInterval(()=>this.flush().catch(()=>{}),4000);
  this.unsub=plugin.taskboardModel.subscribe(()=>{clearTimeout(this.notifyTimer);this.notifyTimer=setTimeout(()=>this.notifications().catch(()=>{}),400);});
  this.notifications().catch(()=>{});if(this.s.enabled&&this.s.auth)this.connect();
 }
 view(){return{messages:this.messages(),processing:this.processing,status:this.status,bound:!!this.s.auth,sendReady:!!this.s.context,projectId:this.s.projectId,conversationId:this.s.conversationId,qr:this.qr||'',events:this.s.events.slice(-15),outbox:this.s.outbox.map(j=>({id:j.id,status:j.status,kind:j.kind,at:j.at})),pending:Object.values(this.s.pending).filter(p=>p.status==='unknown').length};}

 messages(){
  const rows=[],used=new Set();for(const [i,c]of(this.s.chat||[]).entries()){
   const job=this.s.outbox.find(j=>j.id==='reply:'+c.key)||this.s.outbox.find(j=>j.text===c.assistant);if(job)used.add(job.id);
   const at=c.at||job?.at||'';rows.push({id:(c.key||i)+':user',role:'user',text:c.user,at,origin:c.origin||'wechat',note:c.note||this.s.seen[c.key]?.note||''});
   if(c.assistant||c.processing)rows.push({id:(c.key||i)+':assistant',role:'assistant',text:c.assistant||'我先看看，正在处理…',at,status:c.processing?'processing':job?.status||'local',origin:'assistant'});
  }
  for(const j of this.s.outbox)if(!used.has(j.id))rows.push({id:j.id,role:'assistant',text:j.text,at:j.at,status:j.status,origin:j.kind==='notification'?'notification':'assistant'});
  return rows.sort((a,b)=>(a.at||'').localeCompare(b.at||'')).slice(-200);
 }
 accept(msg){const run=this.receiveQueue.catch(()=>{}).then(async()=>{if(this.disposed)throw Error('微信页面正在更新，请稍后重试');this.processing=true;this.emit();try{return await this.receive(msg)}finally{this.processing=false;this.emit()}});this.receiveQueue=run;return run;}
 submitText(text){text=String(text||'').trim();if(!text||text.length>8000)throw Error('请写 1–8000 字的消息');if(!this.s.auth)throw Error('请先绑定微信，再使用这个会话');return this.accept({from:this.s.auth.scannedUser,messageId:'workbench-'+require('crypto').randomUUID(),timeMs:Date.now(),text,attachments:[],attachmentFailures:[],raw:{},origin:'workbench'});}
 emit(){for(const fn of this.listeners)fn(this.view());}
 save(){this.secure.save();this.emit();}
 event(text){this.secure.event(text);this.emit();}
 configure(key,value){if(!['projectId','conversationId'].includes(key))throw Error('无效配置');this.s[key]=String(value);this.save();}
 async login(){
  this.stop(false);const generation=++this.qrGeneration;this.status='scanning';this.qr='';this.emit();
  try{
   const out=await this.core.loginLoop(this.transport,this.core.ILINK_DEFAULT_BASE,{onQr:url=>{if(generation!==this.qrGeneration)return;this.qr=url;this.emit();},onScanned:()=>{this.status='confirming';this.emit();},onError:()=>{this.status='scanning';this.emit();},cancelled:()=>generation!==this.qrGeneration},240000);
   if(generation!==this.qrGeneration)return;
   if(!out){this.status='unbound';this.qr='';this.emit();return;}
   if(!out.scannedUser)throw Error('网关未返回绑定用户，不能开启接收。');
   this.s.auth={token:out.token,botId:out.botId,scannedUser:out.scannedUser,baseUrl:gateway(out.baseUrl||this.core.ILINK_DEFAULT_BASE)};
   this.s.cursor='';this.s.context='';this.s.enabled=true;this.qr='';this.save();this.event('扫码绑定成功。请先在微信给机器人发送“帮助”，解锁回复通道。');this.connect();
  }catch{if(generation===this.qrGeneration){this.status='error';this.qr='';this.event('扫码连接失败，请检查代理／网络后重试。未打印或保存明文凭据。');}}
 }
 stop(persist=true){this.generation++;this.qrGeneration++;this.qr='';this.status=this.s.auth?'disconnected':'unbound';if(persist){this.s.enabled=false;this.save();}else this.emit();}
 forget(){this.stop(false);this.s.enabled=false;this.s.auth=null;this.s.context='';this.s.cursor='';this.s.pending={};for(const j of this.s.outbox)if(j.status==='pending')j.status='canceled';this.save();this.event('已断开并清除本机登录绑定，停止接收及发送。');}
 connect(){
  if(this.disposed||!this.s.auth)return;if(this.status==='connected'||this.status==='connecting')return;
  const generation=++this.generation,a=this.s.auth;this.s.enabled=true;this.save();
  this.client=new this.core.IlinkClient(this.transport,{baseUrl:gateway(a.baseUrl),cdnBase:this.core.CDN_BASE,acceptFrom:a.scannedUser,channelVersion:'moyu-workbench/1.0'},a.token);
  this.status='connecting';this.emit();this.poll(generation).catch(()=>{if(generation===this.generation){this.status='error';this.event('接收循环停止，请重新连接。');}});
 }
 async poll(generation){
  let failures=0;
  while(!this.disposed&&generation===this.generation&&this.s.enabled){
   const r=await this.client.poll(this.s.cursor);if(generation!==this.generation||this.disposed)return;
   if(r.sessionExpired){this.status='expired';this.s.enabled=false;this.save();this.event('微信会话过期，请重新扫码。');return;}
   if(r.error){failures++;this.status='reconnecting';this.emit();await sleep(Math.min(60000,2000*2**Math.min(failures,5)));continue;}
   failures=0;this.status='connected';if(r.resetCursor)this.s.cursor='';this.emit();
   let processed=true;
   for(const msg of r.messages){if(generation!==this.generation)return;try{await this.accept(msg);}catch{processed=false;this.event('一条消息未能安全保存；保留游标，重连后重试。');break;}}
   if(processed&&r.cursor)this.s.cursor=r.cursor;this.save();await sleep(250);
  }
 }
 async queue(text,id,kind='reply'){
  if(this.s.outbox.some(j=>j.id===id))return;
  this.s.outbox=this.s.outbox.filter(j=>!['sent','canceled'].includes(j.status)).concat(this.s.outbox.filter(j=>['sent','canceled'].includes(j.status)).slice(-30));
  if(this.s.outbox.length>=100)throw Error('微信发送队列已满，请在工作台检查。');
  this.s.outbox.push({id,text:String(text).slice(0,11000),kind,status:'pending',at:new Date().toISOString()});this.save();
 }
 async flush(){
  if(this.sendBusy||this.disposed||!this.s.enabled||!this.s.auth||!this.s.context||!this.client)return;
  const limited=this.s.outbox.filter(j=>j.kind==='notification'&&j.status==='sent'&&j.sentAt?.slice(0,10)===new Date().toISOString().slice(0,10)).length>=6;
  const job=this.s.outbox.find(j=>j.status==='pending'&&(!limited||j.kind!=='notification'));if(!job)return;
  this.sendBusy=true;job.status='sending';this.save();
  try{const r=await this.client.sendText(this.s.auth.scannedUser,job.text,this.s.context);if(this.disposed)return;job.status=r.ok?'sent':r.ret===-1?'unknown':'failed';if(r.ok)job.sentAt=new Date().toISOString();this.save();if(!r.ok)this.event(job.status==='unknown'?'一条发送结果不确定，未自动重发，避免重复。':'一条发送被网关拒绝，请先给机器人发消息刷新会话后检查。');}
  catch{job.status='unknown';this.save();this.event('发送结果不确定，未自动重发。');}finally{this.sendBusy=false;}
 }
 async archive(msg,key){
  const vault=this.app.vault;if(!vault.getAbstractFileByPath(RAW)||!vault.getAbstractFileByPath(MEDIA))throw Error('微信资料目录不存在');
  const date=new Date(msg.timeMs);if(!Number.isFinite(date.getTime()))throw Error('消息时间无效');const stamp=date.toISOString().slice(0,19).replace(/[T:]/g,'-');
  const note=RAW+'/微信-'+stamp+'-'+key.slice(0,10)+'.md',links=[];
  for(let i=0;i<msg.attachments.length;i++){
   const att=msg.attachments[i];if(att.data.byteLength>20*1024*1024){links.push('附件超过本版 20MB 接收上限，未保存。');continue;}
   let name=safeName(att.name),ext=require('path').extname(name).toLowerCase();
   if(att.kind==='image'){const d=att.data;ext=d[0]===0x89&&d[1]===0x50?'.png':d[0]===0xff&&d[1]===0xd8?'.jpg':'.bin';name='图片'+ext;}
   if(!['.png','.jpg','.jpeg','.gif','.webp','.pdf','.docx','.xlsx','.txt','.md','.mp4','.mp3','.wav','.silk','.bin'].includes(ext))name+=' .bin';
   const file=MEDIA+'/微信-'+key.slice(0,16)+'-'+i+'-'+name;
   if(!vault.getAbstractFileByPath(file))await vault.createBinary(file,att.data.buffer.slice(att.data.byteOffset,att.data.byteOffset+att.data.byteLength));
   links.push((att.kind==='image'?'!':'')+'[['+file+']]');
  }
  if(vault.getAbstractFileByPath(note)){const text=await vault.cachedRead(vault.getAbstractFileByPath(note));if(!text.includes('微信消息标识: '+key))throw Error('原始资料命名冲突');return note;}
  const body='---\n来源: '+(msg.origin==='workbench'?'微信工作台':'微信')+'\n微信消息标识: '+key+'\n接收时间: '+JSON.stringify(date.toISOString())+'\n---\n\n# 微信收件\n\n'+(msg.text||'（附件消息）')+'\n\n'+links.join('\n')+'\n'+(msg.attachmentFailures?.length?'\n部分附件下载失败，请在手机保留原文件。\n':'');
  await vault.create(note,body);return note;
 }
 async receive(msg){
  if(this.disposed||!this.s.auth||msg.from!==this.s.auth.scannedUser)return false;
  const key=digest(msg.from+'|'+msg.messageId),old=this.s.seen[key];
  if(msg.raw?.context_token){this.s.context=msg.raw.context_token;this.save();}
  if(old?.status==='done')return false;
  if(old?.status==='processing'){this.event('发现未完整处理的旧消息；已保留原资料，未重复执行命令。');this.s.seen[key].status='unknown';this.save();return false;}
  if(old?.status==='unknown')return false;
  const note=await this.archive(msg,key);this.s.seen[key]={status:'processing',note,at:Date.now()};const turn={key,note,user:String(msg.text||'（附件消息）').slice(0,8000),assistant:'',at:new Date().toISOString(),origin:msg.origin||'wechat',processing:true};this.s.chat=[...(this.s.chat||[]),turn].slice(-80);this.save();
  try{const command=await require('./wechat-chat.js').resolve(this,msg.text);const answer=await this.route(command,key,note);if(answer)await this.queue(answer,'reply:'+key);turn.intent=command.type;turn.assistant=String(answer||'');turn.processing=false;this.s.seen[key].status='done';}
  catch(e){turn.assistant='这次没安排成功：'+String(e.message||'处理失败').slice(0,500);turn.processing=false;await this.queue(turn.assistant,'reply:'+key);this.s.seen[key].status='done';}
  const keys=Object.keys(this.s.seen);for(const k of keys.slice(0,Math.max(0,keys.length-2000)))delete this.s.seen[k];this.save();return true;
 }
 async task(short){const {tasks}=await this.plugin.taskboardModel.list();const found=tasks.filter(t=>t.id===short||t.id.endsWith(short));if(found.length!==1)throw Error('没找到唯一对应的任务。你说一下是哪件事、要改哪里就好。');return this.plugin.taskboardModel.read(found[0].id,REMOTE);}
 stage(type,data){
  for(const [k,v]of Object.entries(this.s.pending))if(v.expires<Date.now()&&v.status==='pending')delete this.s.pending[k];
  if(Object.keys(this.s.pending).length>30)throw Error('待确认操作过多，请回工作台检查。');
  let code;do{code=String(require('crypto').randomInt(100000,1000000));}while(this.s.pending[code]);
  this.s.pending[code]={type,...data,status:'pending',expires:Date.now()+600000};this.save();return code;
 }
 async route(command,key,note){
  const store=this.plugin.taskboardModel;
  if(command.type==='chat')return command.reply;
  if(command.type==='help')return HELP;
  if(command.type==='desktop-review')return'微信端暂不开放“验收通过”，请回摸鱼大师核对后验收。';
  if(command.type==='collect')return'已收集到 [['+note+']]。普通消息不会触发 Agent 执行。';
  if(command.type==='list'){const {tasks}=await store.list(command.status?{status:command.status}:{});return tasks.filter(t=>!['done','canceled'].includes(t.status)).slice(0,12).map(t=>t.id.slice(-8)+' · '+t.title+' · '+require('./taskboard-store.js').LABELS[t.status]+' · '+t.progress+'%').join('\n')||'当前没有符合条件的任务。';}
  if(command.type==='read'){const t=await this.task(command.id);return t.title+'\n编号：'+t.id.slice(-8)+'\n状态：'+require('./taskboard-store.js').LABELS[t.status]+' · '+t.progress+'%\n'+t.description.slice(0,1200)+'\n交付／验收：\n'+t.acceptance.join('\n')+'\n最近结果：'+(t.result||'尚未提交').slice(0,1000);}
  if(command.type==='draft'){
   const {projects}=await store.projects(),project=projects.find(p=>p.id===this.s.projectId);if(!project)throw Error('请先在工作台微信页选择任务所属项目。');
   const draft=await require('./taskboard-ai.js').generate(this.app,'fill',{title:command.text.split('\n')[0].slice(0,120),description:command.text.slice(0,15000),acceptance:'',project:project.name,project_description:project.description||''});
   const risky=require('./wechat-chat.js').HIGH_RISK.test(command.text+' '+draft.description);
   const code=this.stage('create',{draft,projectId:project.id,title:command.text.split('\n')[0].slice(0,120),source:key});
   if(command.executeNow&&!risky){const created=await this.confirm(code),id=this.s.pending[code].taskId;try{return '好，任务已记下。\n'+await this.route({type:'start',id,executeNow:true,authorization:command.authorization},key,note);}catch(e){return created+'\n暂未转交执行：'+e.message;}}
   return'任务草稿（尚未创建、不会自动执行）\n'+draft.description+'\n交付／验收：\n'+draft.acceptance.map(s=>'· '+s).join('\n')+'\n你可以回复“可以，就这样建”，也可回复“确认 '+code+'”。确认后创建到待规划，10 分钟有效，尚不自动执行。';
  }
  if(command.type==='start'||command.type==='reject'){
   const t=await this.task(command.id);
   if(command.type==='start'&&!['backlog','todo'].includes(t.status))throw Error('只能开始待规划／待办任务，不能抢占已领取任务。');
   if(command.type==='start'&&!this.s.conversationId)throw Error('当前没有可用的默认 Agent 对话，请在工作台微信页选择一次，之后无需反复选择。');
   if(command.type==='start'&&t.assignee)throw Error('此任务已指定负责人，请在工作台核对后安排。');
   if(command.type==='reject'&&t.status!=='in_review')throw Error('只能退回待验收任务。');
   const code=this.stage(command.type,{id:t.id,version:t.version,etag:t.etag,comment:command.comment||'',source:key});
   const risky=require('./wechat-chat.js').HIGH_RISK.test(t.title+' '+t.description+' '+(command.authorization||''));
   if(['start','reject'].includes(command.type)&&command.executeNow&&!risky)return this.confirm(code);
   return(command.type==='start'?'将允许 Agent 领取：':'将退回原执行者：')+t.title+(command.comment?'\n修改意见：'+command.comment:'')+'\n请确认是否进行以上操作。可以回复“确认”，也可回复“确认 '+code+'”，10 分钟有效。';
  }
  if(command.type==='confirm')return this.confirm(command.code);
  return HELP;
 }
 async confirm(code){
  const op=this.s.pending[code];if(!op||op.expires<Date.now())throw Error('确认码不存在或已过期，请重新发起操作。');
  if(op.status!=='pending')throw Error('此确认码已处理或结果不确定，未重复执行。');
  op.status='executing';this.save();const store=this.plugin.taskboardModel;
  try{
   if(op.type==='create'){const t=await store.create('task',{title:op.title,description:op.draft.description+'\n\n微信来源标识：'+op.source,project_id:op.projectId,status:'backlog',acceptance:op.draft.acceptance},REMOTE,true);op.status='done';op.taskId=t.id;this.save();return'已创建：'+t.title+'\n编号：'+t.id.slice(-8)+'\n状态：待规划，尚未执行。';}
   let t=await store.read(op.id,REMOTE);if(t.version!==op.version||t.etag!==op.etag)throw Error('任务在确认期间已变化，请重新查看并发起操作。');
   if(op.type==='start'){
    const resume=require('./taskboard-resume.js'),conversation=resume.conversations(this.app).find(c=>c.id===this.s.conversationId);if(!conversation)throw Error('所选执行对话已不可用，请回工作台重新选择。');
    if(t.status==='backlog')t=await store.move({id:t.id,version:t.version,etag:t.etag,status:'todo'},REMOTE);
    op.delivery='sending';this.save();const p=this.app.plugins.plugins.realclaudian,runtime=p.sessionRuntimes.ensure({conversationId:conversation.id,providerId:conversation.providerId,draftModel:null});
    const status=await runtime.mailbox.deliver({message:{from:'摸鱼大师 · 已验证微信用户',sessionId:conversation.id,text:'用户已通过绑定微信并二次确认，允许领取任务：'+t.title+'。稳定 ID：'+t.id+'。请先用摸鱼工作台任务接口读取最新版本、ETag、项目代码目录和技能，再以本会话身份领取执行。不要仅凭这条通知覆盖任务；完成后 submit 到 in_review，由用户验收。'},mode:'queue',signal:new AbortController().signal});
    if(!['started','queued'].includes(status))throw Error('对话投递未确认；任务保留待办，请在工作台检查，勿重复开始。');op.delivery=status;op.status='done';this.save();return status==='queued'?'已经发到咱们这个对话了，排着队，前面的工作结束后接着处理。':'已经发到咱们这个对话了，等接手后继续做，结果会留在任务里给你看。';
   }
   if(op.type==='reject'){
    const resume=require('./taskboard-resume.js');t=await store.review({id:t.id,version:t.version,etag:t.etag,approved:false,comment:op.comment},REMOTE);op.status='done';this.save();
    try{const sent=await resume.resume(this.app,store,t,REMOTE);return'好，修改意见已经记下，并交回原来的对话继续改。';}catch{return'修改意见记下了，但没能送到原来的对话，暂时还没继续做。需要在工作台手动转交一下。';}
   }
   throw Error('无效操作');
  }catch(e){op.status='unknown';this.save();throw e;}
 }
 async notifications(){
  if(this.disposed)return;const {tasks}=await this.plugin.taskboardModel.list();
  if(!this.notificationBaseline){this.notificationBaseline=new Map(tasks.map(t=>[t.id,t.status]));return;}
  for(const t of tasks){const old=this.notificationBaseline.get(t.id);this.notificationBaseline.set(t.id,t.status);if(!this.s.auth||!old||old===t.status||!['in_review','blocked'].includes(t.status))continue;const event=t.history.at(-1)?.id||String(t.version),id='task:'+t.id+':'+event;if(this.s.notified.includes(id))continue;await this.queue((t.status==='in_review'?'有任务等你验收：':'任务遇到阻碍：')+t.title+'\n编号：'+t.id.slice(-8)+'\n'+(t.result||t.history.at(-1)?.message||'').slice(0,1200)+'\n想看细节直接问我就好。','notify:'+id,'notification');this.s.notified.push(id);this.s.notified=this.s.notified.slice(-500);this.save();}
 }
 dispose(){this.disposed=true;this.stop(false);clearInterval(this.interval);clearTimeout(this.notifyTimer);this.unsub?.();this.listeners.clear();}
}
function init(plugin,api){if(plugin.wechatBridge)return plugin.wechatBridge;const bridge=new Bridge(plugin,api);plugin.wechatBridge=bridge;plugin.register(()=>{bridge.dispose();plugin.wechatBridge=null;});return bridge;}
module.exports={Bridge,init,HELP,REMOTE};
