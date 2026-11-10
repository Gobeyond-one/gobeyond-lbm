import * as THREE from 'three';

/** Fixed Eulerian volume samples of saved CFD fields. No particle advection. */
export class FieldCloud {
  constructor(view,meta,positions,arrowPositions){
    this.meta=meta;this.group=new THREE.Group();view.scene.add(this.group);
    const n=meta.point_count,p=new Float32Array(positions.length);
    for(let i=0;i<p.length;i+=3){p[i]=positions[i]/75;p[i+1]=(positions[i+2]-75)/75;p[i+2]=-positions[i+1]/75;}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(p,3));
    geometry.setAttribute('aField0',new THREE.BufferAttribute(new Uint16Array(n),1).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('aField1',new THREE.BufferAttribute(new Uint16Array(n),1).setUsage(THREE.DynamicDrawUsage));
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,uniforms:{uBlend:{value:0},uScale:{value:new THREE.Vector2(1,1)},uConcentration:{value:false},uDeviation:{value:false},uClip:{value:false},uOpacity:{value:.26},uSpeedMax:{value:3},uSize:{value:4.4*Math.min(devicePixelRatio,1.7)},uCold:{value:new THREE.Color('#286b99')},uMiddle:{value:new THREE.Color('#45c8ba')},uHot:{value:new THREE.Color('#f9a34e')}},
      vertexShader:`attribute float aField0;attribute float aField1;uniform float uBlend;uniform vec2 uScale;uniform float uSize;varying float vValue;varying float vValid;varying float vZ;void main(){vValid=(aField0<65534.5&&aField1<65534.5)?1.:0.;vValue=mix(aField0*uScale.x,aField1*uScale.y,uBlend);vZ=position.z;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=uSize;}`,
      fragmentShader:`uniform bool uConcentration;uniform bool uDeviation;uniform bool uClip;uniform float uOpacity;uniform float uSpeedMax;uniform vec3 uCold;uniform vec3 uMiddle;uniform vec3 uHot;varying float vValue;varying float vValid;varying float vZ;void main(){if(vValid<.5||(uClip&&vZ>0.))discard;float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;float t;float alpha;if(uConcentration){float deviation=abs(vValue-1.);if((uDeviation&&deviation<=.05)||(!uDeviation&&vValue<.000001))discard;t=clamp(vValue/2.,0.,1.);alpha=uOpacity*(.25+min(1.5,deviation*1.8));}else{t=clamp(vValue/uSpeedMax,0.,1.);alpha=uOpacity*.8;}vec3 color=t<.5?mix(uCold,uMiddle,t*2.):mix(uMiddle,uHot,(t-.5)*2.);gl_FragColor=vec4(color,alpha*(1.-smoothstep(.16,.5,d)));
      #include <colorspace_fragment>
      }`});
    this.points=new THREE.Points(geometry,this.material);this.points.frustumCulled=false;this.points.renderOrder=2;this.group.add(this.points);
    this.arrowPositions=arrowPositions;this.arrowGeometry=new THREE.BufferGeometry();this.arrowGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(meta.arrow_count*18),3).setUsage(THREE.DynamicDrawUsage));
    this.arrows=new THREE.LineSegments(this.arrowGeometry,new THREE.LineBasicMaterial({color:'#c7e9db',transparent:true,opacity:.65,depthWrite:false}));this.arrows.frustumCulled=false;this.arrows.renderOrder=3;this.group.add(this.arrows);
    this.release=new THREE.Mesh(new THREE.SphereGeometry(.1,22,14),new THREE.MeshBasicMaterial({color:'#ffd1a0',transparent:true,opacity:.38,wireframe:true,depthWrite:false}));this.release.position.set(.6/Math.sqrt(2),.6,-.6/Math.sqrt(2));this.release.visible=false;this.group.add(this.release);
    this.boundKey='';this.cutaway=false;this.showArrows=true;
  }
  setMode(concentration){
    const u=this.material.uniforms;u.uConcentration.value=concentration;
    u.uCold.value.set(concentration?'#198bb4':'#286b99');u.uMiddle.value.set(concentration?'#c3e9d9':'#45c8ba');u.uHot.value.set(concentration?'#ff8649':'#f9a34e');
    this.concentration=concentration;this.boundKey='';
  }
  setStyle({opacity,cutaway,arrows,deviation,speedMax}){this.material.uniforms.uOpacity.value=opacity;this.material.uniforms.uClip.value=cutaway;this.material.uniforms.uDeviation.value=deviation;this.material.uniforms.uSpeedMax.value=speedMax;this.cutaway=cutaway;this.showArrows=arrows;this.arrows.visible=arrows;}
  update(buffer,vectors,lo,hi,blend){
    const m=this.meta,n=m.point_count,key=`${this.concentration}:${lo}:${hi}`;
    if(key!==this.boundKey){const a=this.points.geometry.attributes.aField0,b=this.points.geometry.attributes.aField1;a.array.set(new Uint16Array(buffer,lo*n*2,n));b.array.set(new Uint16Array(buffer,hi*n*2,n));a.needsUpdate=b.needsUpdate=true;this.boundKey=key;}
    this.material.uniforms.uBlend.value=blend;this.material.uniforms.uScale.value.set(this.concentration?m.frames[lo].q_scale:m.speed_scale,this.concentration?m.frames[hi].q_scale:m.speed_scale);
    this.release.visible=this.concentration&&lo<4;
    if(!this.arrows.visible)return;
    const count=m.arrow_count,va=new Int16Array(vectors,lo*count*6,count*3),vb=new Int16Array(vectors,hi*count*6,count*3),out=this.arrowGeometry.attributes.position.array;
    for(let j=0;j<count;j++){
      const i=j*3,x=this.arrowPositions[i]/75,y=(this.arrowPositions[i+2]-75)/75,z=-this.arrowPositions[i+1]/75;
      let vx=(va[i]*(1-blend)+vb[i]*blend)*m.vector_scale,vy=(va[i+2]*(1-blend)+vb[i+2]*blend)*m.vector_scale,vz=-(va[i+1]*(1-blend)+vb[i+1]*blend)*m.vector_scale;
      if(this.cutaway&&z>0)vx=vy=vz=0;
      const speed=Math.hypot(vx,vy,vz),length=Math.min(.2,speed*.06),s=length/(speed||1),tx=x+vx*s,ty=y+vy*s,tz=z+vz*s,h=Math.min(.023,length*.3),back=h/(speed||1),side=Math.hypot(vx,vz),sx=side?vz/side:1,sz=side?-vx/side:0;
      out.set([x,y,z,tx,ty,tz,tx,ty,tz,tx-vx*back+sx*h*.5,ty-vy*back,tz-vz*back+sz*h*.5,tx,ty,tz,tx-vx*back-sx*h*.5,ty-vy*back,tz-vz*back-sz*h*.5],j*18);
    }
    this.arrowGeometry.attributes.position.needsUpdate=true;
  }
}
