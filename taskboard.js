'use strict';
const resumeAgent=require('./taskboard-resume.js'),detailRenderer=require('./taskboard-detail.js');
const core=require('./taskboard-store.js'),USER={id:'用户',session:'obsidian-ui'};
async function chooseCodeDirectory(current='',dialog=null,window=null){if(!dialog){const remote=require('electron').remote;dialog=remote.dialog;window=remote.getCurrentWindow();}const options={title:'选择项目代码工作目录',properties:['openDirectory'],...(current?{defaultPath:current}:{})};const result=window?await dialog.showOpenDialog(window,options):await dialog.showOpenDialog(options);return result.canceled?null:result.filePaths?.[0]||null;}
function init(plugin,api){
 if(plugin.taskboardModel)return;
 const store=new core.Store(plugin.app,api);plugin.taskboardModel=store;plugin.taskboardAPI={invoke:(action,args)=>store.invoke(action,args)};
 for(const event of ['create','modify','delete','rename'])plugin.registerEvent(plugin.app.vault.on(event,(file,old)=>{if(file?.path?.startsWith(core.ROOT+'/')||old?.startsWith(core.ROOT+'/'))store.emit();}));
 plugin.addCommand({id:'open-taskboard',name:'打开项目任务看板',callback:async()=>{await plugin.activateView();const leaf=plugin.app.workspace.getLeavesOfType('immersive-lake-workbench')[0];await leaf?.view.openSection('tasks');}});
 plugin.register(()=>{store.listeners.clear();plugin.taskboardAPI=null;plugin.taskboardModel=null;});
}
function element(p,tag,cls='',text=''){const e=document.createElement(tag);e.className=cls;e.textContent=text;p.append(e);return e;}
async function render(view,api){
 init(view.plugin,api);const store=view.plugin.taskboardModel,app=view.app,modals=new Set(),actions=view.panelHeader('任务');
 const root=element(view.panel,'div','lake-panel-body lake-taskboard'),toolbar=element(root,'div','lake-taskboard-toolbar');
 const state=view.taskboardFilters??={project_id:'',assignee:'',status:'',query:''};
 const fieldSelect=(label,name)=>{const wrap=element(toolbar,'label','lake-taskboard-filter',label);const select=element(wrap,'select','lake-select');select.setAttribute('aria-label',label);select.dataset.filter=name;select.onchange=()=>{state[name]=select.value;draw();};return select;};
 const projectsSelect=fieldSelect('项目','project_id'),ownerSelect=fieldSelect('负责人','assignee'),statusSelect=fieldSelect('状态','status');
 const option=(s,value,label)=>{const o=element(s,'option','',label);o.value=value;return o;};option(statusSelect,'','全部状态');for(const s of core.STATES)option(statusSelect,s,core.LABELS[s]);statusSelect.value=state.status;
 const search=element(toolbar,'input','lake-input');search.type='search';search.placeholder='找任务、说明或标签…';search.setAttribute('aria-label','搜索任务');search.value=state.query;
 let searchTimer,timer,generation=0,disposed=false;
 search.oninput=()=>{state.query=search.value;clearTimeout(searchTimer);searchTimer=setTimeout(draw,180);};
 const overview=element(root,'div','lake-taskboard-overview'),summary=element(overview,'div','lake-taskboard-summary');summary.setAttribute('role','status');const warning=element(root,'div','lake-taskboard-warning');warning.hidden=true;
 const board=element(root,'div','lake-taskboard-columns');board.setAttribute('aria-label','项目任务看板');board.ondragover=e=>{if(!e.dataTransfer?.types.includes('application/x-lake-task'))return;const r=board.getBoundingClientRect();if(e.clientX<r.left+44)board.scrollLeft-=14;else if(e.clientX>r.right-44)board.scrollLeft+=14;};
 const message=(e)=>{new api.Notice(e.message);if(e.code==='VERSION_CONFLICT'||e.code==='OWNERSHIP_CONFLICT')draw();};
 const button=(p,text,fn,cls='lake-btn')=>{const b=element(p,'button',cls,text);b.type='button';b.onclick=e=>{e.stopPropagation();Promise.resolve().then(fn).catch(message);};return b;};
 const pan=element(overview,'nav','lake-taskboard-pan');pan.setAttribute('aria-label','整体浏览任务看板');
 const panBy=direction=>{const column=board.querySelector('.lake-taskboard-column'),gap=parseFloat(getComputedStyle(board).columnGap)||12,step=(column?.getBoundingClientRect().width||240)+gap;board.scrollBy({left:direction*step,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
 const left=button(pan,'← 向左',()=>panBy(-1)),right=button(pan,'向右 →',()=>panBy(1));
 left.title='整体向左浏览一列，不移动任务状态';right.title='整体向右浏览一列，不移动任务状态';left.setAttribute('aria-label','整体向左浏览看板');right.setAttribute('aria-label','整体向右浏览看板');
 function updatePan(){left.disabled=board.scrollLeft<=1;right.disabled=board.scrollLeft>=board.scrollWidth-board.clientWidth-1;}
 board.addEventListener('scroll',updatePan,{passive:true});const panObserver=new ResizeObserver(updatePan);panObserver.observe(board);
 // Keep viewport panning separate from the explicit task status drag handle.
 let gesture=null,suppressClick=false;
 const win=board.ownerDocument.defaultView;
 const stopPan=()=>{if(!gesture)return;gesture=null;board.classList.remove('is-panning');};
 const startPan=e=>{
  suppressClick=false;
  if(e.button!==0||e.pointerType!=='mouse'||e.target.closest('button,a,input,select,textarea,label,[draggable="true"]'))return;
  suppressClick=false;gesture={id:e.pointerId,x:e.clientX,left:board.scrollLeft,moved:false};
  board.classList.add('is-panning');
 };
 const movePan=e=>{
  if(!gesture||e.pointerId!==gesture.id)return;
  if(!(e.buttons&1)){stopPan();return;}
  const dx=e.clientX-gesture.x;
  if(!gesture.moved&&Math.abs(dx)<5)return;
  gesture.moved=true;suppressClick=true;e.preventDefault();
  board.scrollLeft=gesture.left-dx;updatePan();
 };
 const endPan=e=>{if(gesture&&e.pointerId===gesture.id)stopPan();};
 const swallowPanClick=e=>{if(suppressClick){suppressClick=false;e.preventDefault();e.stopImmediatePropagation();}};
 board.addEventListener('pointerdown',startPan);
 win.addEventListener('pointermove',movePan,{passive:false});
 win.addEventListener('pointerup',endPan);
 win.addEventListener('pointercancel',endPan);
 win.addEventListener('blur',stopPan);
 board.addEventListener('click',swallowPanClick,true);

 const openNote=p=>app.workspace.openLinkText(p,'',true);
 function modal(title){const m=new api.Modal(app);m.titleEl.textContent=title;m.containerEl.classList.add('lake-taskboard-modal');m.modalEl.classList.add('lake-taskboard-dialog');const old=m.onClose.bind(m);m.onClose=()=>{m.modalEl._lakeMoveCleanup?.();modals.delete(m);old();};const open=m.open.bind(m);m.open=()=>{modals.add(m);open();view.pondPlay?.makeWindow(m.modalEl,m.titleEl.closest('.modal-header')||m.titleEl,m.containerEl);view.plugin.glassControls?.scan();};return m;}
 function formField(form,label,name,value='',tag='input',choices=null){const wrap=element(form,'label','lake-taskboard-form-field',label);const input=element(wrap,tag,tag==='select'?'lake-select':'lake-input');input.name=name;input.dataset.field=name;if(tag==='textarea')input.rows=3;if(choices)for(const [v,l] of choices)option(input,v,l);input.value=value??'';return input;}
 async function projectForm(project=null){
  const m=modal(project?'编辑已有项目「'+project.name+'」':'新建独立项目（不会覆盖已有项目）'),form=element(m.contentEl,'form','lake-taskboard-form');
  const name=formField(form,'项目名称','name',project?.name||'');name.required=true;name.maxLength=200;
  const description=formField(form,'项目说明','description',project?.description||'','textarea');description.closest('label').classList.add('is-wide');
  const linked=formField(form,'关联笔记（每行一个库内路径）','linked_notes',project?.linked_notes.join('\n')||'','textarea');
  const dir=formField(form,'Agent 工作目录（本地项目文件夹）','code_dir',project?.code_dir||'');const directoryActions=element(dir.closest('label'),'span','lake-taskboard-inline-actions');button(directoryActions,'选择本地文件夹…',async()=>{const selected=await chooseCodeDirectory(dir.value);if(selected)dir.value=selected;});element(dir.closest('label'),'small','','Agent 领取后须在此目录工作；不会自动执行代码。留空时不指定代码工作目录。');
  let acknowledge=null;if(project){const related=(await store.list({project_id:project.id})).tasks;const wrap=element(form,'label','lake-taskboard-check is-wide');acknowledge=element(wrap,'input');acknowledge.type='checkbox';wrap.append(document.createTextNode('我确认是在修改已有项目；改名或更换目录将影响其 '+related.length+' 个关联任务。新项目请取消后点击「＋ 新建项目」。'));}else element(form,'p','is-wide','将创建新的项目笔记与独立 ID，不复用或覆盖任何旧项目。');
  const status=element(form,'p','lake-taskboard-form-error');status.setAttribute('role','alert');const foot=element(form,'div','lake-taskboard-form-footer');button(foot,'先不改了',()=>m.close());const save=button(foot,project?'保存已有项目的修改':'创建独立新项目',()=>{});save.type='submit';
  form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{if(project&&(name.value.trim()!==project.name||dir.value.trim()!==project.code_dir)&&!acknowledge.checked)throw Error('这是编辑已有项目。请确认关联任务也应随之改变；若要新建项目，请取消后点「＋ 新建项目」。');const input={name:name.value,description:description.value,linked_notes:linked.value.split('\n').map(x=>x.trim()).filter(Boolean),code_dir:dir.value};if(project)await store.projectUpdate({id:project.id,version:project.version,etag:project.etag,patch:input},USER);else await store.create('project',input,USER,true);m.close();await draw();}catch(e){status.textContent=e.message;save.disabled=false;}};m.open();name.focus();
 }
 async function manageProjects(){const m=modal('项目管理'),list=element(m.contentEl,'div','lake-taskboard-projects');button(m.contentEl,'＋ 新建项目',()=>{m.close();projectForm();});const {projects}=await store.projects();if(!projects.length)element(list,'p','','还没有项目，先给这段工作起个名字吧。');for(const p of projects){const row=element(list,'section','lake-taskboard-project-row');element(row,'h3','',p.name);element(row,'p','',p.description||'暂无说明');const tools=element(row,'div','lake-taskboard-inline-actions');button(tools,'编辑这个已有项目',()=>{m.close();projectForm(p);});button(tools,'打开项目笔记',()=>openNote(p.path));if(p.code_dir)element(row,'small','',p.code_dir);}m.open();}
 function skillPreview(skill){const m=modal('百艺技能 · '+skill.name);element(m.contentEl,'p','lake-taskboard-pre',skill.file);try{element(m.contentEl,'pre','lake-taskboard-skill-source',require('fs').readFileSync(skill.file,'utf8'));}catch(e){element(m.contentEl,'p','lake-taskboard-form-error','技能无法读取：'+e.message);}button(m.contentEl,'收起',()=>m.close());m.open();}
 function skillPicker(form,initial=[]){
  const selected=new Map(initial.map(s=>[s.file.toLowerCase(),s])),box=element(form,'fieldset','lake-taskboard-skill-picker is-wide');element(box,'legend','','关联百艺技能（可多选）');
  const hint=element(box,'p','lake-taskboard-skill-hint','Agent 执行前需读取关联技能；不会在后台擅自运行技能脚本。');
  const tools=element(box,'div','lake-taskboard-inline-actions'),search=element(tools,'input','lake-input');search.type='search';search.placeholder='搜索技能名称、说明或来源…';search.setAttribute('aria-label','搜索百艺技能');
  const count=element(box,'p','lake-taskboard-skill-count'),list=element(box,'div','lake-taskboard-skill-options');let available=store.skillCatalog();
  const updateCount=()=>count.textContent='已选 '+selected.size+' / 16 · 来自百艺当前扫描目录';
  function paint(){list.replaceChildren();updateCount();const q=search.value.trim().toLowerCase(),known=new Set(available.map(s=>s.file.toLowerCase())),all=[...available,...[...selected.values()].filter(s=>!known.has(s.file.toLowerCase())).map(s=>({...s,missing:true}))];let visible=0;
   for(const skill of all.filter(s=>(s.name+' '+(s.description||'')+' '+s.source+' '+s.file).toLowerCase().includes(q))){visible++;const row=element(list,'div','lake-taskboard-skill-option'),label=element(row,'label','lake-taskboard-check'),check=element(label,'input');check.type='checkbox';check.checked=selected.has(skill.file.toLowerCase());check.dataset.skillFile=skill.file;const text=element(label,'span');element(text,'strong','',skill.name);element(text,'small','',(skill.source||'百艺')+(skill.missing?' · 当前未扫描到，请检查路径':'')+(skill.description?' · '+skill.description.slice(0,100):''));label.title=skill.file;
    check.onchange=()=>{if(check.checked){if(selected.size>=16){check.checked=false;new api.Notice('每个任务最多关联 16 个技能');return;}selected.set(skill.file.toLowerCase(),{name:skill.name,file:skill.file,source:skill.source});}else selected.delete(skill.file.toLowerCase());updateCount();};button(row,'查看',()=>skillPreview(skill));
   }if(!visible)element(list,'p','lake-taskboard-empty',available.length?'没有匹配技能':'百艺尚未扫描到技能，请先检查百艺的技能目录设置。');
  }
  search.oninput=paint;button(tools,'刷新百艺技能',()=>{available=store.skillCatalog();paint();});button(tools,'清空选择',()=>{selected.clear();paint();});paint();
  return {value:()=>[...selected.values()]};
 }
 async function taskForm(task=null){
  const m=modal(task?'编辑任务':'安排一个新任务'),form=element(m.contentEl,'form','lake-taskboard-form'),{projects}=await store.projects();
  if(!projects.length){element(form,'p','','先新建一个项目，再安排任务。');button(form,'去建项目',()=>{m.close();projectForm();});m.open();return;}
  const title=formField(form,'任务标题','title',task?.title||'');title.required=true;title.maxLength=240;title.closest('label').classList.add('is-wide');
  const description=formField(form,'要做什么','description',task?.description||'','textarea');description.closest('label').classList.add('is-wide');
  const project=formField(form,'所属项目','project_id',task?.project_id||state.project_id||projects[0].id,'select',projects.map(p=>[p.id,p.name]));
  let taskColor=task?.color||'';
  const colorTools=element(form,'div','lake-task-color-tools is-wide');element(colorTools,'strong','','卡片颜色');
  const palette=element(colorTools,'div','lake-task-color-palette');const swatches=[];
  const setColor=value=>{taskColor=value;for(const b of swatches)b.setAttribute('aria-pressed',String(b.dataset.color===value));colorStatus.textContent=value?'当前颜色：'+value:'不设颜色，使用湖面默认样式';};
  for(const [value,name]of [['','不设颜色'],['#79a9ff','湖蓝'],['#8bd9c7','薄荷'],['#b39ddb','浅紫'],['#e8a5bd','藕粉'],['#e6bd78','暖金'],['#df9c80','陶橙'],['#9cabb8','雾灰']]){const b=button(palette,name,()=>setColor(value),'lake-btn lake-task-color-swatch');b.dataset.color=value;if(value){const dot=element(b,'span','lake-task-color-dot');dot.style.backgroundColor=value;b.prepend(dot);}swatches.push(b);}
  const customLabel=element(palette,'label','lake-task-color-custom','自选颜色');const custom=element(customLabel,'input');custom.type='color';custom.value=taskColor||'#79a9ff';custom.setAttribute('aria-label','自选任务卡片颜色');custom.oninput=()=>setColor(custom.value);
  const colorStatus=element(colorTools,'small','lake-task-color-status');setColor(taskColor);
  const priority=formField(form,'优先级','priority',task?.priority||'medium','select',Object.entries(core.PRIORITIES));
  const owner=formField(form,'负责人（空着表示暂未分配）','assignee',task?.assignee||'');
  const due=formField(form,'截止日期','due_date',task?.due_date||'');due.type='date';
  const tags=formField(form,'任务标签（用逗号分开）','task_tags',task?.task_tags.join('，')||'');
  const statusField=!task?formField(form,'开始方式','status','backlog','select',[['backlog','先放待规划，不执行'],['todo','放入待办，允许领取']]):null;
  const selectedSkills=skillPicker(form,task?.skills||[]);
  const acceptance=formField(form,'怎样才算做好（每行一条验收条件）','acceptance',task?.acceptance.join('\n')||'','textarea');acceptance.required=true;acceptance.closest('label').classList.add('is-wide');
  require('./taskboard-ai.js').attach({app,modal:m,form,title,description,acceptance,project,projects});
  if(task?.claim)element(form,'p','is-wide','任务已被领取。更换负责人会释放原领取，并退回待办。');
  const error=element(form,'p','lake-taskboard-form-error is-wide');error.setAttribute('role','alert');const foot=element(form,'div','lake-taskboard-form-footer');button(foot,'先不改了',()=>m.close());const save=button(foot,task?'保存修改':'创建任务',()=>{});save.type='submit';
  form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{const patch={color:taskColor,skills:selectedSkills.value(),title:title.value,description:description.value,project_id:project.value,priority:priority.value,assignee:owner.value.trim(),due_date:due.value,task_tags:tags.value.split(/[,，]/).map(x=>x.trim()).filter(Boolean),acceptance:acceptance.value.split('\n').map(x=>x.trim()).filter(Boolean)};if(task)await store.update({id:task.id,version:task.version,etag:task.etag,patch},USER,true);else await store.create('task',{...patch,status:statusField.value},USER,true);m.close();await draw();}catch(e){error.textContent=e.message;save.disabled=false;}};
  m.open();title.focus();
 }
 async function reviewForm(task){
  const m=modal('一起验收「'+task.title+'」');element(m.contentEl,'p','','Agent 已完成提交。请核对下列条件，再决定通过或退回。');const checks=[];
  for(const condition of task.acceptance){const label=element(m.contentEl,'label','lake-taskboard-check');const input=element(label,'input');input.type='checkbox';label.append(document.createTextNode(condition));checks.push(input);}
  element(m.contentEl,'h3','','执行结果');element(m.contentEl,'p','lake-taskboard-pre',task.result||'尚未提供结果');
  if(task.deliverables.length){element(m.contentEl,'h3','','交付物');for(const link of task.deliverables)deliverable(m.contentEl,link);}
  const external=resumeAgent.provider(task)==='workbuddy';const choices=external?[]:resumeAgent.conversations(app).map(c=>[c.id,c.title||c.id]);
  const original=resumeAgent.target(task);const route=formField(m.contentEl,'退回后继续工作的对话','review_conversation',original||'','select',[['','未绑定：仅退回任务，不自动执行'],...choices]);
  element(m.contentEl,'p','lake-taskboard-pre',external?'此任务由独立 WorkBuddy 应用执行，尚未接入自动消息接口。退回会保留修改意见并恢复进行中；请在进度与记录中复制意见给原 WorkBuddy 对话，不能改投 Claudian。':'退回会恢复为进行中，保留原执行者；绑定对话后会返回该对话并发送修改意见，原 Agent 空闲后继续工作。');
  const comment=formField(m.contentEl,'验收意见（退回时必填）','review_comment','','textarea');const error=element(m.contentEl,'p','lake-taskboard-form-error');error.setAttribute('role','alert');const foot=element(m.contentEl,'div','lake-taskboard-form-footer');
  button(foot,'稍后再看',()=>m.close());let deciding=false;const decide=async approved=>{if(deciding)return;deciding=true;foot.querySelectorAll('button').forEach(b=>b.disabled=true);try{const reviewed=await store.review({id:task.id,version:task.version,etag:task.etag,approved,checked:checks.every(c=>c.checked),comment:comment.value,conversation_id:route.value||undefined},USER);m.close();await draw();if(!approved)try{const sent=await resumeAgent.resume(app,store,reviewed,USER);new api.Notice(sent.message);}catch(e){new api.Notice(e.message,10000);}}catch(e){error.textContent=e.message;deciding=false;foot.querySelectorAll('button').forEach(b=>b.disabled=false);}};
  button(foot,external?'退回修改（需发给 WorkBuddy）':'退回修改并继续',()=>decide(false));button(foot,'通过验收',()=>decide(true),'lake-btn lake-primary');m.open();
 }
 function deliverable(parent,link){const row=element(parent,'p','lake-taskboard-deliverable'),wiki=link.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);if(wiki){const a=element(row,'a','internal-link',wiki[2]||wiki[1]);a.href=wiki[1];a.onclick=e=>{e.preventDefault();openNote(wiki[1]);};}else if(/^https?:\/\//i.test(link)){const a=element(row,'a','external-link',link);a.href=link;a.target='_blank';a.rel='noopener noreferrer';}else button(row,link,()=>openNote(link));}
 async function detail(task){return detailRenderer.render({app,view,api,store,modal,element,button,openNote,deliverable,skillPreview,taskForm,reviewForm,resumeAgent,USER},task);}
 async function moveTask(snapshot,status){if(status===snapshot.status)return;if(status==='done'){if(snapshot.status!=='in_review')throw Error('请先执行并提交到待验收，再由你验收完成。');return reviewForm(snapshot);}await store.move({id:snapshot.id,version:snapshot.version,etag:snapshot.etag,status},USER);await draw();}
 async function draw(){
  const ticket=++generation;try{const [{tasks,warnings},{projects,warnings:projectWarnings}]=await Promise.all([store.list({project_id:state.project_id,query:state.query}),store.projects()]);if(disposed||ticket!==generation)return;
   projectsSelect.replaceChildren();option(projectsSelect,'','全部项目');for(const p of projects)option(projectsSelect,p.id,p.name);projectsSelect.value=state.project_id;
   const allOwners=await store.list();if(disposed||ticket!==generation)return;ownerSelect.replaceChildren();option(ownerSelect,'','全部负责人');option(ownerSelect,'__unassigned','尚未分配');for(const a of [...new Set(allOwners.tasks.map(x=>x.assignee).filter(Boolean))].sort())option(ownerSelect,a,a);ownerSelect.value=state.assignee;
   const shown=tasks.filter(x=>!state.assignee||(state.assignee==='__unassigned'?!x.assignee:x.assignee===state.assignee)).filter(x=>!state.status||x.status===state.status);summary.textContent=`${shown.length} 个任务 · ${shown.filter(x=>x.status==='todo').length} 个待办 · ${shown.filter(x=>x.status==='in_progress').length} 个进行中 · ${shown.filter(x=>x.status==='in_review').length} 个等你验收`;
   const problems=[...warnings,...projectWarnings];warning.hidden=!problems.length;warning.textContent=problems.length?'有笔记需要检查：'+problems.map(x=>x.path+'：'+x.error).join('；'):'';
   const scrollLeft=board.scrollLeft;board.replaceChildren();const projectMap=new Map(projects.map(p=>[p.id,p]));
   for(const status of state.status?[state.status]:core.STATES){const column=element(board,'section','lake-taskboard-column');column.dataset.status=status;const head=element(column,'header','lake-taskboard-column-head');element(head,'h3','',core.LABELS[status]);const items=shown.filter(x=>x.status===status);element(head,'span','lake-taskboard-count',String(items.length));
    column.ondragover=e=>{if(e.dataTransfer.types.includes('application/x-lake-task')){e.preventDefault();e.dataTransfer.dropEffect='move';column.classList.add('is-drop-target');}};column.ondragleave=e=>{if(!column.contains(e.relatedTarget))column.classList.remove('is-drop-target');};column.ondrop=e=>{e.preventDefault();column.classList.remove('is-drop-target');try{const data=JSON.parse(e.dataTransfer.getData('application/x-lake-task'));moveTask(data,status).catch(message);}catch{new api.Notice('这张卡片无法移动，请刷新后重试。');}};
    const list=element(column,'div','lake-taskboard-card-list');if(!items.length)element(list,'p','lake-taskboard-empty',status==='backlog'?'先放想法，不会自动执行':status==='in_review'?'提交完成的工作会在这里等你':'把任务拖到这里');
    for(const task of items){const card=element(list,'article','lake-taskboard-card');card.dataset.taskId=task.id;if(/^#[0-9a-f]{6}$/i.test(task.color||'')){card.classList.add('has-task-color');card.style.setProperty('--lake-task-color',task.color);card.dataset.color=task.color;}card.dataset.version=String(task.version);card.draggable=true;card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',task.title+'，点击打开任务笔记');card.onclick=e=>{if(!e.target.closest('button,a,input,select,textarea,label'))openNote(task.path);};card.onkeydown=e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openNote(task.path);}};
     card.title='按住拖动到状态列；单击打开任务笔记';
     card.ondragstart=e=>{if(e.target.closest('button,a,input,select,textarea')){e.preventDefault();return;}e.dataTransfer.setData('application/x-lake-task',JSON.stringify({id:task.id,version:task.version,etag:task.etag,status:task.status}));e.dataTransfer.effectAllowed='move';card.classList.add('is-task-dragging');};
     card.ondragend=()=>card.classList.remove('is-task-dragging');
     const meta=element(card,'div','lake-taskboard-card-meta');element(meta,'span','lake-taskboard-card-project',projectMap.get(task.project_id)?.name||'项目不可用');element(card,'h4','',task.title);
     const tools=element(card,'div','lake-taskboard-card-tools');button(tools,'进度与记录',()=>detail(task));button(tools,'编辑',()=>taskForm(task));if(task.status==='in_review')button(tools,'验收',()=>reviewForm(task));

    }
   }board.scrollLeft=scrollLeft;updatePan();
  }catch(e){if(!disposed)warning.textContent='任务暂时没能读取：'+e.message;warning.hidden=false;}
 }
 button(actions,'＋ 新建任务',()=>taskForm());button(actions,'＋ 新建项目',()=>projectForm());button(actions,'项目管理',manageProjects);button(actions,'使用说明',()=>openNote(core.ROOT+'/湖面任务看板使用说明.md'));button(toolbar,'刷新',draw);
 const unsub=store.subscribe(()=>{clearTimeout(timer);timer=setTimeout(draw,100);});
 view._taskboardDispose=()=>{disposed=true;generation++;unsub();panObserver.disconnect();stopPan();board.removeEventListener('pointerdown',startPan);win.removeEventListener('pointermove',movePan);win.removeEventListener('pointerup',endPan);win.removeEventListener('pointercancel',endPan);win.removeEventListener('blur',stopPan);board.removeEventListener('click',swallowPanClick,true);board.removeEventListener('scroll',updatePan);clearTimeout(timer);clearTimeout(searchTimer);for(const m of [...modals])m.close();};
 view.plugin.glassControls?.scan();await draw();
}
module.exports={init,render,chooseCodeDirectory};
