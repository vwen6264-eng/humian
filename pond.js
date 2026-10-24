'use strict';

const kinds = [['fish', 16, '小鱼'], ['turtle', 5, '乌龟']];
const personalities = ['悠闲', '活泼', '胆小', '亲人'];
const species = {fish:['红白锦鲤','黄金锦鲤','兰寿鱼'],turtle:['中华草龟']};
const sizes = ['小','中','大'];
const patterns = ['斑纹','条纹','单色','原生花纹','品种原生纹理'];
function todayLocal(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function identityOf(x){return JSON.stringify([x.kind,x.slot,x.species,x.birthdate,x.size,x.appearance,x.personality]);}
function initial() {
  return {version: 2, creatures: [['fish',10,'小鱼'],['turtle',3,'乌龟']].flatMap(([kind,count,label]) =>
    Array.from({length:count},(_,slot)=>({id:kind+'-'+(slot+1),kind,slot,name:label+(slot+1),inLake:true,
      species:species[kind][kind==='fish'?slot%2:0],birthdate:'',size:'中',
      appearance:{bodyColor:kind==='fish'?'#e89a55':'#799667',patternColor:kind==='fish'?'#f5e9ce':'#dbe7ad',pattern:'单色'},
      personality:'悠闲',feeding:{total:0,daily:{}}}))),archive:[]};
}
function validate(value) {
  const fail=()=>{throw new Error('池塘备份格式不正确；原数据未被覆盖。');};
  if(!value||![1,2].includes(value.version)||!Array.isArray(value.creatures))fail();
  if(value.version===1&&value.creatures.length!==13)fail();
  const ids=new Set(),slots=new Set();
  function clean(x,archived=false){
    if(!x||!Object.hasOwn(species,x.kind)||!Number.isInteger(x.slot)||x.slot<0||x.slot>=(x.kind==='fish'?16:5)||
      typeof x.id!=='string'||!/^(fish|turtle)-[a-zA-Z0-9-]{1,80}$/.test(x.id)||ids.has(x.id)||
      typeof x.name!=='string'||!x.name.trim()||x.name.trim().length>24||
      !personalities.includes(x.personality)||
      !/^#[a-f\d]{6}$/i.test(x.appearance?.bodyColor??x.appearance?.color)||
      (x.appearance?.patternColor!==undefined&&!/^#[a-f\d]{6}$/i.test(x.appearance.patternColor))||
      !['斑纹','条纹','单色','自然','斑点','原生花纹','品种原生纹理'].includes(x.appearance?.pattern)||
      !Number.isSafeInteger(x.feeding?.total)||x.feeding.total<0||
      !x.feeding.daily||typeof x.feeding.daily!=='object'||Array.isArray(x.feeding.daily)||
      (x.inLake!==undefined&&typeof x.inLake!=='boolean'))fail();
    ids.add(x.id);
    const key=x.kind+':'+x.slot;
    if(!archived){if(slots.has(key))fail();slots.add(key);}
    const daily={};
    for(const [day,count] of Object.entries(x.feeding.daily)){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isSafeInteger(count)||count<0)fail();
      daily[day]=count;
    }
    if(Object.values(daily).reduce((a,b)=>a+b,0)>x.feeding.total)fail();
    const chosenSpecies=x.species??species[x.kind][x.kind==='fish'?x.slot%2:0];
    const birthdate=x.birthdate??'';
    const size=x.size??'中';
    if(!species[x.kind].includes(chosenSpecies)||!sizes.includes(size)||
      !(birthdate===''||(typeof birthdate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(birthdate)&&!Number.isNaN(Date.parse(birthdate)))))fail();
    const oldPattern={'自然':'单色','斑点':'斑纹'}[x.appearance.pattern]||x.appearance.pattern;
    const appearance={bodyColor:x.appearance.bodyColor??x.appearance.color,
      patternColor:x.appearance.patternColor??(x.kind==='fish'?'#f5e9ce':'#dbe7ad'),pattern:oldPattern};
    if(!patterns.includes(appearance.pattern))fail();
    if(x.appearance.material!==undefined){
      if(x.appearance.material!=='natural-v1'||appearance.pattern!==(x.kind==='fish'?'原生花纹':'品种原生纹理'))fail();
      appearance.material='natural-v1';
    }
    return {id:x.id,kind:x.kind,slot:x.slot,name:x.name.trim(),inLake:!archived&&x.inLake!==false,
      species:chosenSpecies,birthdate,size,appearance,
      personality:x.personality,feeding:{total:x.feeding.total,daily}};
  }
  const creatures=value.creatures.map(x=>clean(x));
  if(value.version===1&&!initial().creatures.every(s=>creatures.some(x=>x.id===s.id&&x.slot===s.slot&&x.kind===s.kind)))fail();
  if(value.version===2&&value.archive!==undefined&&!Array.isArray(value.archive))fail();
  const archive=value.version===2?(value.archive||[]).map(x=>clean(x,true)):[];
  if(creatures.length>21||archive.length>500)fail();
  return {version:2,creatures,archive};
}
function addCreature(state,kind,details={}){
  const max=kind==='fish'?16:5;
  const slot=Array.from({length:max},(_,i)=>i).find(i=>!state.creatures.some(x=>x.kind===kind&&x.slot===i));
  if(slot===undefined)throw new Error(kind==='fish'?'鱼已达到 16 条上限。':'乌龟已达到 5 只上限。');
  const x={id:kind+'-'+crypto.randomUUID(),kind,slot,name:details.name??(kind==='fish'?'新鱼':'新乌龟'),
    inLake:true,species:details.species??species[kind][kind==='fish'?slot%2:0],birthdate:todayLocal(),size:details.size??'中',
    appearance:{bodyColor:details.bodyColor??details.color??(kind==='fish'?'#e89a55':'#799667'),
      patternColor:details.patternColor??(kind==='fish'?'#f5e9ce':'#dbe7ad'),pattern:details.pattern??'单色'},
    personality:details.personality??'悠闲',feeding:{total:0,daily:{}}};
  if(details.material==='natural-v1'){
    x.appearance.material='natural-v1';
    x.appearance.pattern=kind==='fish'?'原生花纹':'品种原生纹理';
  }
  state.creatures.push(x);return x;
}
function removeCreature(state,id){
 if(!state.creatures.some(x=>x.id===id))throw new Error('这位小伙伴已经离开湖中了。');
 state.creatures=state.creatures.filter(x=>x.id!==id);
 state.archive=state.archive.filter(x=>x.id!==id);
 return validate(state);
}
function assertLifeTransition(before,clean){
  if (JSON.stringify(clean.archive)!==JSON.stringify(before.archive))
    throw new Error('已有生命不能从档案中移除；归档记录也不可改动。');
  for (const old of before.creatures) {
    const next=clean.creatures.find(x=>x.id===old.id);
    if(!next||identityOf(next)!==identityOf(old))
      throw new Error(`${old.name}的品种、生日、花纹、颜色、大小和性格已固定，不能修改或移除。`);
    if(next.feeding.total<old.feeding.total||Object.entries(old.feeding.daily).some(([day,n])=>(next.feeding.daily[day]??0)<n))
      throw new Error('已有吃食记录不能减少。');
  }
  for(const x of clean.creatures)if(!before.creatures.some(y=>y.id===x.id)&&x.birthdate!==todayLocal())
    throw new Error('新生命的出生日期只能是今天。');
}
function attach(view, Modal, api) {
  const plugin = view.plugin;
  if (!plugin.pondStore) {
    const file = `${plugin.manifest.dir}/pond.json`;
    let queue = Promise.resolve();
    const read = async () => validate(await plugin.app.vault.adapter.exists(file) ? JSON.parse(await plugin.app.vault.adapter.read(file)) : initial());
    const sync = value => plugin.app.workspace.getLeavesOfType('immersive-lake-workbench').forEach(leaf => {
      const frame = leaf.view.containerEl.querySelector('iframe.lake-wallpaper');
      frame?.contentWindow?.postMessage({type: 'lake-pond-state', state: value}, '*');
    });
    plugin.pondStore = {read, sync, remove(id){
      const job=queue.then(async()=>{const clean=removeCreature(await read(),id);await plugin.app.vault.adapter.write(file,JSON.stringify(clean,null,2));sync(clean);return clean;});queue=job.catch(()=>{});return job;
    }, save(value, backup = false) {
      const clean = validate(value);
      const job = queue.then(async () => {
        if (!backup) {
          const before = await read();
          assertLifeTransition(before,clean);
        }
        if (backup && await plugin.app.vault.adapter.exists(file))
          await plugin.app.vault.adapter.write(`${plugin.manifest.dir}/pond.before-restore.json`, await plugin.app.vault.adapter.read(file));
        await plugin.app.vault.adapter.write(file, JSON.stringify(clean, null, 2));
        sync(clean);
        return clean;
      });
      queue = job.catch(() => {});
      return job;
    }};
  }
  const store = plugin.pondStore;
  let lastLakeSelect = {id:null, at:0};
  const frame = view.containerEl.querySelector('iframe.lake-wallpaper');
  const push = () => store.read().then(value => {
    store.sync(value);
    const current = view.pondModal?.state?.creatures.find(x => x.id === view.pondModal.selectedId);
    if(current?.inLake) frame?.contentWindow?.postMessage({type:'lake-pond-preview-start',id:current.id},'*');
  }).catch(e => view.toast(`池塘数据读取失败：${e.message}`, 'error'));
  view.registerDomEvent(frame, 'load', push);
  view.registerDomEvent(window, 'message', e => {
    const birth=view.pondModal?.birthModal;
    if(birth&&e.source===birth.frame.contentWindow){
      if(e.data?.type==='pond-preview-ready'){birth.caption.textContent='原生纹理分区调色 · 保留鳞片、甲纹与眼睛细节';birth.sendDraft();}
      if(e.data?.type==='pond-preview-error')birth.caption.textContent='真实鱼预览暂不可用';
      return;
    }
    const previewFrame = view.pondModal?.contentEl.querySelector('iframe.lake-pond-three');
    if (e.source === previewFrame?.contentWindow && e.data?.type === 'pond-preview-error') {
      const caption = view.pondModal.contentEl.querySelector('.lake-pond-live small');
      if (caption) caption.textContent = 'Three.js 高清预览暂不可用；外观档案不受影响';
      return;
    }
    if (e.source === previewFrame?.contentWindow && e.data?.type === 'pond-preview-ready') {
      view.pondModal.sendPose();
      return;
    }
    if (e.source !== frame.contentWindow) return;
    if (e.data?.type === 'lake-pond-ready') push();
    if (e.data?.type === 'lake-pond-applied') {store.lastAppliedCount = e.data.count;store.lastActiveCount = e.data.active;}
    if (e.data?.type === 'lake-pond-pose' && e.data.id === view.pondModal?.selectedId &&
      Number.isFinite(e.data.angle) && Number.isFinite(e.data.x) && Number.isFinite(e.data.y)) {
      store.latestPose = {id:e.data.id,x:e.data.x,y:e.data.y,angle:e.data.angle,active:e.data.active===true};
      view.pondModal.sendPose();
    }
  });
  push();

  class PondCard {
    constructor() {this.app = plugin.app;}
    open() {
      this.opener = document.activeElement;
      this.containerEl = document.createElement('section');
      this.containerEl.className = 'lake-detail is-open lake-pond-window';
      const head = document.createElement('header'); head.className = 'lake-panel-head';
      this.titleEl = document.createElement('h2'); head.append(this.titleEl);
      const close = document.createElement('button'); close.textContent = '关闭'; close.className = 'lake-btn';
      close.onclick = () => this.close(); head.append(close);
      this.contentEl = document.createElement('div'); this.containerEl.append(head, this.contentEl);
      const host = view.containerEl.children[1]; host.append(this.containerEl);view.pondPlay?.makeWindow(this.containerEl,head);
      this.removalObserver = new MutationObserver(() => {if (!this.containerEl.isConnected && view.pondModal === this) this.close();});
      this.removalObserver.observe(host, {childList:true}); this.onOpen();
    }
    close() {clearTimeout(this.nameClickTimer);this.containerEl?._lakeMoveCleanup?.();this.removalObserver?.disconnect();this.containerEl?.remove(); view.pondModal = null; frame?.contentWindow?.postMessage({type:'lake-pond-preview-stop'},'*'); if(this.opener?.isConnected)this.opener.focus();}
    async onOpen() {
      this.titleEl.textContent = '湖中生物 · 小伙伴的故事';
      this.contentEl.classList.add('lake-pond-card');
      this.contentEl.textContent = '正在翻开小伙伴们的故事…';
      try {this.state = await store.read(); this.draw();}
      catch (e) {this.contentEl.textContent = `读取失败，未覆盖原数据：${e.message}`;}
    }
    openBirthModal(kind) {
      const modal=new Modal(plugin.app);
      modal.titleEl.textContent=kind==='fish'?'迎接一条新鱼':'迎接一只小乌龟';
      modal.containerEl.addClass('lake-pond-birth-modal');
      modal.modalEl.addClass('lake-pond-birth-modal-inner');
      const form=document.createElement('form');form.className='lake-pond-birth';modal.contentEl.append(form);
      const note=document.createElement('p');note.textContent=`今天是 ${todayLocal()}，也是这位新伙伴的生日。`;
      form.append(note);
      const field=(label,tag,options)=>{
        const row=document.createElement('label');row.textContent=label;form.append(row);
        const input=document.createElement(tag);row.append(input);
        for(const value of options||[]){const option=document.createElement('option');option.value=value;option.textContent=value;input.append(option);}
        return input;
      };
      const name=field('名字','input');name.required=true;name.maxLength=24;name.placeholder=kind==='fish'?'给这条鱼起名字':'给这只乌龟起名字';
      const type=field('品种','select',species[kind]);
      const palette=(label,colors)=>{
        const input=field(label,'select',[]);
        for(const [text,value] of colors){const option=document.createElement('option');option.textContent=text;option.value=value;input.append(option);}
        return input;
      };
      const bodyColor=kind==='fish'?palette('身体的颜色',[
        ['橙金','#e8a14b'],['朱红','#be422f'],['金黄','#d6ad53'],['乳白','#e5ddc8']]):
        palette('背甲色',[['橄榄棕','#6d7050'],['深褐','#65513e'],['灰褐','#6a6456']]);
      const patternColor=kind==='fish'?palette('身上花纹的颜色',[
        ['乳白','#e7dec8'],['朱红','#be422f'],['墨黑','#37382f'],['橙金','#d69a4d']]):
        palette('头颈和四肢的颜色',[['橄榄灰','#777965'],['灰褐','#78705a'],['深棕','#5e5946']]);
      const pattern={value:kind==='fish'?'原生花纹':'品种原生纹理'};
      const patternNote=document.createElement('p');
      patternNote.textContent=kind==='fish'?'花纹来自当前品种素材本身；没有条纹素材的品种不提供条纹。':'保留品种原生甲纹、头颈纹和鳞片；不提供斑纹或条纹生成选项。';
      form.append(patternNote);
      const size=field('大小','select',sizes);size.value='中';
      const personality=field('天生的性格','select',personalities);

      const preview=document.createElement('div');preview.className='lake-pond-live lake-pond-birth-live';form.append(preview);
      const previewFrame=document.createElement('iframe');previewFrame.className='lake-pond-three lake-pond-birth-three';
      previewFrame.title='定制生物高清真实游动预览';preview.append(previewFrame);
      const caption=document.createElement('small');caption.textContent='小伙伴正游过来，请稍等一下…';preview.append(caption);
      previewFrame.src=plugin.app.vault.adapter.getResourcePath(`${plugin.manifest.dir}/assets/pond-preview/pond-preview.html`);
      const freeSlot=Array.from({length:kind==='fish'?16:5},(_,i)=>i).find(i=>!this.state.creatures.some(x=>x.kind===kind&&x.slot===i));
      if(freeSlot===undefined){modal.close();this.statusEl.textContent=kind==='fish'?'鱼已达到 16 条上限':'乌龟已达到 5 只上限';return;}
      const draftId=`${kind}-draft`;
      const sendDraft=()=>{
        previewFrame.contentWindow?.postMessage({type:'pond-pose',id:draftId,x:.5,y:.5,angle:0,active:true,
          creature:{id:draftId,kind,slot:freeSlot,species:type.value,size:size.value,personality:personality.value,
            appearance:{bodyColor:bodyColor.value,patternColor:patternColor.value,pattern:pattern.value,material:'natural-v1'}}},'*');
      };
      this.birthModal={frame:previewFrame,caption,sendDraft};
      const presets=document.createElement('div');presets.className='lake-pond-toolbar';
      const presetValues=kind==='fish'?[['红白','#e5ddc8','#be422f'],['橙白','#e8a14b','#e7dec8'],['金墨','#d6ad53','#37382f']]:[['橄榄','#6d7050','#777965'],['深褐','#65513e','#5e5946'],['灰褐','#6a6456','#78705a']];
      for(const [label,body,mark] of presetValues){const b=document.createElement('button');b.type='button';b.textContent=label+'预设';b.className='lake-btn';b.onclick=()=>{bodyColor.value=body;patternColor.value=mark;sendDraft();};presets.append(b);}
      form.insertBefore(presets,preview);
      const update=()=>{sendDraft();};
      for(const input of [type,bodyColor,patternColor,size,personality])input.addEventListener('input',update);

      const oldClose=modal.onClose.bind(modal);
      modal.onClose=()=>{modal.modalEl._lakeMoveCleanup?.();previewFrame.contentWindow?.postMessage({type:'pond-pose',id:draftId,x:.5,y:.5,angle:0,active:false,
        creature:{id:draftId,kind,slot:freeSlot,species:type.value,size:size.value,personality:personality.value,
          appearance:{bodyColor:bodyColor.value,patternColor:patternColor.value,pattern:pattern.value,material:'natural-v1'}}},'*');
        if(this.birthModal?.frame===previewFrame)this.birthModal=null;oldClose();};
      const submit=document.createElement('button');submit.type='submit';submit.className='mod-cta';submit.textContent='就叫这个名字，来湖里吧';form.append(submit);
      form.onsubmit=async e=>{
        e.preventDefault();submit.disabled=true;
        try{
          const fresh=await store.read();
          const x=addCreature(fresh,kind,{name:name.value,species:type.value,bodyColor:bodyColor.value,patternColor:patternColor.value,
            pattern:pattern.value,material:'natural-v1',size:size.value,personality:personality.value});
          this.state=await store.save(fresh);this.selectedId=x.id;modal.close();this.draw();
        }catch(err){submit.disabled=false;this.statusEl.textContent=err.message;}
      };
      modal.open();const birthHead=modal.titleEl.closest('.modal-header')||modal.titleEl;view.pondPlay.makeWindow(modal.modalEl,birthHead,modal.containerEl);name.focus();
    }
    sendPose(override) {
      const selected=this.state?.creatures.find(x=>x.id===this.selectedId);
      const previewFrame=this.contentEl.querySelector('iframe.lake-pond-three');
      if(!selected||!previewFrame)return;
      const pose=override||(store.latestPose?.id===selected.id?store.latestPose:
        {id:selected.id,x:.5,y:.5,angle:0,active:selected.inLake});
      previewFrame.contentWindow?.postMessage({type:'pond-pose',...pose,creature:override?.creature||selected},'*');
    }
    draw() {
      const root = this.contentEl;
      const el = (parent, tag, text = '') => {const x = document.createElement(tag); x.textContent = text; parent.append(x); return x;};
      if (!this.listEl) {
        root.replaceChildren();
        el(root, 'p', '有名字便有生命。出生时定制品种、原生花色、颜色、大小和性格，此后固定；档案仅可改名并记录吃食。');
        el(root, 'small', store.lastAppliedCount ? '湖面连接：'+store.lastAppliedCount+' 个生物槽位已绑定' : '湖面连接：等待动画载入；不影响档案保存');
        const toolbar = el(root, 'div'); toolbar.className = 'lake-pond-toolbar';
        for(const kind of ['fish','turtle']){
          const add=el(toolbar,'button',kind==='fish'?'＋迎接新鱼':'＋迎接小乌龟');
          add.onclick=()=>this.openBirthModal(kind);
        }
        const status = el(root, 'p'); status.setAttribute('role', 'status'); this.statusEl = status;
        const exportButton = el(toolbar, 'button', '珍藏大家的故事');
        exportButton.onclick = () => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(validate(this.state), null, 2)], {type: 'application/json'}));
          const a = document.createElement('a'); a.href = url; a.download = '摸鱼大师-池塘备份.json'; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        const importButton = el(toolbar, 'button', '从备份找回故事');
        const input = el(toolbar, 'input'); input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
        importButton.onclick = () => input.click();
        input.onchange = async () => {
          try {
            const file = input.files?.[0]; if (!file) return;
            if (file.size > 512000) throw new Error('备份不得超过 500 KB。');
            const candidate = validate(JSON.parse(await file.text()));
            const confirm = new Modal(plugin.app); confirm.titleEl.textContent = '找回大家的故事';
            el(confirm.contentEl, 'p', '这会用备份中的档案和吃食记录替换当前内容。恢复前会自动保留当前数据，不会改动你的笔记。');
            const cancel = el(confirm.contentEl, 'button', '取消'); cancel.onclick = () => confirm.close();
            const yes = el(confirm.contentEl, 'button', '确认恢复');
            yes.onclick = async () => {yes.disabled = true; try {this.state = await store.save(candidate, true); confirm.close(); this.draw();} catch(e) {yes.disabled = false; new api.Notice(`恢复失败：${e.message}`);}};
            confirm.open();
          } catch(e) {status.textContent = e.message;} finally {input.value = '';}
        };
        const body = el(root, 'div'); body.className = 'lake-pond-body';
        this.listEl = el(body, 'div'); this.listEl.className = 'lake-pond-list'; this.listEl.setAttribute('aria-label', '池塘生物名册');
        this.detailEl = el(body, 'form'); this.detailEl.className = 'lake-pond-detail';
        this.liveEl = el(this.detailEl, 'div'); this.liveEl.className = 'lake-pond-live';
        const liveFrame = el(this.liveEl, 'iframe'); liveFrame.className = 'lake-pond-three';
        liveFrame.src = plugin.app.vault.adapter.getResourcePath(`${plugin.manifest.dir}/assets/pond-preview/pond-preview.html`);
        el(this.liveEl, 'small');
      }
      const status = this.statusEl, list = this.listEl, detail = this.detailEl;
      list.replaceChildren();
      for (const node of [...detail.children]) if (node !== this.liveEl) node.remove();
      const selected = this.state.creatures.find(x => x.id === this.selectedId) || this.state.creatures[0];
      this.selectedId = selected?.id;
      for (const x of this.state.creatures) {
        const row=el(list,'div');row.className='lake-pond-row';
        const b=el(row,'button',`${x.kind==='fish'?'🐟':'🐢'} ${x.name}${x.inLake?' · 湖中':' · 休息'}`);
        b.type='button';b.setAttribute('aria-pressed',String(x.id===this.selectedId));
        b.title=`单击看看${x.name}；双击让${x.name}${x.inLake?'休息一下':'游回湖中'}`;
        b.onclick=()=>{clearTimeout(this.nameClickTimer);this.nameClickTimer=setTimeout(()=>{this.selectedId=x.id;this.draw();},260);};
        b.ondblclick=async()=>{clearTimeout(this.nameClickTimer);if(this.presenceBusy)return;this.presenceBusy=true;try{const fresh=await store.read(),target=fresh.creatures.find(a=>a.id===x.id);if(!target)throw Error(`找不到「${x.name}」的档案，可能已经放生了。`);await view.pondPlay.changePresence(x.id,!target.inLake);this.selectedId=x.id;this.state=await store.read();this.draw();}catch(e){this.statusEl.textContent=e.message;}finally{this.presenceBusy=false;}};
        const remove=el(row,'button','×');remove.type='button';remove.className='lake-pond-remove';
        remove.title=`放生${x.name}`;remove.setAttribute('aria-label',`放生${x.name}`);
        remove.onclick=()=>{
          clearTimeout(this.nameClickTimer);
          const confirm=new Modal(plugin.app);confirm.titleEl.textContent=`放生${x.name}`;confirm.containerEl.classList.add('lake-pond-remove-modal');confirm.modalEl.classList.add('lake-pond-remove-dialog');
          el(confirm.contentEl,'p',`要让「${x.name}」离开这片湖，去往更广阔的天地吗？`);
          el(confirm.contentEl,'p',`放生后，「${x.name}」将不再出现在湖中，名字、档案和全部吃食记录都会永久删除，不再归档，无法撤销。`);
          const cancel=el(confirm.contentEl,'button','再陪陪我');cancel.type='button';cancel.onclick=()=>confirm.close();
          const yes=el(confirm.contentEl,'button',`确认放生${x.name}`);yes.type='button';yes.className='mod-warning';
          yes.onclick=async()=>{yes.disabled=true;try{this.state=await store.remove(x.id);if(this.selectedId===x.id)this.selectedId=null;confirm.close();this.draw();new api.Notice(`已放生「${x.name}」，愿它自在畅游。`);}catch(e){yes.disabled=false;new api.Notice(`暂时没能放生「${x.name}」：${e.message}`);}};
          confirm.open();
        };
      }
      if(!selected){el(detail,'p','湖中还没有小伙伴，迎接一条新鱼或一只小乌龟吧。');return;}
      el(detail, 'h3', `${selected.name}的小档案`);
      el(detail, 'small', `固定 ID：${selected.id}`);
      const live = this.liveEl, liveFrame = live.querySelector('iframe');
      liveFrame.title = `${selected.name}的 Three.js 高清游动预览`;
      live.querySelector('small').textContent = '';
      this.sendPose();
      frame?.contentWindow?.postMessage(selected.inLake ? {type:'lake-pond-preview-start',id:selected.id} : {type:'lake-pond-preview-stop'},'*');
      const field = (label, tag, value, options) => {
        const wrap = el(detail, 'label', label); const input = el(wrap, tag);
        if (options) options.forEach(text => {const option = el(input, 'option', text); option.value = text;});
        input.value = value; return input;
      };
      const name = field('怎么称呼它', 'input', selected.name); name.maxLength = 24; name.required = true;
      const facts=el(detail,'dl');facts.className='lake-pond-facts';
      for(const [label,value] of [
        ['品种',selected.species],['来到世上的日子',selected.birthdate||'相识以前的生日，还不知道'],
        ['花纹',selected.appearance.pattern],[selected.kind==='fish'?'大身色':'背甲色',selected.appearance.bodyColor],
        [selected.kind==='fish'?'花纹色':'头颈四肢底色',selected.appearance.patternColor],
        ['大小',selected.size],['天生的性格',selected.personality]]){
        el(facts,'dt',label);el(facts,'dd',value);
      }
      const today=todayLocal();
      el(detail, 'p', `今天吃了 ${selected.feeding.daily[today] || 0} 次 · 相伴以来共吃了 ${selected.feeding.total} 次`);
      const save = el(detail, 'button', '记住这个名字'); save.type = 'submit'; save.className = 'mod-cta';
      detail.onsubmit = async e => {
        e.preventDefault(); save.disabled = true;
        try {
          await view.pondPlay.rename(selected.id,name.value);
          this.state = await store.read(); this.draw();
          new api.Notice(`记住啦，以后就叫「${name.value.trim()}」`);
        } catch(e) {status.textContent = `保存失败：${e.message}`; save.disabled = false;}
      };
    }
  }
  const host = view.containerEl.children[1];
  const entry = document.createElement('button'); entry.className = 'lake-pond-entry'; entry.type = 'button';
  entry.textContent = '🐟 湖中生物'; entry.title = '单独打开鱼与乌龟的身份档案';
  function openCard(id) {
    if (!view.pondModal?.containerEl?.isConnected) {
      view.pondModal = new PondCard(); view.pondModal.selectedId = id; view.pondModal.open();
    } else if (id && view.pondModal.state) {view.pondModal.selectedId = id; view.pondModal.draw();}
  }
  entry.onclick = () => openCard(); host.append(entry);
  const playPath=require('path').join(plugin.app.vault.adapter.getBasePath(),plugin.manifest.dir,'pond-play.js');
  delete require.cache[require.resolve(playPath)];
  view.pondPlay=require(playPath).attach(view,{store,openCard,api,openBirth:async kind=>{openCard();const card=view.pondModal;if(!card.state)card.state=await store.read();card.openBirthModal(kind);}});
  view.register(() => view.pondModal?.close());
  const original = view.openSection.bind(view);
  view.openSection = async id => {entry.hidden = id !== 'home';if(id!=='home')view.pondModal?.close();return original(id);};
}

module.exports = {attach, initial, validate, addCreature, removeCreature, assertLifeTransition};

// Run with Node: node pond.js --self-test (does not touch plugin data).
if(require.main===module&&process.argv.includes('--self-test')){
  const assert=require('node:assert/strict');
  const x=initial();assert.equal(validate(x).creatures.length,13);
  const deletedCheck=removeCreature(structuredClone(x),x.creatures[0].id);assert.equal(deletedCheck.creatures.length,12);assert.equal(deletedCheck.archive.length,0);assert.ok(!JSON.stringify(deletedCheck).includes(x.creatures[0].id+'\"'));
  const legacy=structuredClone(x);legacy.version=1;delete legacy.archive;
  for(const c of legacy.creatures){delete c.species;delete c.birthdate;delete c.size;c.appearance={color:c.appearance.bodyColor,pattern:'自然'};}
  const migrated=validate(legacy);assert.equal(migrated.version,2);
  assert.equal(migrated.creatures[0].appearance.pattern,'单色');
  const added=addCreature(migrated,'fish',{name:'阿寿',species:'兰寿鱼',bodyColor:'#daab35',patternColor:'#ffffff',pattern:'斑纹',size:'大',personality:'活泼'});
  assert.equal(added.birthdate,todayLocal());
  assert.equal(validate(migrated).creatures.at(-1).name,'阿寿');
  assert.equal(validate(migrated).creatures.at(-1).species,'兰寿鱼');
  assert.doesNotThrow(()=>assertLifeTransition(validate(legacy),validate(migrated)));
  const altered=structuredClone(migrated);altered.creatures[0].species='黄金锦鲤';
  assert.throws(()=>assertLifeTransition(validate(legacy),validate(altered)));
  const removed=structuredClone(migrated);removed.creatures.shift();
  assert.throws(()=>assertLifeTransition(validate(legacy),validate(removed)));
  console.log('pond self-test passed');
}
