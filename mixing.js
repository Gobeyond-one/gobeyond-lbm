// Matched views of the saved Eulerian fields. Interpolation is for display only.
const N=112, HALF=75, BIN=7.5, BINS=20, NEIGHBORS=4, SQRT2=Math.SQRT2;
const svgNS='http://www.w3.org/2000/svg';
const speedColors=[[17,41,67],[35,122,151],[112,207,186],[254,206,115]];
const tracerColors=[[184,79,111],[184,79,111],[137,36,68]];
const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
function ramp(colors){
  return Array.from({length:256},(_,i)=>{
    const q=i/255*(colors.length-1),a=Math.min(colors.length-2,Math.floor(q));
    return colors[a].map((c,k)=>Math.round(c+(colors[a+1][k]-c)*(q-a)));
  });
}
function project(points,i){return [(points[i]+points[i+1])/SQRT2,points[i+2],(points[i+1]-points[i])/SQRT2];}
function gridMap(points){
  // A vertical plane through the tank axis and the tracer release, at 45°.
  // The source is a decimated cloud, so nearby points are distance-weighted.
  const buckets=Array.from({length:BINS*BINS},()=>[]);
  for(let i=0;i<points.length;i+=3){
    const [s,z,n]=project(points,i);
    if(Math.abs(n)>12||Math.abs(s)>HALF||z<0||z>150)continue;
    const x=clamp(Math.floor((s+HALF)/BIN),0,BINS-1),y=clamp(Math.floor(z/BIN),0,BINS-1);
    buckets[x+BINS*y].push({s,z,n,id:i/3});
  }
  const ids=new Int32Array(N*N*NEIGHBORS).fill(-1),weights=new Float32Array(ids.length);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const s=(x+.5)/N*150-HALF,z=150-(y+.5)/N*150;
    const bx=Math.floor((s+HALF)/BIN),by=Math.floor(z/BIN),near=[];
    for(let j=Math.max(0,by-1);j<=Math.min(BINS-1,by+1);j++)
      for(let i=Math.max(0,bx-1);i<=Math.min(BINS-1,bx+1);i++)
        for(const p of buckets[i+BINS*j]){
          const distance=(s-p.s)**2+(z-p.z)**2+p.n**2;
          if(distance>12**2)continue;
          const k=near.findIndex(n=>distance<n.distance);
          if(k>=0)near.splice(k,0,{id:p.id,distance});
          else if(near.length<NEIGHBORS)near.push({id:p.id,distance});
          if(near.length>NEIGHBORS)near.pop();
        }
    const offset=(x+N*y)*NEIGHBORS;
    near.forEach(({id,distance},k)=>{ids[offset+k]=id;weights[offset+k]=1/(distance+1);});
  }
  return {ids,weights};
}
function canvasState(canvas){
  const small=document.createElement('canvas');small.width=small.height=N;
  const raw=small.getContext('2d');
  return {canvas,small,raw,context:canvas.getContext('2d'),image:raw.createImageData(N,N)};
}
function plotField(panel,map,a,b,blend,scales,table,transparent=false){
  const pixels=panel.image.data,{ids,weights}=map;
  for(let j=0;j<N*N;j++){
    let sum=0,weight=0;
    for(let k=0;k<NEIGHBORS;k++){
      const index=j*NEIGHBORS+k,i=ids[index];
      if(i<0||a[i]===65535||b[i]===65535)continue;
      const w=weights[index];
      sum+=w*((1-blend)*a[i]*scales[0]+blend*b[i]*scales[1]);weight+=w;
    }
    const level=weight?clamp((sum/weight-scales[2])/(scales[3]-scales[2]),0,1):0;
    const rgb=weight?table[Math.round(255*level)]:[15,38,47];
    pixels[j*4]=rgb[0];pixels[j*4+1]=rgb[1];pixels[j*4+2]=rgb[2];
    pixels[j*4+3]=transparent?Math.round(255*level):255;
  }
  panel.raw.putImageData(panel.image,0,0);
  if(transparent)panel.context.clearRect(0,0,panel.canvas.width,panel.canvas.height);
  panel.context.drawImage(panel.small,0,0,panel.canvas.width,panel.canvas.height);
}
function addSvg(parent,tag,attrs,label){
  const node=document.createElementNS(svgNS,tag);
  for(const [name,value] of Object.entries(attrs))node.setAttribute(name,value);
  if(label)node.textContent=label;
  parent.append(node);
  return node;
}

export class MixingReplay {
  constructor(meta,positions,arrowPositions){
    this.meta=meta;
    this.map=gridMap(positions);
    this.speed=canvasState(document.querySelector('#mix-speed'));
    this.tracer=canvasState(document.querySelector('#mix-tracer'));
    this.speedRamp=ramp(speedColors);this.tracerRamp=ramp(tracerColors);
    const arrows=new Map();
    for(let i=0;i<arrowPositions.length;i+=3){
      const [s,z,n]=project(arrowPositions,i);
      if(Math.abs(n)>=12||Math.abs(s)>=68||z<=5||z>=145)continue;
      const bucket=Math.floor((s+75)/15)+10*Math.floor(z/15);
      if(!arrows.has(bucket)||Math.abs(n)<arrows.get(bucket).distance)
        arrows.set(bucket,{i,s,z,distance:Math.abs(n)});
    }
    this.arrows=[...arrows.values()];
    const graph=document.querySelector('#mix-cv-graph');
    const start=meta.frames[0].tracer_time_s,end=meta.frames.at(-1).tracer_time_s;
    this.graphX=t=>37+225*(t-start)/(end-start);
    this.graphY=cv=>10+75*(Math.log10(5000)-Math.log10(clamp(cv*100,1,5000)))/Math.log10(5000);
    for(const v of [1000,100,10,1]){
      const y=this.graphY(v/100);
      addSvg(graph,'line',{x1:37,x2:262,y1:y,y2:y,class:'mix-gridline'});
      addSvg(graph,'text',{x:32,y:y+3,'text-anchor':'end'},v+'%');
    }
    addSvg(graph,'text',{x:37,y:100},'0 s');
    addSvg(graph,'text',{x:262,y:100,'text-anchor':'end'},end.toFixed(2)+' s');
    const samples=meta.frames.map(f=>this.graphX(f.tracer_time_s).toFixed(2)+','+this.graphY(f.metrics.global_cv).toFixed(2));
    addSvg(graph,'polyline',{points:samples.join(' '),class:'mix-curve'});
    this.line=addSvg(graph,'line',{x1:37,x2:37,y1:10,y2:85,class:'mix-graph-cursor'});
    this.dot=addSvg(graph,'circle',{cx:37,cy:10,r:3.5,class:'mix-graph-dot'});
  }
  mark(frame){
    const x=this.graphX(frame.tracer_time_s),y=this.graphY(frame.metrics.global_cv);
    this.line.setAttribute('x1',x);this.line.setAttribute('x2',x);
    this.dot.setAttribute('cx',x);this.dot.setAttribute('cy',y);
  }
  draw(q,speed,vectors,lo,hi,blend,contrast){
    if(blend===0)hi=lo;
    const n=this.meta.point_count,frame=(buffer,i)=>new Uint16Array(buffer,i*n*2,n),a=this.meta.frames[lo],b=this.meta.frames[hi];
    plotField(this.speed,this.map,frame(speed,lo),frame(speed,hi),blend,[this.meta.speed_scale,this.meta.speed_scale,0,6],this.speedRamp);
    plotField(this.tracer,this.map,frame(q,lo),frame(q,hi),blend,[a.q_scale,b.q_scale,contrast ? .8 : 0,contrast ? 1.2 : 2],this.tracerRamp,true);
    const count=this.meta.arrow_count,va=new Int16Array(vectors,lo*count*6,count*3),vb=new Int16Array(vectors,hi*count*6,count*3);
    const {context:ctx,canvas}=this.speed,m=canvas.width/150;
    ctx.beginPath();ctx.lineWidth=1.15;ctx.strokeStyle='#f1fbec';
    for(const {i,s,z} of this.arrows){
      const [ds,dz]=[(va[i]+va[i+1])*(1-blend)+(vb[i]+vb[i+1])*blend,
        SQRT2*(va[i+2]*(1-blend)+vb[i+2]*blend)];
      const magnitude=Math.hypot(ds,dz)*this.meta.vector_scale/SQRT2;
      if(magnitude<.12)continue;
      const ang=Math.atan2(-dz,ds),length=clamp(6+6*magnitude,7,18),x=(s+HALF)*m,y=(150-z)*m;
      const u=x+length*Math.cos(ang),v=y+length*Math.sin(ang);
      ctx.moveTo(x,y);ctx.lineTo(u,v);
      for(const turn of [-.55,.55]){ctx.moveTo(u,v);ctx.lineTo(u-4*Math.cos(ang+turn),v-4*Math.sin(ang+turn));}
    }
    ctx.stroke();
  }
}
