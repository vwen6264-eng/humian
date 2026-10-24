#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const actions=new Set(['list','read','skill.list','skill.read','create','claim','bind','update','log','submit','project.list','project.read','project.create','project.update']);
function executable(){if(process.env.OBSIDIAN_CLI){if(!path.isAbsolute(process.env.OBSIDIAN_CLI)||!fs.existsSync(process.env.OBSIDIAN_CLI))throw Error('OBSIDIAN_CLI 应为存在的绝对文件路径');return process.env.OBSIDIAN_CLI;}for(const dir of (process.env.PATH||'').split(path.delimiter))for(const name of process.platform==='win32'?['Obsidian.com','Obsidian.exe']:['obsidian']){const base=dir.replace(/^"|"$/g,'');if(!path.isAbsolute(base))continue;const p=path.join(base,name);if(fs.existsSync(p))return p;}throw Error('未找到 Obsidian CLI；请设置 OBSIDIAN_CLI 绝对路径');}
function run(argv){
 const action=argv.shift();if(!action||action==='--help')return{ok:true,usage:'node taskboard-cli.cjs 操作 [任务ID] [--agent 名称 --session 会话] [--version 数字 --etag 全文指纹 --token 领取令牌] [--json-file 绝对JSON路径] [--vault 第二大脑]',actions:[...actions],note:'写操作必须使用读取返回的版本／ETag。claim 返回领取令牌；Agent 不可批准 done。Obsidian 需运行并启用摸鱼大师。'};
 if(!actions.has(action))throw Error('不支持的操作：'+action);
 let positional='',opts={};if(argv[0]&&!argv[0].startsWith('--'))positional=argv.shift();
 while(argv.length){const key=argv.shift();if(!key.startsWith('--')||!argv.length)throw Error('参数需使用 --名称 值');opts[key.slice(2)]=argv.shift();}
 const allowed=['agent','session','conversation_id','work_dir','file','version','etag','token','json-file','json','vault','id','project_id','status','assignee','query','message','progress','title','result'];if(Object.keys(opts).some(k=>!allowed.includes(k)))throw Error('存在未知参数');
 let args={};if(opts['json-file']){if(!path.isAbsolute(opts['json-file']))throw Error('JSON 文件请使用绝对路径');args=JSON.parse(fs.readFileSync(opts['json-file'],'utf8').replace(/^\uFEFF/,''));}if(opts.json)args={...args,...JSON.parse(opts.json)};
 if(positional)args.id=positional;for(const k of ['id','etag','token','conversation_id','work_dir','file','project_id','status','assignee','query','message','title','result'])if(opts[k]!==undefined)args[k]=opts[k];for(const k of ['version','progress'])if(opts[k]!==undefined)args[k]=Number(opts[k]);
 if(opts.agent||opts.session){if(!opts.agent||!opts.session)throw Error('--agent 和 --session 必须同时提供');args.actor={id:opts.agent,session:opts.session};}
 const payload=Buffer.from(JSON.stringify({action,args})).toString('base64'),marker='LAKE_TASKBOARD_RESULT:';
 const code=`(async()=>{try{const p=app.plugins.plugins['immersive-workbench'];if(!p?.taskboardAPI)return '${marker}'+JSON.stringify({ok:false,error:{code:'PLUGIN_NOT_READY',message:'请启用当前库的摸鱼大师插件'}});const q=JSON.parse(Buffer.from('${payload}','base64').toString('utf8'));return '${marker}'+JSON.stringify(await p.taskboardAPI.invoke(q.action,q.args));}catch(e){return '${marker}'+JSON.stringify({ok:false,error:{code:'CLI_ERROR',message:e.message}})}})()`;
 const child=spawnSync(executable(),['vault='+(opts.vault||'第二大脑'),'eval','code='+code],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:8*1024*1024});
 if(child.error)throw child.error;const output=(child.stdout||'')+'\n'+(child.stderr||''),i=output.lastIndexOf(marker);if(i<0)throw Error('Obsidian 未返回任务接口结果；请确认应用正在运行且 CLI 可访问。'+output.trim().slice(0,400));
 const line=output.slice(i+marker.length).split(/\r?\n/)[0].trim();return JSON.parse(line);
}
if(require.main===module){try{const result=run(process.argv.slice(2));process.stdout.write(JSON.stringify(result,null,2)+'\n');if(!result.ok)process.exitCode=2;}catch(e){process.stdout.write(JSON.stringify({ok:false,error:{code:'CLI_ERROR',message:e.message}},null,2)+'\n');process.exitCode=2;}}
module.exports={run};
