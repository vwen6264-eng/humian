'use strict';
const path=require('path'),fs=require('fs'),Module=require('module');
const ROOT='灵犀收藏库';
const inside=p=>typeof p==='string'&&(p===ROOT||p.startsWith(ROOT+'/'))&&!p.split('/').includes('..');
function confinedSettings(s){
 for(const key of ['libraryRoot','flatMediaFolder','coverFolder','templateFolder'])if(!inside(s[key]))throw Error('灵犀的数据目录必须位于“灵犀收藏库”内，避免影响原收藏。');
 if(!s.additionalScanFolders.every(inside))throw Error('附加扫描目录也需要位于“灵犀收藏库”内。');
 return s;
}
function facade(api,parent){
 const result={...api};
 const modals=parent.lingxiModals=new Set();parent.register(()=>{for(const modal of modals)modal.close();});
 for(const name of ['Modal','SuggestModal','FuzzySuggestModal'])if(api[name])result[name]=class extends api[name]{open(){this.containerEl.classList.add('lake-lingxi-modal');modals.add(this);return super.open();}close(){modals.delete(this);return super.close();}};
 return result;
}
function loadCore(file,api){
 const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m.require=id=>id==='obsidian'?api:require(id);m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;
}
async function createRuntime(parent,api){
 const app=parent.app,adapter=app.vault.adapter,dir=parent.manifest.dir+'/lingxi',absolute=path.join(adapter.getBasePath(),dir),shim=facade(api,parent);
 const style=document.createElement('style');style.dataset.lingxi='native';style.textContent=fs.readFileSync(path.join(absolute,'native.css'),'utf8')+'\n'+fs.readFileSync(path.join(absolute,'theme.css'),'utf8');document.head.append(style);parent.register(()=>style.remove());
 const core=loadCore(path.join(absolute,'library-core.js'),shim),doubanCore=loadCore(path.join(absolute,'douban-core.js'),shim);
 const library=new core.default(app,{id:parent.manifest.id+'/lingxi',name:'灵犀',dir,version:'1.5.3',minAppVersion:'1.5.0'});
 const importer=new doubanCore.default(app,{id:parent.manifest.id+'/lingxi-douban',name:'灵犀豆瓣连接',dir,version:'2.5.0',minAppVersion:'1.5.0'});
 // The copied search provider reads credentials through the historical plugin key.
 // Redirect that lookup locally; never mutate the actual plugin registry.
 const pluginTable=new Proxy(app.plugins.plugins,{get:(target,key)=>key==='obsidian-douban-plugin'?importer:Reflect.get(target,key)});
 const pluginManager=new Proxy(app.plugins,{get:(target,key)=>key==='plugins'?pluginTable:Reflect.get(target,key)});
 library.app=new Proxy(app,{get:(target,key)=>key==='plugins'?pluginManager:Reflect.get(target,key)});
 let saveQueue=Promise.resolve();const embedded=new Set(),commands=new Map();
 function storage(plugin,file,validate=x=>x){
  plugin.loadData=async()=>JSON.parse(await adapter.read(dir+'/'+file));
  plugin.saveData=value=>{const json=JSON.stringify(validate(value),null,2);const job=saveQueue.catch(()=>{}).then(()=>adapter.write(dir+'/'+file,json));saveQueue=job;return job;};
 }
 storage(library,'data.json',confinedSettings);storage(importer,'douban-data.json',s=>{if(!inside(s.dataFilePath)||!inside(s.attachmentPath))throw Error('豆瓣导入位置需要位于灵犀收藏库内。');return s;});
 // A delayed UI save must not replace newer in-memory filter selections.
 library.saveSettings=()=>library.settingsStore().save(library.settings);
 function register(plugin,prefix){
  plugin.addCommand=command=>{commands.set(prefix+command.id,command);parent.addCommand({...command,id:prefix+command.id,name:'灵犀：'+command.name});};
  plugin.addRibbonIcon=()=>document.createElement('div');
  plugin.addSettingTab=tab=>{plugin.lingxiSettingsTab=tab;};
  plugin.registerView=(type,creator)=>parent.registerView(type,creator);
  plugin.registerMarkdownCodeBlockProcessor=(lang,callback)=>parent.registerMarkdownCodeBlockProcessor(lang,(source,el,ctx)=>{el.classList.add('lake-lingxi-markdown');callback(source,el,ctx);});
 }
 register(library,'lingxi-');register(importer,'lingxi-douban-');
 library.refreshViews=()=>{for(const view of embedded)if(view.contentEl.isConnected&&!view.lingxiSettingsOpen)view.scheduleRender();};
 await importer.load();parent.register(()=>importer.unload());
 const sync=importer.sync.bind(importer);
 importer.sync=ctx=>{ctx.syncConfig.dataFilePath=importer.settings.dataFilePath;ctx.syncConfig.attachmentPath=importer.settings.attachmentPath;return sync(ctx);};
 library.openDoubanImport=()=>commands.get('lingxi-douban-sync-douban-import-and-create-file').callback();
 library.openLibrary=()=>library.openLibrarySection('library');
 library.openTimeline=()=>library.openLibrarySection('timeline');
 library.openLibrarySection=async section=>{
  let current=[...embedded].find(v=>v.contentEl.isConnected);
  if(!current){const leaf=app.workspace.getLeavesOfType('immersive-lake-workbench')[0];if(leaf){await leaf.view.openSection('lingxi');current=[...embedded].find(v=>v.contentEl.isConnected);}}
  if(current)await current.showSection(section);
 };
 await library.load();parent.register(()=>library.unload());
 await library.initializeLibrary(false);
 const runtime={library,importer,core,api:shim,embedded,commands,flush:()=>saveQueue};
 parent.lingxiRuntime=runtime;
 return runtime;
}
function ensure(parent,api){return parent._lingxiReady??=(createRuntime(parent,api).catch(e=>{parent._lingxiReady=null;throw e;}));}
async function render(view,api){
 const actions=view.panelHeader('灵犀'),mount=document.createElement('div');mount.className='lake-panel-body lake-lingxi-root';mount.textContent='正在翻开你的收藏…';view.panel.append(mount);
 try{
  const runtime=await ensure(view.plugin,api);if(view.active!=='lingxi'||!mount.isConnected)return;mount.lang=runtime.library.settings.interfaceLanguage;
  const content=document.createElement('div');content.className='lake-lingxi-content';mount.replaceChildren(content);
  const embedded=runtime.core.createEmbeddedView(runtime.library,content);runtime.embedded.add(embedded);
  view._lingxiUnmount=()=>{embedded.onClose();runtime.embedded.delete(embedded);};
  let settingsOpen=false;
  const settings=document.createElement('button');settings.className='lake-btn';settings.textContent='设置';settings.type='button';actions.prepend(settings);
  settings.onclick=()=>{
   if(settingsOpen){settingsOpen=false;embedded.lingxiSettingsOpen=false;settings.textContent='设置';embedded.render();return;}
   settingsOpen=true;embedded.lingxiSettingsOpen=true;settings.textContent='返回收藏';embedded.renderController?.abort();content.replaceChildren();
   const tabs=document.createElement('nav');tabs.className='lake-lingxi-settings-tabs';content.append(tabs);
   const body=document.createElement('div');body.className='lake-lingxi-settings';content.append(body);
   for(const [label,plugin] of [['收藏与显示',runtime.library],['豆瓣账号与导入',runtime.importer]]){
    const b=document.createElement('button');b.className='lake-btn';b.textContent=label;b.type='button';tabs.append(b);
    b.onclick=()=>{for(const x of tabs.children)x.setAttribute('aria-pressed',String(x===b));body.replaceChildren();plugin.lingxiSettingsTab.containerEl=body;plugin.lingxiSettingsTab.display();};
   }
   tabs.firstElementChild.click();
  };
  await embedded.onOpen();
 }catch(e){mount.textContent='灵犀暂时未能打开：'+e.message;console.error('灵犀加载失败',e);}
}
module.exports={render,ensure,confinedSettings,inside};
if(require.main===module&&process.argv.includes('--self-test')){
 const assert=require('node:assert/strict');assert.equal(inside(ROOT+'/豆瓣导入/movie'),true);assert.equal(inside('movie'),false);assert.equal(inside(ROOT+'/../movie'),false);assert.throws(()=>confinedSettings({libraryRoot:'豆瓣收藏库'}));console.log('灵犀数据隔离检查通过');
}
