import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const geometries=new Map();
const views=[];
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const palette=['#1d3c68','#1c7f98','#42b8ae','#e9dd9c','#fa8d46','#f25536'].map(c=>new THREE.Color(c));
export function flowColor(value,max=12){const f=Math.min(1,Math.max(0,value/max))*(palette.length-1),i=Math.min(palette.length-2,Math.floor(f));return palette[i].clone().lerp(palette[i+1],f-i);}
function stl(url,sideOnly=false){
 if(!geometries.has(url))geometries.set(url,fetch(url).then(r=>{if(!r.ok)throw new Error('Geometry unavailable');return r.arrayBuffer();}).then(buffer=>{
  const d=new DataView(buffer),count=d.getUint32(80,true),p=[];
  for(let t=0;t<count;t++){const start=84+t*50;if(sideOnly&&Math.abs(d.getFloat32(start+8,true))>.99)continue;for(let j=0;j<3;j++){const o=start+12+j*12,x=d.getFloat32(o,true),y=d.getFloat32(o+4,true),z=d.getFloat32(o+8,true);p.push(x/75,(z-75)/75,-y/75);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
 }));return geometries.get(url);
}
function lineCircle(radius,y,color,opacity=1){const p=[];for(let i=0;i<=160;i++){const a=i/160*Math.PI*2;p.push(radius*Math.cos(a),y,radius*Math.sin(a));}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));return new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:true,opacity}));}
function metal(dark=false,orange=false){return new THREE.MeshStandardMaterial({color:orange?'#e79052':dark?'#b8c8bd':'#aab5a7',metalness:.36,roughness:.38,side:THREE.DoubleSide});}
function glass(dark=false){return new THREE.MeshBasicMaterial({color:dark?'#b5e2d0':'#8aa99b',transparent:true,opacity:dark?.035:.045,depthWrite:false,side:THREE.DoubleSide});}
function bodyCylinder(r,h,x,y,z,mat){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,64),mat);mesh.position.set(x,y,z);return mesh;}
function box(x,y,z,px,py,pz,angle,mat){const mesh=new THREE.Mesh(new THREE.BoxGeometry(x,y,z),mat);mesh.position.set(px,py,pz);mesh.rotation.y=angle;return mesh;}
export class ReactorView{
 constructor(id,{dark=false,autoRotate=false,grid=false}={}){
  this.host=document.getElementById(id);this.dark=dark;this.visible=false;this.ready=false;this.model=new THREE.Group();this.rotor=new THREE.Group();this.statics=new THREE.Group();this.model.add(this.rotor,this.statics);
  try{this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{this.host.innerHTML='<div class="webgl-fallback">三维预览需要 WebGL 支持<br>网格切片与案例图片仍可查看</div>';this.failed=true;return;}
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.host.append(this.renderer.domElement);
  this.scene=new THREE.Scene();this.scene.add(this.model);this.camera=new THREE.OrthographicCamera(-2,2,2,-2,.01,50);this.camera.position.set(3.5,1.9,3.7);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(0,-.05,0);this.controls.enableDamping=true;this.controls.dampingFactor=.08;this.controls.enablePan=false;this.controls.minZoom=.55;this.controls.maxZoom=3.4;this.controls.autoRotate=autoRotate&&!reduced;this.controls.autoRotateSpeed=.35;
  this.renderer.domElement.addEventListener('pointerdown',()=>this.controls.autoRotate=false);
  this.scene.add(new THREE.HemisphereLight(dark?'#dceee5':'#ffffff',dark?'#375965':'#b2b7a7',2.5));
  const key=new THREE.DirectionalLight('#fff8e6',3.4);key.position.set(3,5,2);this.scene.add(key);const fill=new THREE.DirectionalLight(dark?'#75c4db':'#c5ddd1',2.4);fill.position.set(-3,2,-2);this.scene.add(fill);
  if(!dark&&!grid){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,3,64,64,64);g.addColorStop(0,'rgba(69,82,57,.14)');g.addColorStop(1,'rgba(69,82,57,0)');x.fillStyle=g;x.fillRect(0,0,128,128);const shadow=new THREE.Mesh(new THREE.PlaneGeometry(3.4,3.4),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-1.02;this.scene.add(shadow);}
  new ResizeObserver(()=>this.resize()).observe(this.host);new IntersectionObserver(es=>this.visible=es[0].isIntersecting,{rootMargin:'150px'}).observe(this.host);this.resize();views.push(this);this.controls.update();
 }
 resize(){if(this.failed)return;const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);this.renderer.setSize(w,h,false);const scale=this.host.id==='hero-view'?1.42:1.5;this.camera.left=-scale*w/h;this.camera.right=scale*w/h;this.camera.top=scale;this.camera.bottom=-scale;this.camera.updateProjectionMatrix();}
 clear(){for(const group of [this.rotor,this.statics]){while(group.children.length){const o=group.children.pop();o.parent=null;o.traverse(n=>{if(n.material&&!Array.isArray(n.material))n.material.dispose();});}}this.rotor.rotation.set(0,0,0);}
 async loadCad(preset='perforated',angle=0){
  if(this.failed)return;const ticket=this.ticket=Symbol();const names=['vessel','shaft','disc_0','hub_0',...Array.from({length:6},(_,i)=>`blade_0_${i}`),...Array.from({length:4},(_,i)=>`baffle_${i}`)];
  const all=await Promise.all(names.map(n=>stl(`assets/${preset==='filled'&&n.startsWith('blade')?'cad-filled':'cad'}/${n}.stl`,n==='vessel')));if(ticket!==this.ticket)return;this.clear();
  names.forEach((name,i)=>{const isVessel=name==='vessel',isStatic=isVessel||name.startsWith('baffle'),mat=isVessel?glass(this.dark):metal(this.dark,name.startsWith('blade'));const mesh=new THREE.Mesh(all[i],mat);mesh.userData.solid=!isVessel;(isStatic?this.statics:this.rotor).add(mesh);});
  this.addRims();this.rotor.rotation.y=angle;this.ready=true;
 }
 addRims(radius=1,height=1){const color=this.dark?'#8bb2af':'#9da99a';this.statics.add(lineCircle(radius,height,color,.6),lineCircle(radius,-height,color,.5));}
 template({tank=150,diameter=50,clearance=50,layers=1,blades=6,phase=-30}={}){
  if(this.failed)return;this.ticket=Symbol();this.clear();const R=tank/2,H=tank,dr=diameter/R,shaft=4/R,mat=metal(this.dark),rotorMat=metal(this.dark,true),height=H/(2*R);
  this.statics.add(bodyCylinder(1,H/R,0,0,0,glass(this.dark)));this.rotor.add(bodyCylinder(shaft,H/R,0,0,0,mat));
  const levels=layers===2?[clearance,H-clearance]:[clearance];
  for(const C of levels){const y=(C-H/2)/R;this.rotor.add(bodyCylinder(.375*dr,.04*dr,0,y,0,mat),bodyCylinder(.16*dr,.2*dr,0,y,0,mat));for(let i=0;i<blades;i++){const a=phase*Math.PI/180+i*Math.PI*2/blades;this.rotor.add(box(.25*dr,.2*dr,.04*dr,.375*dr*Math.cos(a),y,-.375*dr*Math.sin(a),a,rotorMat));}}
  for(let i=0;i<4;i++){const a=i*Math.PI/2,r=1-10/R;this.statics.add(box(15/R,H/R,2/R,r*Math.cos(a),0,-r*Math.sin(a),a,mat));}this.addRims(1,height);this.ready=true;
 }
 setAngle(a){if(!this.failed)this.rotor.rotation.y=a;}
 setWire(value){if(this.failed)return;for(const g of [this.rotor,this.statics])g.traverse(o=>{if(o.isMesh&&o.userData.solid!==false&&o.material?.wireframe!==undefined&&!o.material.transparent)o.material.wireframe=value;});}
 reset(){if(this.failed)return;this.camera.position.set(3.5,1.9,3.7);this.camera.zoom=1;this.camera.updateProjectionMatrix();this.controls.target.set(0,-.05,0);this.controls.update();}
 addFlow(a){if(this.failed)return;const p=[],colors=[];const side=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);for(let i=0;i<a.length;i+=6){const pos=new THREE.Vector3(a[i]/75,(a[i+2]-75)/75,-a[i+1]/75),v=new THREE.Vector3(a[i+3],a[i+5],-a[i+4]),speed=v.length();if(speed<.03)continue;v.normalize();const len=.015+Math.min(speed,12)*.012,end=pos.clone().addScaledVector(v,len),c=flowColor(speed,8);side.crossVectors(v,up);if(side.length()<.1)side.set(1,0,0);side.normalize();const h1=end.clone().addScaledVector(v,-len*.27).addScaledVector(side,len*.16),h2=end.clone().addScaledVector(v,-len*.27).addScaledVector(side,-len*.16);for(const q of [pos,end,end,h1,end,h2]){p.push(q.x,q.y,q.z);colors.push(c.r,c.g,c.b);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));this.scene.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.8})));}
 makeVolume(mask,meta,ibm){if(this.failed)return;this.clear();const fluid=[],solid=[],s=6;for(let z=4;z<240;z+=s)for(let y=5;y<246;y+=s)for(let x=5;x<246;x+=s){if((x-125)**2+(y-125)**2>14400)continue;const k=x+250*(y+250*z);(mask[k]?fluid:solid).push((x-125)/120,(z-121)/120,-(y-125)/120);}const make=(p,color,size,opacity)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));const obj=new THREE.Points(g,new THREE.PointsMaterial({color,size,transparent:true,opacity,sizeAttenuation:true}));this.scene.add(obj);return obj;};this.volumeFluid=make(fluid,'#6a9ca1',.009,.45);this.volumeSolid=make(solid,'#345963',.016,.85);const q=[];for(let i=0;i<ibm.length;i+=30)q.push(ibm[i]/120,(ibm[i+2]-120)/120,-ibm[i+1]/120);this.ibmVolume=make(q,'#ed743d',.009,.7);this.addRims();this.ready=true;}
 addPlanes(){if(this.failed)return;this.textures=[];this.textureCanvases=[];for(let i=0;i<2;i++){const c=document.createElement('canvas');c.width=c.height=484;this.textureCanvases.push(c);const t=new THREE.CanvasTexture(c);t.flipY=false;t.colorSpace=THREE.SRGBColorSpace;t.minFilter=THREE.LinearFilter;this.textures.push(t);const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:t,transparent:true,side:THREE.DoubleSide,depthWrite:false}));if(i===0)mesh.rotation.y=Math.PI/4;else{mesh.rotation.x=-Math.PI/2;mesh.position.y=-1+80/120;}mesh.renderOrder=1;this.scene.add(mesh);}}
 updatePlanes(buffer,frameIndex,meta){if(this.failed)return;const side=121,n=side*side,frameBytes=n*6*2;for(let plane=0;plane<2;plane++){const o=frameIndex*frameBytes+plane*n*6,speed=new Uint16Array(buffer,o,n),u=new Int16Array(buffer,o+n*2,n),v=new Int16Array(buffer,o+n*4,n),c=this.textureCanvases[plane],ctx=c.getContext('2d'),tiny=document.createElement('canvas');tiny.width=tiny.height=side;const tc=tiny.getContext('2d'),image=tc.createImageData(side,side);for(let i=0;i<n;i++){if(speed[i]===65535)continue;const value=speed[i]*meta.speed_scale,color=flowColor(value).convertLinearToSRGB();image.data[4*i]=Math.round(color.r*255);image.data[4*i+1]=Math.round(color.g*255);image.data[4*i+2]=Math.round(color.b*255);image.data[4*i+3]=value<.0001?20:235;}tc.putImageData(image,0,0);ctx.clearRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=true;ctx.drawImage(tiny,0,0,c.width,c.height);ctx.strokeStyle='rgba(237,250,226,.68)';ctx.lineWidth=1.3;for(let y=5;y<side;y+=9)for(let x=5;x<side;x+=9){const i=x+y*side;if(speed[i]===65535)continue;const a=u[i]*meta.vector_scale,b=v[i]*meta.vector_scale,length=Math.hypot(a,b);if(length<.07)continue;const scale=Math.min(15,length*4)/length,dx=a*scale,dy=b*scale,px=x*4,py=y*4;ctx.beginPath();ctx.moveTo(px-dx*.4,py-dy*.4);ctx.lineTo(px+dx*.6,py+dy*.6);ctx.stroke();}this.textures[plane].needsUpdate=true;}}
}
let previous=0;function render(t){const dt=Math.min(.05,(t-previous)/1000);previous=t;for(const v of views){if(!v.visible||v.failed)continue;v.controls.update(dt);v.renderer.render(v.scene,v.camera);}requestAnimationFrame(render);}requestAnimationFrame(render);
