(() => {
  'use strict';
  const canvas = document.getElementById('molecule-canvas');
  const molecule = window.VANSH_MOLECULE;
  if (!canvas || !molecule) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const phone = matchMedia('(max-width: 760px)');
  function describeInteraction() {
    document.querySelector('.molecule-heading .mono').textContent = phone.matches ? 'TAP AN ATOM TO EXPLORE' : 'HOVER TO EXPLORE / CLICK TO PIN';
    canvas.setAttribute('aria-label', phone.matches ? 'Caffeine research map. Tap an atom to pin its neighborhood contours and research card. Swipe horizontally to rotate; swipe vertically to scroll.' : 'Caffeine research map. Hover over an atom to show neighborhood contours and a research card. Click to pin; drag or use arrow keys to rotate.');
  }
  phone.addEventListener('change', describeInteraction);
  describeInteraction();
  const palette = {
    C: {light:'#8f9bad',base:'#394455',dark:'#111827',radius:.43},
    N: {light:'#96c2ff',base:'#456eff',dark:'#173399',radius:.45},
    O: {light:'#ffc8e1',base:'#ef6a9b',dark:'#a72a61',radius:.44},
    H: {light:'#ffffff',base:'#edf3ff',dark:'#a5b5d1',radius:.23}
  };
  let width=0,height=0,yaw=-.26,pitch=.30,paused=reduced.matches,mode='atoms',labels=false;
  let raf=0,last=0,visible=true,dragging=false,previous=null;
  let projected=[];
  function project(atom) {
    const [x,y,z]=atom.position;
    const xx=x*Math.cos(yaw)+z*Math.sin(yaw),zz=-x*Math.sin(yaw)+z*Math.cos(yaw);
    const yy=y*Math.cos(pitch)-zz*Math.sin(pitch),depth=y*Math.sin(pitch)+zz*Math.cos(pitch);
    const perspective=14/(14+depth),scale=Math.min(width/8.6,height/7.5)*(width>=500&&width<620?.84:.92);
    return {x:width*(width>=500?(width<620?.30:.35):.5)+xx*scale*perspective,y:height*.49-yy*scale*perspective,z:depth,r:palette[atom.element].radius*scale*perspective,element:atom.element};
  }
  function drawBond(bond, atoms, target=ctx, style=mode) {
    const a=atoms[bond.from],b=atoms[bond.to],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    if(d<1)return;
    const ux=dx/d,uy=dy/d,nx=-uy,ny=ux;
    const ar=style==='atoms'?a.r*.8:4,br=style==='atoms'?b.r*.8:4;
    const ax=a.x+ux*ar,ay=a.y+uy*ar,bx=b.x-ux*br,by=b.y-uy*br;
    const gradient=target.createLinearGradient(ax,ay,bx,by);
    gradient.addColorStop(0,palette[a.element].base);gradient.addColorStop(.47,'#bcc9e3');gradient.addColorStop(1,palette[b.element].base);
    const offsets=bond.order===2?[-3,3]:[0];
    offsets.forEach(offset=>{
      const x1=ax+nx*offset,y1=ay+ny*offset,x2=bx+nx*offset,y2=by+ny*offset;
      target.lineCap='round';target.strokeStyle=style==='atoms'?'#6c7b9c':gradient;target.lineWidth=style==='atoms'?9:2.4;
      target.beginPath();target.moveTo(x1,y1);target.lineTo(x2,y2);target.stroke();
      if(style==='atoms'){
        target.strokeStyle=gradient;target.lineWidth=6.3;target.beginPath();target.moveTo(x1-ny*.7,y1-nx*.7);target.lineTo(x2-ny*.7,y2-nx*.7);target.stroke();
        target.strokeStyle='#ffffff77';target.lineWidth=1.4;target.beginPath();target.moveTo(x1+nx*1.6,y1+ny*1.6);target.lineTo(x2+nx*1.6,y2+ny*1.6);target.stroke();
      }
    });
  }
  function drawAtom(atom, target=ctx, style=mode, showLabels=labels) {
    const color=palette[atom.element],r=style==='atoms'?atom.r:atom.element==='H'?3.2:7;
    if(style==='atoms'){
      const gradient=target.createRadialGradient(atom.x-r*.32,atom.y-r*.38,r*.03,atom.x+r*.12,atom.y+r*.16,r*1.15);
      gradient.addColorStop(0,color.light);gradient.addColorStop(.38,color.base);gradient.addColorStop(1,color.dark);
      target.fillStyle=gradient;target.beginPath();target.arc(atom.x,atom.y,r,0,Math.PI*2);target.fill();
      target.strokeStyle=atom.element==='H'?'#b7c8e777':'#1929432b';target.lineWidth=.7;target.stroke();
      target.fillStyle='#ffffffb3';target.beginPath();target.ellipse(atom.x-r*.29,atom.y-r*.37,r*.12,r*.065,-.6,0,Math.PI*2);target.fill();
    }else{
      target.fillStyle=color.base;target.beginPath();target.arc(atom.x,atom.y,r,0,Math.PI*2);target.fill();
    }
    if((showLabels||style==='bonds')&&atom.element!=='H'){
      target.font=`500 ${style==='atoms'?Math.max(10,r*.54):12}px 'IBM Plex Mono', monospace`;
      target.textAlign='center';target.textBaseline='middle';target.fillStyle=style==='atoms'?'#ffffff':color.dark;
      if(style==='bonds'){target.fillStyle='#f1f5ff';target.fillRect(atom.x-10,atom.y-9,20,18);target.fillStyle=color.dark;}
      target.fillText(atom.element,atom.x,atom.y+.5);
    }
  }
  function draw() {
    if(!width||!height)return;
    ctx.clearRect(0,0,width,height);
    // A subtle grounded shadow keeps the molecule visually anchored.
    const centerX=width*(width>=500?(width<620?.30:.35):.5);
    const shadow=ctx.createRadialGradient(centerX,height*.87,0,centerX,height*.87,width*.27);
    shadow.addColorStop(0,'#6c83c71a');shadow.addColorStop(1,'#6c83c700');
    ctx.save();ctx.translate(centerX,height*.87);ctx.scale(1,.18);ctx.translate(-centerX,-height*.87);ctx.fillStyle=shadow;ctx.fillRect(0,0,width,height*2);ctx.restore();
    const atoms=molecule.atoms.map(project);
    projected=atoms;
    drawContours(atoms);
    const primitives=[...atoms.map(atom=>({z:atom.z,type:'atom',atom})),...molecule.bonds.map(bond=>({z:(atoms[bond.from].z+atoms[bond.to].z)/2,type:'bond',bond}))].sort((a,b)=>b.z-a.z);
    const local=selectedIndex>=0?neighborhoodOf(selectedIndex):null;
    primitives.forEach(item=>{ctx.globalAlpha=local?(item.type==='atom'?(local.has(atoms.indexOf(item.atom))?1:.55):(local.has(item.bond.from)&&local.has(item.bond.to)?1:.45)):1;item.type==='atom'?drawAtom(item.atom):drawBond(item.bond,atoms);});ctx.globalAlpha=1;
    updateTargets(atoms);
  }
  function resize() {
    const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;canvas.parentElement.dataset.layout=width>=500?'wide':'compact';
    const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();
  }
  function tick(now) {
    raf=0;if(paused||!visible||document.hidden)return;
    if(now-last>32){if(!dragging)yaw+=Math.min(now-last,60)*.00015;draw();last=now;}
    raf=requestAnimationFrame(tick);
  }
  function sync() {
    if(raf)cancelAnimationFrame(raf);raf=0;
    if(!paused&&visible&&!document.hidden){last=performance.now();raf=requestAnimationFrame(tick);}draw();
  }
  const stage=canvas.parentElement;
  let pointerOrigin=null, moved=false, pointerTarget=null;
  stage.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('.molecule-hover-inspector'))return;dragging=true;moved=false;pointerTarget=event.target.closest('.atom-target');pointerOrigin=[event.clientX,event.clientY];previous=pointerOrigin;stage.setPointerCapture(event.pointerId);});
  stage.addEventListener('pointermove',event=>{
    if(!dragging){hoverAtom(event);return;}
    const dx=event.clientX-pointerOrigin[0],dy=event.clientY-pointerOrigin[1];
    // A vertical touch gesture belongs to page scrolling, not molecule rotation.
    if(event.pointerType==='touch'&&!moved&&Math.abs(dy)>6&&Math.abs(dy)>Math.abs(dx)){
      dragging=false;
      if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);
      return;
    }
    if(Math.hypot(dx,dy)>6)moved=true;
    if(!moved)return;
    if(selectedIndex>=0)clearInspection();
    yaw+=(event.clientX-previous[0])*.009;pitch=Math.max(-1.3,Math.min(1.3,pitch+(event.clientY-previous[1])*.009));previous=[event.clientX,event.clientY];draw();
  });
  stage.addEventListener('pointerup',event=>{
    const clicked=dragging&&!moved;dragging=false;
    if(clicked){if(pointerTarget){const i=Number(pointerTarget.dataset.direction);pinAtom(directions[i].atom,pointerTarget,i);}else{const hit=hitAtom(event);if(hit>=0)pinAtom(hit,canvas);}}
  });
  ['pointercancel','lostpointercapture'].forEach(event=>stage.addEventListener(event,()=>{dragging=false;}));
  canvas.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
    if(event.key==='ArrowLeft')yaw-=.12;if(event.key==='ArrowRight')yaw+=.12;if(event.key==='ArrowUp')pitch-=.10;if(event.key==='ArrowDown')pitch+=.10;
    pitch=Math.max(-1.3,Math.min(1.3,pitch));draw();
  });
  const directions=[
    {title:'Molecular learning',short:'Molecular learning',atom:6,color:'#175c75',tint:'#e1f4f5',description:'Predicting how molecules behave across solvents. My work spans solute–solvent interactions, interpretable prediction, and evaluating models across solvent environments.',links:[['DISSOLVR','paper-dissolvr','ICML 2026'],['SC³','paper-sc3','NeurIPS 2026'],['MolMerger','paper-molmerger','JCTC 2024']]},
    {title:'Graph distillation',short:'Graph distillation',atom:2,color:'#315d36',tint:'#edf5da',description:'Compressing graph datasets into smaller structures that can train useful models. Bonsai selects representative computation trees; our position paper examines how graph condensation should be evaluated and redesigned.',links:[['Bonsai','paper-bonsai','ICLR 2025'],['Graph Condensation Needs a Reset','paper-condensation','ICML 2026 · Spotlight']]},
    {title:'Similarity search',short:'Similarity search',atom:8,color:'#284fc8',tint:'#e5ebff',description:'Finding nearest neighbors while doing less distance computation. Panorama uses spectral structure and incremental distance verification to make high-dimensional search more efficient.',links:[['Panorama','paper-panorama','Fast-Track Nearest Neighbors']]},
    {title:'Reasoning stability',short:'Reasoning stability',atom:3,color:'#6d3b88',tint:'#f0e8f8',description:'Studying how reliably language models reason across repeated attempts at a task. ReasonBENCH examines variation in reasoning traces and the answers they produce.',links:[['ReasonBENCH','paper-reasonbench','EIML · ICML 2026']]},
    {title:'Computer-use agents',short:'Computer-use agents',atom:5,color:'#224ca0',tint:'#e1ecff',description:'Building ramAIn: agents that operate across web portals and legacy systems. The focus is executing work through the applications a team already uses.',links:[['ramAIn','https://ramain.ai','Co-founder & CTO · YC W26'],['What I’m building','#building','Computer use & orchestration']]},
    {title:'Unlearning & neurosymbolic AI',short:'Unlearning',atom:9,color:'#845046',tint:'#f6e9e2',description:'Research on machine unlearning and neurosymbolic AI at Carnegie Mellon, working with Pradeep Ravikumar. This is another strand of my work on how learning systems retain information and reason.',links:[['Research experience','content/background.html','Carnegie Mellon']]} 
  ];
  const adjacency=molecule.atoms.map(()=>[]);
  molecule.bonds.forEach(b=>{adjacency[b.from].push(b.to);adjacency[b.to].push(b.from);});
  function ownerOf(index){
    let frontier=[index],seen=new Set(frontier);
    while(frontier.length){
      const owner=directions.findIndex(d=>frontier.includes(d.atom));if(owner>=0)return owner;
      const next=[];frontier.forEach(i=>adjacency[i].forEach(j=>{if(!seen.has(j)){seen.add(j);next.push(j);}}));frontier=next;
    }
    return 0;
  }
  const targets=[...document.querySelectorAll('.atom-target')];
  const inspector=document.querySelector('.molecule-hover-inspector');
  const previews=[
    'Solubility prediction, interpretable models, and solute–solvent interactions.',
    'Representative computation trees and a rethink of graph condensation.',
    'Nearest-neighbor search through spectral structure and incremental distance checks.',
    'Measuring how reasoning traces and answers vary across repeated attempts.',
    'At ramAIn, I build agents that execute work across web portals and legacy systems.',
    'Machine unlearning and neurosymbolic AI at Carnegie Mellon.'
  ];
  let selectedIndex=-1,selectedDirection=0,wasPaused=false,pinned=false,hideTimer=0;
  function updateTargets(atoms){
    targets.forEach((button,i)=>{const atom=atoms[directions[i].atom];button.style.left=`${atom.x}px`;button.style.top=`${atom.y}px`;button.style.zIndex=String(30-Math.round(atom.z));});
    if(selectedIndex>=0){const a=atoms[selectedIndex];ctx.strokeStyle=directions[selectedDirection].color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(a.x,a.y,a.r+7,0,Math.PI*2);ctx.stroke();positionInspector();}
  }
  function hitAtom(event){
    const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    const candidates=projected.map((a,i)=>({a,i,d:Math.hypot(a.x-x,a.y-y)})).filter(v=>v.d<Math.max(v.a.r+4,12)).sort((a,b)=>a.a.z-b.a.z||a.d-b.d);
    return candidates[0]?.i??-1;
  }
  function neighborhoodOf(index){
    const local=new Set([index,...adjacency[index]]);
    [...local].forEach(i=>adjacency[i].forEach(j=>local.add(j)));
    return local;
  }
  // Smooth contour levels around the selected graph neighborhood. These are
  // a navigation illustration derived from atom positions, not physical energy.
  function drawContours(atoms){
    if(selectedIndex<0)return;
    const local=neighborhoodOf(selectedIndex),color=directions[selectedDirection].color;
    const sources=[...local].map(i=>({x:atoms[i].x,y:atoms[i].y,sigma:Math.max(24,atoms[i].r*1.75),weight:i===selectedIndex?1.5:adjacency[selectedIndex].includes(i)?1:.55}));
    sources.forEach(s=>{const g=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,s.sigma*3);g.addColorStop(0,`${color}17`);g.addColorStop(.5,`${color}09`);g.addColorStop(1,`${color}00`);ctx.fillStyle=g;ctx.fillRect(s.x-s.sigma*3,s.y-s.sigma*3,s.sigma*6,s.sigma*6);});
    const step=6,cols=Math.ceil(width/step),rows=Math.ceil(height/step),values=new Float32Array((cols+1)*(rows+1));
    for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){let v=0;sources.forEach(s=>{const dx=x*step-s.x,dy=y*step-s.y;v+=s.weight*Math.exp(-(dx*dx+dy*dy)/(2*s.sigma*s.sigma));});values[y*(cols+1)+x]=v;}
    [.13,.25,.43,.67,.95,1.3,1.7,2.1].forEach((level,li)=>{
      ctx.beginPath();
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        const corners=[[x*step,y*step],[(x+1)*step,y*step],[(x+1)*step,(y+1)*step],[x*step,(y+1)*step]];
        const v=[values[y*(cols+1)+x],values[y*(cols+1)+x+1],values[(y+1)*(cols+1)+x+1],values[(y+1)*(cols+1)+x]],crossings=[];
        for(let e=0;e<4;e++){const next=(e+1)%4;if((v[e]>=level)===(v[next]>=level))continue;const t=(level-v[e])/(v[next]-v[e]);crossings.push([corners[e][0]+t*(corners[next][0]-corners[e][0]),corners[e][1]+t*(corners[next][1]-corners[e][1])]);}
        for(let k=0;k+1<crossings.length;k+=2){ctx.moveTo(...crossings[k]);ctx.lineTo(...crossings[k+1]);}
      }
      ctx.strokeStyle=`${color}${li<3?'80':'a0'}`;ctx.lineWidth=li<3?.8:1;ctx.stroke();
    });
  }

  function positionInspector(){
    if(inspector.hidden||selectedIndex<0)return;
    stage.classList.add('has-inspection');
    if(width<500)return;
    const source=projected[selectedIndex],h=inspector.offsetHeight;
    inspector.style.left=`${width-inspector.offsetWidth-12}px`;
    inspector.style.top=`${Math.max(10,Math.min(source.y-h*.5,Math.max(10,height-h-10)))}px`;
  }
  function populateDirection(){
    const direction=directions[selectedDirection];inspector.style.setProperty('--thread-color',direction.color);inspector.style.setProperty('--thread-tint',direction.tint);
    document.getElementById('molecule-thread-title').textContent=direction.title;
    document.getElementById('molecule-thread-eyebrow').textContent=pinned?'PINNED':'PREVIEW';
    document.getElementById('molecule-thread-description').textContent=previews[selectedDirection];
    document.getElementById('molecule-neighborhood').textContent=`${molecule.atoms[selectedIndex].element} · ${adjacency[selectedIndex].length} neighbors`;
    const links=document.getElementById('molecule-thread-links');links.replaceChildren();
    direction.links.forEach(([title,destination,meta])=>{
      const a=document.createElement('a'),name=document.createElement('span'),small=document.createElement('small'),arrow=document.createElement('b');
      a.href=destination.startsWith('paper-')?`#${destination}`:destination;
      if(destination.startsWith('paper-'))a.dataset.openPaper=destination;
      if(destination.startsWith('https:')){a.target='_blank';a.rel='noopener noreferrer';}
      name.textContent=title;small.textContent=meta;name.append(small);arrow.textContent='↗';a.append(name,arrow);links.append(a);
      a.addEventListener('click',clearInspection);
    });syncPin();
  }
  function syncPin(){
    document.getElementById('molecule-pin').textContent=pinned?'Unpin':'Pin this view';
    document.getElementById('molecule-pin').setAttribute('aria-pressed',String(pinned));
    document.getElementById('molecule-thread-eyebrow').textContent=pinned?'PINNED':'PREVIEW';
  }
  function previewAtom(index,directionIndex=ownerOf(index)){
    clearTimeout(hideTimer);
    if(index===selectedIndex&&directionIndex===selectedDirection)return;
    if(selectedIndex<0){wasPaused=paused;paused=true;}
    selectedIndex=index;selectedDirection=directionIndex;inspector.hidden=false;
    populateDirection();sync();positionInspector();
  }
  function pinAtom(index,trigger,directionIndex=ownerOf(index)){
    if(pinned&&index===selectedIndex){clearInspection();return;}
    previewAtom(index,directionIndex);pinned=true;syncPin();
  }
  function clearInspection(){
    if(selectedIndex<0)return;
    clearTimeout(hideTimer);inspector.hidden=true;stage.classList.remove('has-inspection');selectedIndex=-1;pinned=false;paused=wasPaused;sync();
  }
  function scheduleHide(){
    clearTimeout(hideTimer);
    if(!pinned)hideTimer=setTimeout(clearInspection,180);
  }
  function hoverAtom(event){
    if(event.pointerType==='touch'||pinned)return;
    if(event.target.closest('.molecule-hover-inspector')){clearTimeout(hideTimer);return;}
    const button=event.target.closest('.atom-target'),hit=button?directions[Number(button.dataset.direction)].atom:hitAtom(event);
    canvas.style.cursor=hit>=0?'pointer':'grab';
    if(hit>=0)previewAtom(hit,button?Number(button.dataset.direction):ownerOf(hit));else scheduleHide();
  }
  stage.addEventListener('pointerover',event=>{if(!dragging)hoverAtom(event);});
  stage.addEventListener('mousemove',event=>{if(!dragging)hoverAtom(event);});
  stage.addEventListener('pointerleave',scheduleHide);
  inspector.addEventListener('pointerenter',()=>clearTimeout(hideTimer));
  inspector.addEventListener('pointerleave',scheduleHide);
  inspector.addEventListener('focusin',()=>clearTimeout(hideTimer));
  inspector.addEventListener('focusout',scheduleHide);
  targets.forEach((button,i)=>{
    button.addEventListener('mouseenter',()=>{if(!pinned)previewAtom(directions[i].atom,i);});
    button.addEventListener('focus',()=>{if(!pinned)previewAtom(directions[i].atom,i);});
    button.addEventListener('blur',scheduleHide);
    button.addEventListener('click',event=>{if(event.detail===0)pinAtom(directions[i].atom,button,i);});
  });
  inspector.querySelector('.molecule-hover-close').addEventListener('click',clearInspection);
  document.getElementById('molecule-pin').addEventListener('click',()=>{pinned=!pinned;syncPin();if(!pinned&&!inspector.matches(':hover')&&!inspector.contains(document.activeElement))scheduleHide();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&selectedIndex>=0){event.preventDefault();clearInspection();}});
  new ResizeObserver(()=>{if(!inspector.hidden)positionInspector();}).observe(inspector);
  window.addEventListener('resize',()=>{if(!inspector.hidden)positionInspector();});

  reduced.addEventListener('change',event=>{if(selectedIndex>=0)wasPaused=event.matches;paused=selectedIndex>=0||event.matches;sync();});document.addEventListener('visibilitychange',sync);
  new ResizeObserver(resize).observe(canvas);new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();}).observe(canvas);resize();sync();
})();
