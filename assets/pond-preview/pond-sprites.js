/* Reference-derived transparent sprites driven by the lake's real creature poses. */
(()=>{
 'use strict';
 const sources=window.lakePondSprites||{},preview=window.lakePondSpritePreview===true,images=new Map();
 const canvas=document.createElement('canvas');canvas.className='lake-reference-sprite-layer';canvas.setAttribute('aria-hidden','true');
 Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'2'});document.body.append(canvas);
 const ctx=canvas.getContext('2d');let width=0,height=0,dpr=1,pose=null,last=0,disposed=false;
 function resize(){width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
 addEventListener('resize',resize);resize();
 function imageFor(name){if(!sources[name])return null;if(!images.has(name)){const img=new Image();images.set(name,img);img.onload=()=>{if(preview&&pose?.active&&pose.creature?.species===name){clear();drawOne({...pose.creature,angle:pose.angle||0},performance.now(),true);}parent.postMessage({type:'lake-pond-sprite-ready',species:name},'*');};img.onerror=()=>parent.postMessage({type:'lake-pond-sprite-error',species:name},'*');img.src=sources[name];}return images.get(name);}
 function ready(name){const img=imageFor(name);return !!img&&img.complete&&img.naturalWidth>0;}
 function clear(){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);}
 function drawOne(a,ms,large){const img=imageFor(a.species);if(!img?.complete||!img.naturalWidth)return;
  const scale=a.size==='小'?.78:a.size==='大'?1.25:1,vertical=a.kind==='turtle';
  const w=(large?Math.min(width*.68,height*.82):Math.max(50,Math.min(105,width*.09)))*scale,h=w*img.naturalHeight/img.naturalWidth;
  ctx.save();ctx.translate(large?width*.5:a.x*width,large?height*.5:(1-a.y)*height);ctx.rotate(-(Number(a.angle)||0));if(vertical)ctx.rotate(Math.PI/2);
  const phase=ms*.001*(a.personality==='活泼'?3.5:2.2)+(a.slot||0),slices=32;
  for(let i=0;i<slices;i++){const u=i/slices,sw=img.naturalWidth/slices,tail=Math.max(0,(.62-u)/.62),dy=Math.sin(phase-u*5)*tail*tail*h*(vertical?.014:.038);ctx.drawImage(img,i*sw,0,Math.min(sw+1,img.naturalWidth-i*sw),img.naturalHeight,(u-.5)*w,-h/2+dy,w/slices+.7,h);}
  ctx.restore();
 }
 const api={ready,has:name=>!!sources[name],getPose:()=>pose,draw(list,ms){if(disposed)return;clear();for(const a of list)if((a.inLake||a.leaving)&&ready(a.species))drawOne(a,ms,false);}};
 window.lakeSpriteOverlay=api;
 if(preview){addEventListener('message',e=>{if(e.source!==parent||e.data?.type!=='pond-pose')return;pose=e.data;imageFor(pose.creature?.species);clear();if(pose?.active&&ready(pose.creature?.species))drawOne({...pose.creature,angle:pose.angle||0},performance.now(),true);});const tick=ms=>{if(disposed)return;requestAnimationFrame(tick);if(ms-last<33)return;last=ms;clear();if(pose?.active&&ready(pose.creature?.species))drawOne({...pose.creature,angle:pose.angle||0},ms,true);};requestAnimationFrame(tick);}
 addEventListener('pagehide',()=>{disposed=true;});
})();
