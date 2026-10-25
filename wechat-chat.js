 'use strict';
const {parseCommand}=require('./wechat-state.js');
const YES=/^(?:可以|好的|好|确认|同意|确定|就这样|可以就这样建|可以，就这样建|就这样建|确认创建|创建吧|建吧|确认开始|确认执行|确认退回|按这个做)[吧啊呀呢。！!，,\s]*$/;
const DENY=/(?:不要|别|不许|先不|暂不|不急|只是问|举例|假如|如果|不执行|不用|只是聊|先聊|先讨论|先研究方案|只想了解|先看看方案)/;
const HIGH_RISK=/(?:删除|清空|清除|覆盖|放生|关机|格式化|卸载|付款|支付|转账|上传.*(?:凭据|密钥|隐私)|公开.*(?:数据|笔记))/;
const authorized=s=>!DENY.test(s)&&!/^\s*[“「][\s\S]*[”」]\s*$|https?:\/\//.test(s);
const NO=/^(?:取消|算了|先不建|不要创建|先别做|先不做|不确认)[吧啊呀。！!\s]*$/;
async function resolve(bridge,text,generate){
 const s=String(text||'').trim(),direct=parseCommand(s);if(direct.type!=='collect')return direct.type==='start'?{...direct,executeNow:true}:direct;
 const pending=Object.entries(bridge.s.pending).filter(([,p])=>p.status==='pending'&&p.expires>Date.now());
 if(YES.test(s)&&pending.length===1&&!['draft','start','reject'].includes(bridge.s.chat?.at(-1)?.intent))return{type:'chat',reply:'为避免把聊天中的“好”误当成授权，你说的是刚才哪件事？把要做的事说一下就好。'};
 if(YES.test(s))return pending.length===1?{type:'confirm',code:pending[0][0]}:{type:'chat',reply:pending.length?'刚才提了几件事，你想先做哪一件？':'好，有事直接跟我说就行。'};
 if(NO.test(s)){if(pending.length!==1)return{type:'chat',reply:'请说明要取消哪一个操作；我没有更改任何任务。'};pending[0][1].status='canceled';bridge.save();return{type:'chat',reply:'好的，这次操作已取消，没有修改任务。'};}
 if(!s)return{type:'collect'};
 const {tasks}=await bridge.plugin.taskboardModel.list();const context={message:s.slice(0,8000),recent:(bridge.s.chat||[]).filter(c=>!c.processing).slice(-6).map(c=>({user:c.user,assistant:c.assistant,intent:c.intent})),tasks:tasks.filter(t=>!['done','canceled'].includes(t.status)).slice(-60).map(t=>({id:t.id,title:t.title,status:t.status})),pending:pending.map(([code,p])=>({code,type:p.type,title:p.title||'',id:p.id||''}))};
 let raw;try{raw=await(generate||require('./taskboard-ai.js').generate)(bridge.app,'wechat-chat',context);}catch{return{type:'chat',reply:'这会儿 AI 没连上，我还没安排执行。稍后再发我一次就好。'};}
 let d;try{d=JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{return{type:'chat',reply:'这次没有理解准确，请再说具体一点；没有修改任务。'};}
 if(!d||!['draft','list','read','start','reject','collect','chat'].includes(d.intent))return{type:'chat',reply:'我没理解准，你再具体说说想改哪里？'};
 if(['read','start','reject'].includes(d.intent)&&(!d.taskId||!context.tasks.some(t=>t.id===d.taskId)))return{type:'chat',reply:'你说的是哪件事？说一下名字或要改的地方就行。'};
 if(d.intent==='draft')return typeof d.text==='string'&&d.text.trim()?{type:'draft',text:d.text.slice(0,15000),executeNow:d.executeNow===true&&authorized(s),authorization:s}:{type:'chat',reply:'你希望这个任务具体完成什么？'};
 if(d.intent==='reject'&&!(typeof d.text==='string'&&d.text.trim()))return{type:'chat',reply:'哪里还不合适？告诉我想改成什么样。'};
 if(['read','start','reject'].includes(d.intent))return{type:d.intent,id:d.taskId,comment:String(d.text||'').slice(0,8000),executeNow:['start','reject'].includes(d.intent)&&authorized(s),authorization:s};
 return{type:d.intent,reply:String(d.reply||'你直接说想做什么就行，我来安排。').slice(0,2000)};
}
module.exports={resolve,YES,NO,HIGH_RISK,authorized};
