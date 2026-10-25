'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const empty=()=>({schema:1,enabled:false,auth:null,cursor:'',context:'',projectId:'',conversationId:'',seen:{},pending:{},outbox:[],notified:[],events:[]});
class SecureState{
 constructor(vaultPath,remote=require('electron').remote){
  this.safe=remote.safeStorage;if(!this.safe?.isEncryptionAvailable())throw Error('系统凭据加密不可用，微信连接已停止；不会明文保存。');
  const folder=path.join(remote.app.getPath('userData'),'moyu-workbench');fs.mkdirSync(folder,{recursive:true});
  this.file=path.join(folder,'wechat-'+digest(vaultPath).slice(0,20)+'.enc');this.data=empty();
  if(fs.existsSync(this.file)){try{this.data={...empty(),...JSON.parse(this.safe.decryptString(fs.readFileSync(this.file)))};}catch{throw Error('微信加密状态无法读取，未覆盖原文件。');}}
  if(this.data.schema!==1)throw Error('微信状态版本不兼容，未覆盖原文件。');
  for(const c of this.data.chat||[])if(c.processing){c.processing=false;c.assistant=c.assistant||'上次处理没有完成，未自动重复执行。请核对任务后再告诉我。';}
  for(const job of this.data.outbox)if(job.status==='sending')job.status='unknown';
  for(const op of Object.values(this.data.pending))if(op.status==='executing')op.status='unknown';
 }
 save(){const encrypted=this.safe.encryptString(JSON.stringify(this.data)),temp=this.file+'.pending';fs.writeFileSync(temp,encrypted);fs.renameSync(temp,this.file);}
 event(message){this.data.events.push({at:new Date().toISOString(),message});this.data.events=this.data.events.slice(-60);this.save();}
}
function parseCommand(text){
 const s=String(text||'').trim();let m;
 if(/^(帮助|菜单|help)$/i.test(s))return{type:'help'};
 if(/^(查看待办|待办)$/.test(s))return{type:'list',status:'todo'};
 if(/^(查看进度|进度)$/.test(s))return{type:'list'};
 if((m=s.match(/^新任务(?:\s*[:：,，]\s*|\s+)([\s\S]+)$/)))return{type:'draft',text:m[1].trim()};
 if((m=s.match(/^确认\s*[:：,，]?\s*(\d{6})$/)))return{type:'confirm',code:m[1]};
 if((m=s.match(/^(?:任务|详情)\s+([a-zA-Z0-9-]+)$/)))return{type:'read',id:m[1]};
 if((m=s.match(/^开始任务\s+([a-zA-Z0-9-]+)$/)))return{type:'start',id:m[1]};
 if((m=s.match(/^退回\s+([a-zA-Z0-9-]+)\s*[:：]\s*([\s\S]+)$/)))return{type:'reject',id:m[1],comment:m[2].trim()};
 if(/^(通过|验收通过|完成任务)/.test(s))return{type:'desktop-review'};
 return{type:'collect'};
}
function gateway(url){const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!(u.hostname==='weixin.qq.com'||u.hostname.endsWith('.weixin.qq.com')))throw Error('网关地址不在微信 HTTPS 白名单内');return u.origin;}
function safeName(name){return path.basename(String(name||'附件')).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,100)||'附件';}
module.exports={SecureState,empty,digest,parseCommand,gateway,safeName};
