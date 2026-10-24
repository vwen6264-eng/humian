'use strict';
// Claudian's local session API is isolated here; fail explicitly if it changes.
function conversations(app){return(app.plugins.plugins.realclaudian?.chatHost?.getConversationList?.()||[]).filter(c=>!c.isArchived);}
function provider(task){return task.claim?.provider||(/^workbuddy$/i.test(task.claim?.agent||task.assignee||'')?'workbuddy':'claudian');}
function target(task){return task.review?.delivery?.conversation_id||task.claim?.conversation_id||(task.claim?.session?.startsWith('conv-')?task.claim.session:null);}
function prompt(task){return `用户已退回任务，请继续在本对话中完成修改。\n任务：${task.title}\n稳定 ID：${task.id}\n笔记：[[${task.path}]]\n验收修改意见：\n${task.review.comment}\n\n项目工作目录要求：
${task.execution?.instruction||'重新读取任务接口中的 execution 字段，遵守项目工作目录。'}

关联技能要求：
${task.execution?.skill_instruction||'重新读取任务 execution.skill_instruction；若有关联技能，先用 skill.read 读取并按指令执行。'}

任务已恢复 in_progress，保留原领取归属。请使用任务 claim 中原有的 agent 和 session 作为接口 actor，读取对应令牌。先通过任务接口重新读取最新版本、ETag 和审核记录，再按意见修改及验证；不要覆盖其他页面、用户数据或未涉及的功能。完成后用 submit 提交 in_review 并附交付物，不能自行批准 done。` ;}
async function focus(app,id){
 const plugin=app.plugins.plugins.realclaudian;if(!plugin)throw Error('Claudian 未启用，无法打开原对话');
 if(typeof id!=='string'||!/^conv-[a-zA-Z0-9-]+$/.test(id))throw Error('未保存有效的原对话 ID，无法定位');
 let found=plugin.views?.findConversationAcrossViews?.(id),view,alreadyActive=false;
 if(found){view=found.view;alreadyActive=view.getActiveTab?.()?.conversationId===id;const manager=view.getTabManager();if(typeof manager.focusTab!=='function')throw Error('当前 Claudian 无法定位原对话标签');await manager.focusTab(found.tabId);if(view.getActiveTab?.()?.conversationId!==id&&typeof manager.switchToTab==='function')await manager.switchToTab(found.tabId);}
 else{
  await plugin.chatHost.ensureConversationMetadataLoaded?.([id]);
  if(!conversations(app).some(c=>c.id===id))throw Error('原对话不存在或已归档，无法打开；任务记录仍保留');
  await plugin.views.activateView();view=plugin.views.getAllViews()[0];const manager=view?.getTabManager();
  if(typeof manager?.openConversation!=='function')throw Error('当前 Claudian 无法打开原执行对话');
  await manager.openConversation(id);
  if(view.getActiveTab?.()?.conversationId!==id){found=plugin.views.findConversationAcrossViews(id);if(found&&typeof found.view.getTabManager()?.switchToTab==='function'){view=found.view;await view.getTabManager().switchToTab(found.tabId);}}
 }
 await app.workspace.revealLeaf(view.leaf);view.focusActiveInput?.();
 if(view.getActiveTab?.()?.conversationId!==id)throw Error('原对话已加载，但未能切换为当前对话，请在 Claudian 历史中选择该对话');
 return {sessionId:id,alreadyActive,title:conversations(app).find(c=>c.id===id)?.title||id};
}
async function deliver(app,task){
 if(provider(task)==='workbuddy'){const e=Error('独立 WorkBuddy 应用尚未接入自动投递接口；任务已恢复进行中，请复制修改意见到原 WorkBuddy 对话发送。打开窗口不代表消息已投递。');e.code='EXTERNAL_PROVIDER_UNSUPPORTED';throw e;}
 const id=target(task);if(!id)throw Error('未绑定原执行对话：请选择该任务之前工作的 Claudian 对话，不会另建会话');
 const plugin=app.plugins.plugins.realclaudian,conversation=conversations(app).find(c=>c.id===id);
 if(!conversation)throw Error('原执行对话不存在或已归档；审核已保留，任务仍在进行中');
 await focus(app,id);
 const runtime=plugin.sessionRuntimes.ensure({conversationId:id,providerId:conversation.providerId,draftModel:null});
 if(typeof runtime?.mailbox?.deliver!=='function')throw Error('当前 Claudian 不支持恢复原会话；请在已打开的原对话中继续');
 const status=await runtime.mailbox.deliver({message:{from:'任务看板 · 用户验收',sessionId:id,text:prompt(task)},mode:'queue',signal:new AbortController().signal});
 if(!['started','queued'].includes(status))throw Error('原会话未确认接收：'+status);
 return {status,conversation_id:id};
}
async function resume(app,store,task,user){
 if(task.review?.status!=='changes_requested'||task.status!=='in_progress')throw Error('只有退回修改的进行中任务可以恢复执行');
 const delivery=task.review.delivery;if(!delivery?.id)throw Error('此审核尚无通知标识，请重新打开验收修改流程');
 if(['started','queued'].includes(delivery.status)){await focus(app,target(task));return {status:delivery.status,alreadySent:true,message:'修改意见已经送达，已打开原执行对话；未重复投递。'};}
 if(delivery.status==='sending'){await focus(app,target(task));return {status:'sending',message:'修改意见已进入发送流程；为避免重复执行，不再次投递。请在原对话核对。'};}
 task=await store.reviewDelivery({id:task.id,version:task.version,etag:task.etag,delivery_id:delivery.id,delivery_status:'sending',message:'正在返回原对话并发送修改意见'},user);
 let status,message,error;
 try{task.execution=await store.execution(task);const result=await deliver(app,task);status=result.status;message=status==='queued'?'修改意见已发送到原对话；当前工作结束后继续执行':'已返回原对话，并发送修改意见继续执行';}
 catch(e){status=e.code==='EXTERNAL_PROVIDER_UNSUPPORTED'?'manual_required':'failed';message='任务已恢复进行中，但未自动恢复对话：'+e.message;error=e;}
 // Store delivery separately from review; a send failure must never undo the user's review.
 try{await store.reviewDelivery({id:task.id,version:task.version,etag:task.etag,delivery_id:delivery.id,delivery_status:status,message},user);}catch(e){message+='；通知结果未能写回：'+e.message;}
 if(error)throw Error(message);return {status,message};
}
module.exports={provider,conversations,target,prompt,focus,deliver,resume};
