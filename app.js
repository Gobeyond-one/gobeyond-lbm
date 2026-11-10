import {ReactorView} from './scene.js?v=20261103-cloud';
import {FieldCloud} from './pointcloud.js?v=20261110-tracer-opacity';
import {MixingReplay} from './mixing.js?v=20261110-tracer-opacity';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const icon=id=>`<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const json=async p=>{const r=await fetch(p);if(!r.ok)throw new Error(`Unable to load ${p}`);return r.json();};
const binary=async p=>{const r=await fetch(p);if(!r.ok)throw new Error(`Unable to load ${p}`);return r.arrayBuffer();};
let toastTimer;function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3000);}
function active(buttons,selected){for(const b of buttons){const yes=b===selected;b.classList.toggle('active',yes);if(b.hasAttribute('aria-selected'))b.setAttribute('aria-selected',String(yes));}}
function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}

$('.mobile-menu').addEventListener('click',()=>{const open=$('.header nav').classList.toggle('open');$('.mobile-menu').setAttribute('aria-expanded',String(open));});
$$('.header nav a').forEach(a=>a.addEventListener('click',()=>{$('.header nav').classList.remove('open');$('.mobile-menu').setAttribute('aria-expanded','false');}));

const hero=new ReactorView('hero-view',{autoRotate:true});
const geometry=new ReactorView('geometry-view');
let wire=false,preset='perforated',geometryMode='free';
const metaPromise=json('assets/grid-meta.json');
hero.loadCad().then(async()=>{const meta=await metaPromise;hero.setAngle(meta.rotor_angle_rad);hero.addFlow(new Float32Array(await binary('assets/hero-flow.bin')));}).catch(()=>toast('三维数据暂时不可用，请刷新重试'));
geometry.loadCad().catch(()=>toast('几何数据载入失败'));
const modelPrompts={perforated:'构建一个直径 150 mm 的搅拌槽，使用六片梯形叶片，每片开一个 4 mm 贯穿孔，保留四块挡板。',filled:'保持同一搅拌槽和梯形叶片轮廓，将叶片的贯穿孔填实，生成一组便于对比的完整实体。'};
async function selectPreset(value){preset=value;active($$('[data-preset]'),$(`[data-preset="${value}"]`));$('#model-prompt').textContent=modelPrompts[value];$('#geometry-title').textContent=value==='perforated'?'带孔梯形桨 / STL 预览':'实心梯形桨 / STL 预览';$('#geometry-caption').textContent=value==='perforated'?'真实 STL · 贯穿孔保留为流体区域':'真实 STL · 相同外轮廓的填孔对照';$('#stl-download').href=`assets/${value==='filled'?'filled':'perforated'}-reactor.zip`;await geometry.loadCad(value);geometry.setWire(wire);}
$$('[data-preset]').forEach(b=>b.addEventListener('click',()=>selectPreset(b.dataset.preset)));
function templateParameters(){return {tank:Number($('#tank').value),diameter:Number($('#diameter').value),clearance:Number($('#clearance').value),layers:Number($('#layers').value),blades:Number($('#blades').value)};}
function validateTemplate(p){const dx=p.tank/240,half=p.diameter*.1;if(p.diameter/2+2*dx>=p.tank/2-17.5)return '桨叶与挡板的间距不足';const levels=p.layers===2?[p.clearance,p.tank-p.clearance]:[p.clearance];if(levels.some(c=>c-half<2*dx||c+half>p.tank-2*dx))return '桨叶与顶部或底部的间距不足';if(p.layers===2&&Math.abs(levels[1]-levels[0])<2*half+2*dx)return '两层桨叶间距不足';return '';}
function updateTemplate(){const p=templateParameters();for(const name of ['tank','diameter','clearance'])$(`#${name}-out`).value=p[name];const error=validateTemplate(p);$('#parameter-status').innerHTML=`${icon(error?'close':'check')} ${error||'基础几何检查通过'}`;$('#parameter-status').classList.toggle('invalid',!!error);$('#export-parameters').disabled=!!error;if(geometryMode==='template'){geometry.template(p);geometry.setWire(wire);$('#geometry-title').textContent=`${p.layers===2?'双层':'单层'}搅拌槽 / 参数预览`;$('#geometry-caption').textContent=`T = H = ${p.tank} mm · D = ${p.diameter} mm · ${p.blades} 片叶片`;}}
for(const name of ['tank','diameter','clearance','layers','blades'])$(`#${name}`).addEventListener('input',updateTemplate);
$$('[role="tab"]').forEach(b=>b.addEventListener('click',()=>{active($$('.tabs [role="tab"]'),b);geometryMode=b.id==='tab-template'?'template':'free';$('#panel-free').hidden=geometryMode!=='free';$('#panel-template').hidden=geometryMode!=='template';if(geometryMode==='template')updateTemplate();else selectPreset(preset);}));
$('#export-parameters').addEventListener('click',()=>{const p=templateParameters();if(validateTemplate(p))return;download('reactor-parameters.json',{tank_diameter_m:p.tank/1000,liquid_height_m:p.tank/1000,impeller_diameter_m:p.diameter/1000,impeller_levels_m:(p.layers===2?[p.clearance,p.tank-p.clearance]:[p.clearance]).map(x=>x/1000),blade_count:p.blades,rpm:2672});toast('设计参数已导出，可交给建模与求解工具');});
$('#solid-view').addEventListener('click',()=>{wire=false;active([$('#solid-view'),$('#wire-view')],$('#solid-view'));geometry.setWire(false);});$('#wire-view').addEventListener('click',()=>{wire=true;active([$('#solid-view'),$('#wire-view')],$('#wire-view'));geometry.setWire(true);});
$('.reset-view').addEventListener('click',()=>geometry.reset());

// Grid: actual full-resolution saved CFD mask, not a decorative surface mesh.
let gridData,gridVolume,gridPlane='xy',gridZoom=false,volumeMode=false;
const canvas=$('#grid-canvas'),ctx=canvas.getContext('2d');
const gridPromise=Promise.all([metaPromise,binary('assets/grid-mask.rle'),binary('assets/ibm-points.bin')]).then(([meta,rle,points])=>{const counts=new Uint32Array(rle),mask=new Uint8Array(meta.shape.reduce((a,b)=>a*b,1));let pos=0,value=meta.rle_initial;for(const n of counts){mask.fill(value,pos,pos+n);pos+=n;value=1-value;}if(pos!==mask.length)throw new Error('Grid encoding mismatch');gridData={meta,mask,ibm:new Float32Array(points)};$('#ibm-count').textContent=meta.ibm_count.toLocaleString('en-US');$('#grid-loading').hidden=true;drawGrid();return gridData;}).catch(e=>{$('#grid-loading').textContent='格点数据载入失败，请刷新重试';throw e;});
function drawGrid(){if(!gridData||volumeMode)return;const {mask,ibm}=gridData,w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const value=Number($('#grid-slice').value),xmin=gridZoom?65:5,xmax=gridZoom?185:245,ymin=gridPlane==='xy'?(gridZoom?65:5):(gridZoom?49:1),ymax=gridPlane==='xy'?(gridZoom?185:245):(gridZoom?113:241),nx=xmax-xmin+1,ny=ymax-ymin+1,cell=Math.min((w-68)/nx,(h-57)/ny),ox=(w-cell*nx)/2,oy=(h-cell*ny)/2;
 const showFluid=$('#show-lattice').checked,showSolid=$('#show-solids').checked,showIBM=$('#show-ibm').checked;
 for(let row=ymin;row<=ymax;row++)for(let x=xmin;x<=xmax;x++){const y=gridPlane==='xy'?row:125+value,z=gridPlane==='xy'?value+1:row;if((x-125)**2+(y-125)**2>14400||z<1||z>241)continue;const fluid=mask[x+250*(y+250*z)],px=ox+(x-xmin)*cell,py=oy+(ymax-row)*cell;if(!fluid&&showSolid){ctx.fillStyle='#355b62';ctx.fillRect(px,py,cell+.1,cell+.1);}else if(fluid&&showFluid){ctx.fillStyle='#9ab4b1';const s=Math.min(1.2,Math.max(.65,cell*.25));ctx.fillRect(px+cell/2-s/2,py+cell/2-s/2,s,s);}}
 if(showFluid&&cell>2.4){ctx.beginPath();for(let x=0;x<=nx;x++){ctx.moveTo(ox+x*cell,oy);ctx.lineTo(ox+x*cell,oy+ny*cell);}for(let y=0;y<=ny;y++){ctx.moveTo(ox,oy+y*cell);ctx.lineTo(ox+nx*cell,oy+y*cell);}ctx.strokeStyle='rgba(116,152,143,.13)';ctx.lineWidth=.5;ctx.stroke();}
 if(showIBM){ctx.fillStyle='#e97b3c';for(let i=0;i<ibm.length;i+=3){const x=ibm[i]+125,row=gridPlane==='xy'?ibm[i+1]+125:ibm[i+2]+1,distance=gridPlane==='xy'?Math.abs(ibm[i+2]-value):Math.abs(ibm[i+1]-value);if(distance>.6||x<xmin||x>xmax||row<ymin||row>ymax)continue;ctx.beginPath();ctx.arc(ox+(x-xmin+.5)*cell,oy+(ymax-row+.5)*cell,Math.max(.8,Math.min(1.7,cell*.2)),0,Math.PI*2);ctx.fill();}}
 ctx.strokeStyle='#c7d3bf';ctx.lineWidth=.7;ctx.strokeRect(ox,oy,nx*cell,ny*cell);ctx.fillStyle='#81967a';ctx.font='9px monospace';ctx.textAlign='center';for(let i=0;i<=4;i++){const x=xmin+(xmax-xmin)*i/4;ctx.fillText(((x-125)*.625).toFixed(0),ox+(x-xmin+.5)*cell,oy+ny*cell+15);}ctx.textAlign='right';for(let i=0;i<=4;i++){const row=ymin+(ymax-ymin)*i/4;ctx.fillText(((row-(gridPlane==='xy'?125:1))*.625).toFixed(0),ox-9,oy+(ymax-row+.5)*cell+3);}ctx.textAlign='left';ctx.fillText(gridPlane==='xy'?'y / mm':'z / mm',ox-7,oy-10);ctx.textAlign='right';ctx.fillText('x / mm',ox+nx*cell,oy+ny*cell+28);
 $('#grid-coordinate').textContent=gridPlane==='xy'?`XY · z = ${(value*.625).toFixed(1)} mm`:`XZ · y = ${(value*.625).toFixed(1)} mm`;
}
new ResizeObserver(drawGrid).observe(canvas);
function refreshLayers(){if(volumeMode&&gridVolume?.ready){gridVolume.volumeFluid.visible=$('#show-lattice').checked;gridVolume.volumeSolid.visible=$('#show-solids').checked;gridVolume.ibmVolume.visible=$('#show-ibm').checked;}else drawGrid();}
for(const id of ['show-lattice','show-solids','show-ibm'])$(`#${id}`).addEventListener('change',refreshLayers);
$$('[data-plane]').forEach(b=>b.addEventListener('click',()=>{gridPlane=b.dataset.plane;active($$('[data-plane]'),b);const slider=$('#grid-slice');slider.min=gridPlane==='xy'?1:-119;slider.max=239;if(gridPlane==='xz')slider.max=119;slider.value=gridPlane==='xy'?80:24;$('#slice-label').textContent=gridPlane==='xy'?'高度':'位置';$('#slice-output').value=`${(Number(slider.value)*.625).toFixed(1)} mm`;if(volumeMode)setGridMode(false);drawGrid();}));
$('#grid-slice').addEventListener('input',()=>{$('#slice-output').value=`${(Number($('#grid-slice').value)*.625).toFixed(1)} mm`;drawGrid();});
$('#grid-zoom').addEventListener('click',()=>{if(volumeMode)setGridMode(false);gridZoom=!gridZoom;$('#grid-zoom').textContent=gridZoom?'恢复全槽 ↙':'桨叶局部 ↗';drawGrid();});
async function setGridMode(value){volumeMode=value;active([$('#grid-slice-mode'),$('#grid-volume-mode')],value?$('#grid-volume-mode'):$('#grid-slice-mode'));canvas.hidden=value;$('#grid-volume-view').hidden=!value;$('#grid-coordinate').textContent=value?'三维格点 · 每 6 格抽样显示':$('#grid-coordinate').textContent;if(value){try{const d=await gridPromise;if(!gridVolume){gridVolume=new ReactorView('grid-volume-view',{grid:true});gridVolume.makeVolume(d.mask,d.meta,d.ibm);}gridVolume.resize();refreshLayers();}catch{toast('网格数据暂时不可用');}}else drawGrid();}
$('#grid-slice-mode').addEventListener('click',()=>setGridMode(false));$('#grid-volume-mode').addEventListener('click',()=>setGridMode(true));

// Saved volume fields in fixed tank coordinates. Continuous looping is display only.
const simulation=new ReactorView('simulation-view',{dark:true});simulation.template({phase:0});simulation.addPlanes();
if(simulation.planeGroup)simulation.planeGroup.visible=false;
let resultType='startup',mixView='paired',mixing,cloudMeta,cloud,qBuffer,speedBuffer,vectorBuffer,startupMeta,startupBuffer;
let frame=0,playing=false,resultVisible=false,loaded=false,phase=0,cycles=0,requestId=0;
let cloudPromise,startupPromise;
function loadCloud(){return cloudPromise??=Promise.all([json('assets/cloud.json'),binary('assets/cloud-positions.bin'),binary('assets/cloud-arrow-positions.bin'),binary('assets/cloud-concentration.bin'),binary('assets/cloud-vectors.bin'),binary('assets/cloud-speed.bin')]).then(([meta,positions,arrows,q,vectors,speed])=>{
  if(positions.byteLength!==meta.point_count*12||q.byteLength!==meta.frames.length*meta.point_count*2||speed.byteLength!==q.byteLength||arrows.byteLength!==meta.arrow_count*12||vectors.byteLength!==meta.frames.length*meta.arrow_count*6)throw Error('三维数据长度检查失败');
  cloudMeta=meta;qBuffer=q;speedBuffer=speed;vectorBuffer=vectors;
  mixing=new MixingReplay(meta,new Float32Array(positions),new Float32Array(arrows));
  if(!simulation.failed){cloud=new FieldCloud(simulation,meta,new Float32Array(positions),new Float32Array(arrows));cloud.group.visible=false;}
  return meta;
});}
function loadStartup(){return startupPromise??=Promise.all([json('assets/startup.json'),binary('assets/startup.bin')]).then(([meta,buffer])=>{startupMeta=meta;startupBuffer=buffer;});}
function cloudStyle(){cloud?.setStyle({opacity:Number($('#cloud-opacity').value),cutaway:$('#cloud-cutaway').checked,arrows:$('#cloud-arrows').checked,deviation:$('#cloud-deviation').checked,speedMax:12});}
for(const id of ['cloud-opacity','cloud-cutaway','cloud-arrows','cloud-deviation'])$(`#${id}`).addEventListener('input',()=>{cloudStyle();displayFrame();});
function syncMixingView(){
  const concentration=resultType==='concentration',paired=concentration&&mixView==='paired';
  $('#mixing-controls').hidden=!concentration;
  $('#mix-progress').hidden=!concentration;
  $('#mixing-pair').hidden=!paired;
  $('#mix-contrast-control').hidden=!paired;
  $('#cloud-controls').hidden=resultType==='startup'||paired;
  $('.simulation-stage').classList.toggle('mixing-paired',paired);
  for(const button of $$('[data-mix-view]')){
    const yes=button.dataset.mixView===mixView;
    button.classList.toggle('active',yes);button.setAttribute('aria-pressed',String(yes));
  }
  if(cloud)cloud.group.visible=concentration&&!paired;
}
$$('[data-mix-view]').forEach(button=>button.addEventListener('click',()=>{
  mixView=button.dataset.mixView;syncMixingView();displayFrame();
}));
$$('[data-mix-jump]').forEach(button=>button.addEventListener('click',()=>{
  if(!loaded||resultType!=='concentration')return;
  const target=Number(button.dataset.mixJump);
  $('#mix-contrast').checked=target===cloudMeta.frames.length-1;
  setPlaying(false);phase=target/(cloudMeta.frames.length-1);displayFrame();
}));
$('#mix-contrast').addEventListener('change',displayFrame);
function setPlaying(value){playing=!!value&&loaded;$('#playback-toggle').innerHTML=icon(playing?'pause':'play');$('#playback-toggle').setAttribute('aria-label',playing?'暂停流场回放':'播放流场回放');$('#playback-label').textContent=playing?'循环播放':'已暂停 · 可循环';}
function displayFrame(){
  if(!loaded)return;
  if(resultType==='startup'){
    frame=Math.min(startupMeta.frames.length-1,Math.floor(phase*startupMeta.frames.length));const f=startupMeta.frames[frame];
    simulation.updatePlanes(startupBuffer,frame,startupMeta);simulation.setAngle(f.step*startupMeta.omega_lu);
    $('#simulation-time').textContent=`开机后 ${f.time_s.toFixed(5)} s`;$('#simulation-clock').textContent=`静止启动 · 实算帧 ${frame+1} / ${startupMeta.frames.length}`;$('#rotation-label').textContent=`${f.revolutions.toFixed(1)} 转`;
  }else{
    const cursor=phase*(cloudMeta.frames.length-1),lo=Math.floor(cursor),hi=Math.min(lo+1,cloudMeta.frames.length-1),blend=cursor-lo;
    frame=lo;const a=cloudMeta.frames[lo],b=cloudMeta.frames[hi],step=a.step+(b.step-a.step)*blend,time=a.time_s+(b.time_s-a.time_s)*blend,tracer=a.tracer_time_s+(b.tracer_time_s-a.tracer_time_s)*blend;
    if(mixView==='paired'){
      const contrast=$('#mix-contrast').checked;
      mixing?.draw(qBuffer,speedBuffer,vectorBuffer,lo,hi,blend,contrast);
      $('#mix-tracer-low').textContent=contrast?'≤0.8':'0';
      $('#mix-tracer-high').textContent=contrast?'≥1.2':'≥2';
    }
    else {cloud?.update(qBuffer,vectorBuffer,lo,hi,blend);simulation.setAngle(step*a.omega_lu);}
    mixing?.mark(a);
    $('#simulation-time').textContent=resultType==='concentration'?`释放后 ${tracer.toFixed(4)} s`:`开机后 ${time.toFixed(4)} s`;
    $('#simulation-clock').textContent=`${resultType==='concentration'?`开机后 ${time.toFixed(4)} s · `:''}实算帧 ${lo+1} / ${cloudMeta.frames.length} · 显示插值`;
    $('#rotation-label').textContent=`${(step*a.omega_lu/(2*Math.PI)).toFixed(1)} 转`;
    $('#result-metric').textContent=resultType==='concentration'?`${(a.metrics.global_cv*100).toFixed(2)}%`:cloudMeta.point_count.toLocaleString('en-US');
  }
  $('#time-slider').value=Math.round(phase*1000);$('#simulation-view').dataset.frame=frame;$('#simulation-view').dataset.cycle=cycles;
}
async function selectResult(type){
  const ticket=++requestId;resultType=type;loaded=false;phase=0;cycles=0;setPlaying(false);
  $('#mix-contrast').checked=false;
  const concentration=type==='concentration',startup=type==='startup';active($$('[data-result]'),$(`[data-result="${type}"]`));$$('[data-result]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.result===type)));
  $('#result-loading').hidden=false;$('#result-loading').textContent=concentration?'载入搅拌与扩散体积场…':startup?'载入静止启动记录…':'载入真实三维流场…';$('#playback-toggle').disabled=true;$('#time-slider').disabled=true;
  syncMixingView();$('#simulation-legend').classList.toggle('concentration',concentration);
  $('#legend-title').textContent=concentration?'相对浓度 C / C∞':'速率 / m·s⁻¹';$('#legend-mid').textContent=concentration?'1':'6';$('#legend-high').textContent=concentration?'≥2':'12+';
  $('#simulation-case-title').textContent=startup?'六叶搅拌槽 · 流体从静止启动':concentration?'六叶搅拌槽 · 示踪剂对流与扩散':'六叶搅拌槽 · 三维速度场';
  $('#simulation-heading').innerHTML=concentration?'随流动展开，<br>在扩散中混合。':'叶片提供动力，<br>流场响应结构。';
  $('#result-description').textContent=concentration?'先看速度和箭头，找出桨区射流与槽内循环，再对照示踪剂如何铺开。浓度越低越透明，越高颜色越深。色标的 1 表示均匀混合时的浓度。':startup?'流体以零速度开始，搅拌桨按给定转速启动。这组记录保留两个真实速度切片，供观察启动过程。':'颜色表示固定空间采样位置的速率，箭头表示实际速度方向。旋转查看桨区射流和槽内上下循环。';
  $('#result-scope').textContent=startup?'静止 → 60 转 · 28 帧':concentration?'释放后 0–0.8982 s · 81 帧':'60 转预热后 · 81 帧体积场';
  $('#result-metric-label').textContent=concentration?'全槽 CV（实算帧）':startup?'流体初始速度':'三维采样点';$('#result-metric').textContent=startup?'0 m/s':'30,720';
  $('#simulation-hint').textContent=startup?'拖动旋转 · 静止启动的两个实际切片':'拖动旋转 · 固定空间的体积采样点';
  $('#simulation-origin-note').textContent=startup?'此处 t=0 为流体静止时刻；播放终点自动回到起点。':'示踪剂在预热 60 转后释放；释放后 t=0 不代表流体静止。';
  try{
    if(startup)await loadStartup();else await loadCloud();
    if(ticket!==requestId)return;
    if(cloud){cloud.setMode(concentration);cloudStyle();}syncMixingView();
    if(simulation.planeGroup)simulation.planeGroup.visible=startup;
    simulation.template({phase:startup?-30:0});loaded=true;$('#result-loading').hidden=true;$('#playback-toggle').disabled=false;$('#time-slider').disabled=false;
    displayFrame();setPlaying(!reduced);
  }catch(error){if(ticket===requestId){$('#result-loading').textContent='数据载入失败，请刷新重试';setPlaying(false);}console.error(error);}
}
$$('[data-result]').forEach(b=>b.addEventListener('click',()=>selectResult(b.dataset.result)));
$('#playback-toggle').addEventListener('click',()=>{if(!loaded)return;if(phase>=1)phase=0;setPlaying(!playing);displayFrame();});
$('#time-slider').addEventListener('input',()=>{setPlaying(false);phase=Number($('#time-slider').value)/1000;displayFrame();});
$('#playback-reset').addEventListener('click',()=>{phase=0;cycles=0;setPlaying(false);displayFrame();});
new IntersectionObserver(es=>{resultVisible=es[0].isIntersecting;},{threshold:.15}).observe($('.simulation-stage'));
let previousPlayback=0,lastDisplay=0;
function advance(t){
  const dt=previousPlayback?Math.min(.1,(t-previousPlayback)/1000):0;previousPlayback=t;
  if(playing&&resultVisible&&loaded&&!document.hidden){phase+=dt/(resultType==='startup'?8:14);if(phase>=1){cycles+=Math.floor(phase);phase%=1;}if(t-lastDisplay>30){lastDisplay=t;displayFrame();}}
  requestAnimationFrame(advance);
}
requestAnimationFrame(advance);selectResult(new URLSearchParams(location.search).get('view')==='mixing'?'concentration':'startup');

const cases=[
 {id:'ali2024-wake',module:'ALI 2024',name:'交错双方柱绕流',category:'flow',file:'ali2024-wake.webp',animated:true,tags:['Re = 200','G = 6','D2Q9/BGK'],description:'看两根交错方柱如何交替脱涡，在下游形成两条分离的卡门涡街。',method:'D2Q9/BGK · 640 × 560 格点 · 交错角 45°',scope:'从盲测的第 500,000 步终态续算至第 507,200 步（t* = 1,000–1,014.4），每 80 步取一帧。颜色表示带符号的无量纲涡量，播放按展示节奏循环。原盲测数值检查通过，两柱 St 分别为 0.1618 和 0.1612，均高于论文约 7%–8%。',source:'https://doi.org/10.1038/s41598-024-66895-0'},
 {id:'mass-transfer',module:'009',name:'气液传质',category:'interface',file:'mass-transfer.gif',tags:['Henry 分配','MRT'],description:'观察界面两侧浓度分配，以及溶质穿过气液界面的过程。',method:'相场 / 流场 + D3Q7 传质 MRT',scope:'已有耦合算例；稀溶质单向耦合，不包含气泡收缩反馈。'},
 {id:'reactive-flow',module:'010',name:'多组分反应输运',category:'reaction',file:'reactive-flow.gif',tags:['对流扩散','反应网络'],description:'沿真实通道推进多组分输运与反应，查看浓度分布演化。',method:'D2Q9 流动 + 多物种 D2Q5 + 隐式反应',scope:'等温反应输运基线，支持质量作用网络；反应热与温度反馈尚未接入。'},
 {id:'heat-exchange',module:'007',name:'流固共轭传热',category:'heat',file:'heat-exchange.gif',tags:['固体导热','流体对流'],description:'把流体对流与固体导热连接起来，观察跨材料热量交换。',method:'D2Q9 流动 + D2Q5 热 MRT',scope:'已有共轭界面与导热肋片算例，当前验证范围为静止、轴对齐界面。'},
 {id:'phase-change',module:'005',name:'熔化与凝固',category:'heat',file:'phase-change.gif',tags:['总焓法','液相率'],description:'以温度、总焓与液相率，追踪固液相变界面如何推进。',method:'D3Q7 总焓 SRT / MRT',scope:'导热控制的固液相变算例，包含潜热能量账本；没有液相对流耦合。'},
 {id:'particles',module:'006',name:'流固颗粒运动',category:'flow',file:'particles.gif',tags:['移动边界','力矩反馈'],description:'颗粒平移和转动影响流动，流体力与力矩反过来驱动颗粒。',method:'D3Q19 BGK + 移动链接 / 动量交换',scope:'已有分离球体运动算例，当前最多两个球体；未包含接触与润滑模型。'},
 {id:'non-newtonian',module:'004',name:'非牛顿流动',category:'flow',file:'non-newtonian.png',tags:['截断幂律','剪切依赖黏度'],description:'局部剪切率改变黏度，观察幂律流体在收缩流道中的响应。',method:'D3Q19 BGK + 三维应变率 / 幂律本构',scope:'已有解析参数对照、方形管道和收缩流道算例；属于广义牛顿截断幂律模型。'},
 {id:'phase-field',module:'008',name:'多相界面演化',category:'interface',file:'phase-field.png',tags:['相场法','界面不稳定性'],description:'通过相场与流动耦合，呈现两相界面的变形与演化。',method:'双 D2Q9 MRT：Cahn–Hilliard / 流场',scope:'展示二维界面不稳定性计算快照。不同密度比、迁移率与边界配置有独立的适用范围。'},
 {id:'reactive-topology',module:'002',name:'反应与形貌变化',category:'reaction',file:'reactive-topology.gif',tags:['溶解析出','保守拓扑更新'],description:'表面反应改变固体形貌，同时跟踪溶质输运和物质库存。',method:'D2Q5 三溶质 BGK + 表面反应 / 邻接生长',scope:'已有反应扩散、溶解及析出演示，保留数值改写和验证边界说明。'}
];
const isAnimatedCase=c=>c.animated||c.file.endsWith('.gif');
const gallery=$('#case-gallery');for(const c of cases){const animated=isAnimatedCase(c),poster=animated?`${c.id}-poster.png`:c.file,b=document.createElement('button');b.className='case-card';b.id=c.id;b.dataset.category=c.category;b.setAttribute('aria-label',`查看${c.name}真实算例`);b.innerHTML=`<div class="case-thumbnail"><img src="assets/cases/${animated&&reduced?poster:c.file}" alt="${c.name}的实际数值${animated?'动图':'结果'}" loading="lazy" width="640" height="360"><span class="case-index">${c.module} / ${animated?'动态结果':'结果快照'}</span></div><div class="case-copy"><div class="case-topline"><h3>${c.name}</h3>${icon('up')}</div><p>${c.description}</p><div class="case-tags">${c.tags.map(t=>`<span>${t}</span>`).join('')}</div></div>`;b.addEventListener('click',()=>openCase(c));gallery.append(b);}
$$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{active($$('[data-filter]'),b);for(const card of $$('.case-card'))card.hidden=b.dataset.filter!=='all'&&card.dataset.category!==b.dataset.filter;}));
const dialog=$('#detail-dialog');let lastFocus;
function openDialog(html){lastFocus=document.activeElement;$('#dialog-content').innerHTML=html;dialog.showModal();document.body.style.overflow='hidden';$('.dialog-close').focus();}
function closeDialog(){dialog.close();document.body.style.overflow='';$('#dialog-content').innerHTML='';lastFocus?.focus();}
$('.dialog-close').addEventListener('click',closeDialog);dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
function openCase(c){openDialog(`<p class="dialog-eyebrow">MODEL ${c.module} · 实际求解器输出</p><h2 class="dialog-title" id="dialog-title">${c.name}</h2><img class="dialog-image" src="assets/cases/${reduced&&isAnimatedCase(c)?c.id+'-poster.png':c.file}" alt="${c.name}模拟结果"><p class="dialog-text">${c.description}</p><dl class="dialog-facts"><div><dt>数值模型</dt><dd>${c.method}</dd></div><div><dt>算例类型</dt><dd>既有研究算例 · 模型输出</dd></div></dl><p class="dialog-text">${c.scope}</p>${c.source?`<p class="dialog-text"><a href="${c.source}" target="_blank" rel="noopener noreferrer">查看论文与 Fig. 7 ↗</a></p>`:''}`);}
const modelRows=[['001','多组分 / 多孔输运','D2Q9 Shan–Chen / 灰度反弹'],['002','反应扩散 / 溶解析出','D2Q5 多溶质 / 表面反应'],['003','自然对流','流 MRT / 热 MRT / 浮力'],['004','非牛顿流动','D3Q19 / 截断幂律'],['005','固液相变','D3Q7 总焓 SRT / MRT'],['006','移动颗粒','D3Q19 / 动量交换'],['007','共轭传热','流动 / 热 MRT / 共轭界面'],['008','多相相场','Cahn–Hilliard / 压力流场'],['009','气液传质','Henry 分配 / 传质 MRT'],['010','反应流动','多物种输运 / 隐式反应'],['011','二维搅拌','TRT / 体积惩罚'],['012','三维反应搅拌','D3Q19 / 守恒 FV / A+B→C'],['014','LES 三维搅拌','MRT / Coherent LES / IBM']];
$('#model-directory').addEventListener('click',()=>openDialog(`<p class="dialog-eyebrow">GOBEYOND · MODEL LIBRARY</p><h2 class="dialog-title" id="dialog-title">围绕物理过程，积累求解能力。</h2><p class="dialog-text">模型库包含 13 类物理模块。各模块有独立的验证与边界范围；具备某个模块，不代表任意跨物理组合已经耦合。</p><table class="model-list"><thead><tr><th>模块</th><th>物理过程</th><th>模型方向</th></tr></thead><tbody>${modelRows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>`));
function resultNotes(){openDialog(`<p class="dialog-eyebrow">REAL DATA · 可追溯算例</p><h2 class="dialog-title" id="dialog-title">三维流动，与搅拌扩散。</h2><p class="dialog-text">三维点云来自既有小槽可视化补算保存的 81 帧体积场，选取 30,720 个真实液体控制体内的空间采样位置。旋转网格先按各帧相位重采样到固定槽体坐标，再进行显示插值。点云是欧拉场值，不是液体粒子轨迹；箭头保留实际笛卡尔速度方向。</p><dl class="dialog-facts"><div><dt>三维记录</dt><dd>开机后 1.3473–2.2455 s；预热 60 转后释放示踪剂</dd></div><div><dt>扩散耦合</dt><dd>对流 + 独立分子扩散 Dm = 10⁻⁹ m²/s + 湍流扩散 Scₜ = 0.7</dd></div><div><dt>颜色</dt><dd>速度切片使用 0–12+ m/s；浓度点云按相对浓度 C/C∞，≥2 使用饱和色；可仅显示偏差超过 5% 的区域</dd></div><div><dt>静止启动记录</dt><dd>另一组独立启动补算的 28 个实际切片帧，开机后 0–1.3473 s</dd></div><div><dt>模型与范围</dt><dd>014 衍生 Coherent LES / IBM / standard-MRT 研究变体</dd></div></dl><p class="dialog-text">三维展示与静止启动属于不同记录，不拼接成同一次流动实现。同步剖面用穿过槽轴和释放点的竖直平面，取附近保存点做距离加权插值；箭头为附近速度在该平面内的投影。CV 读数沿用对应实算帧的全分辨率统计，折线使用对数轴。展示插值不用于重新计算混合时间。循环结束会回到记录起点，不表示物理场发生周期回归。</p>`);}
$('#show-result-notes').addEventListener('click',resultNotes);
$('#data-notes').addEventListener('click',()=>openDialog(`<p class="dialog-eyebrow">PRODUCT SCOPE · 数据与能力</p><h2 class="dialog-title" id="dialog-title">把能力说明，与真实结果放在一起。</h2><p class="dialog-text">几何区使用实际 CadQuery/STL 输出，并提供成熟反应器的参数化预览。网格区来自带孔叶片算例保存的实际计算格点与 IBM 节点；二维切片为原始分辨率，三维格点采用抽样展示。参数修改会更新预览与导出文件，后续网格和结果区仍展示已计算示例。</p><p class="dialog-text">当前 CAD 求解链路支持圆柱流体域、共轴同转速的刚体，以及相应位置的静止构件。一般几何建模与一般物理求解是不同的能力层，进出口、独立运动轴及其他边界需要对应的求解接口。</p><p class="dialog-text">算例图库全部来自已有数值模型输出。模型保留各自适用与验证范围，库内模块并不意味着任意组合均已耦合。产品页展示已有能力，不承诺所有输入都能未经检查地求解。</p>`));

// Deterministic public QA hooks, exposing display state only.
window.lbmProduct={get state(){return {geometryMode,preset,gridPlane,gridZoom,volumeMode,resultType,frame,playing,loaded,gridLoaded:!!gridData};},grid:()=>gridData?.meta};
