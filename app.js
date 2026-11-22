/* Air Strings Mobile — open-source browser experiment; camera frames stay in this page. */
const $=id=>document.getElementById(id);
const canvas=$('scene'),ctx=canvas.getContext('2d',{alpha:false}),video=$('camera');
const ui={welcome:$('welcome'),start:$('start'),demo:$('demo'),error:$('error'),status:$('status'),hands:$('hands'),fps:$('fps'),mode:$('mode'),controls:$('controls'),showCam:$('showCam'),showPoints:$('showPoints'),volume:$('volume'),stop:$('stop'),shot:$('shot'),flip:$('flip'),share:$('share'),quality:$('quality'),secureHint:$('secureHint'),help:$('help'),stringCount:$('stringCount'),undoString:$('undoString'),clearStrings:$('clearStrings'),drumEnabled:$('drumEnabled'),drumStatus:$('drumStatus'),strumEnabled:$('strumEnabled'),strumStatus:$('strumStatus')};
const TIP=[4,8,12,16,20];
const HUE=[43,168,202,315,62,124,270,10,189,339];
const SCALE=[['C4',261.63],['D4',293.66],['E4',329.63],['G4',392],['A4',440],['C5',523.25],['D5',587.33],['E5',659.25],['G5',783.99],['A5',880]];
const MAX_STRINGS=10,HOLD_MS=1000;
const strings=[]; 
let mode='idle',facing='user',stream=null,model=null,audio=null,hands=[],smoothed=[],particles=[],oldHands=[],interval=65,lastInfer=0,lastVideoTime=-1,lastFrame=0,frameN=0,fpsFrom=performance.now(),raf=0,cover=null,demoMouse={x:.7,y:.52,active:false};
const oldTips=[new Map(),new Map()];
let candidate=null,lastCreatedPose=null,lastLandmarkAt=0;
const drumStates=[null,null];let drumLastInference=-1,drumHits=[];
const strumStates=[null,null],strumQueue=[],strumWaves=[];let strumLastInference=-1;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),mix=(a,b,t)=>a+(b-a)*t;
function resize(){const d=Math.min(devicePixelRatio||1,innerWidth<900?1.5:2),w=innerWidth,h=$('stage').clientHeight||innerHeight;canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);ctx.setTransform(d,0,0,d,0,0);return {w,h}}let size=resize();addEventListener('resize',()=>{size=resize();smoothed=[];candidate=null;resetGesture()});
if(!isSecureContext)ui.secureHint.textContent='手機鏡頭需要 HTTPS 安全網址，請勿直接開啟本機檔案。';
function resetGesture(){oldTips.forEach(x=>x.clear());drumStates.fill(null);drumLastInference=-1;strumStates.fill(null);strumLastInference=-1}
function rectCover(w,h,vw,vh){const z=Math.max(w/vw,h/vh);return {x:(w-vw*z)/2,y:(h-vh*z)/2,w:vw*z,h:vh*z}}
function mapPoint(p,r){return {x:r.x+(facing==='user'?1-p.x:p.x)*r.w,y:r.y+p.y*r.h}}
function smooth(raw){if(raw.length===2&&smoothed.length===2){const same=dist(raw[0][9],smoothed[0][9])+dist(raw[1][9],smoothed[1][9]),flip=dist(raw[0][9],smoothed[1][9])+dist(raw[1][9],smoothed[0][9]);if(flip<same)raw.reverse()}else if(raw.length===2)raw.sort((a,b)=>a[9].x-b[9].x);
 const out=raw.map((hand,k)=>hand.map((p,i)=>smoothed[k]&&smoothed[k][i]?{x:mix(smoothed[k][i].x,p.x,.65),y:mix(smoothed[k][i].y,p.y,.65)}:p));smoothed=out;return out}
async function makeModel(){ui.status.textContent='下載手部辨識模型…';const m=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs');const fs=await m.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm');const o={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.45,minTrackingConfidence:.5};try{return await m.HandLandmarker.createFromOptions(fs,o)}catch(e){console.warn('GPU fallback',e);o.baseOptions.delegate='CPU';return await m.HandLandmarker.createFromOptions(fs,o)}}
async function enableSound(){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('不支援 Web Audio');audio=audio||new AC();if(audio.state!=='running')await audio.resume()}
function beep(freq,len){if(!audio||audio.state!=='running')return;const t=audio.currentTime,level=Math.max(.001,Number(ui.volume.value)/100*.16),out=audio.createGain(),filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=clamp(1800+len*2,1900,5500);filter.connect(out);out.connect(audio.destination);out.gain.setValueAtTime(.0001,t);out.gain.exponentialRampToValueAtTime(level,t+.012);out.gain.exponentialRampToValueAtTime(.0001,t+.8);
for(const [mul,shape,vol] of [[1,'sine',.85],[2,'triangle',.16]]){const o=audio.createOscillator(),g=audio.createGain();o.type=shape;o.frequency.setValueAtTime(freq*mul,t);g.gain.value=vol;o.connect(g).connect(filter);o.start(t);o.stop(t+.85);o.onended=()=>{o.disconnect();g.disconnect()}}setTimeout(()=>{filter.disconnect();out.disconnect()},1100)}

function playDrum(frequency){
 if(!audio||audio.state!=='running')return;
 const t=audio.currentTime,v=clamp(Number(ui.volume.value)/100,0,1),freq=clamp(frequency,60,280);
 // A pitch-bending drum membrane and a short noisy beater impact.
 const osc=audio.createOscillator(),out=audio.createGain();
 osc.type='sine';
 osc.frequency.setValueAtTime(freq*1.55,t);
 osc.frequency.exponentialRampToValueAtTime(freq,t+.08);
 osc.frequency.exponentialRampToValueAtTime(Math.max(38,freq*.84),t+.34);
 out.gain.setValueAtTime(.0001,t);
 out.gain.exponentialRampToValueAtTime(Math.max(.0002,v*.26),t+.006);
 out.gain.exponentialRampToValueAtTime(.0001,t+.43);
 osc.connect(out);out.connect(audio.destination);osc.start(t);osc.stop(t+.46);
 osc.onended=()=>{osc.disconnect();out.disconnect()};
 const len=Math.ceil(audio.sampleRate*.075),buf=audio.createBuffer(1,len,audio.sampleRate),data=buf.getChannelData(0);
 for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(1-i/len);
 const noise=audio.createBufferSource(),flt=audio.createBiquadFilter(),click=audio.createGain();
 noise.buffer=buf;flt.type='bandpass';flt.frequency.value=clamp(freq*8,550,3600);flt.Q.value=.8;
 click.gain.setValueAtTime(Math.max(.0002,v*.065),t);
 click.gain.exponentialRampToValueAtTime(.0001,t+.085);
 noise.connect(flt);flt.connect(click);click.connect(audio.destination);noise.start(t);noise.stop(t+.085);
 noise.onended=()=>{noise.disconnect();flt.disconnect();click.disconnect()};
}
function drumPitch(y){
 const height=clamp(1-y/size.h,0,1);
 return 65*Math.pow(3.7,height);
}
function fireDrum(p,t){
 const freq=drumPitch(p.y),height=1-clamp(p.y/size.h,0,1);
 const label=height>.67?'高音鼓':height>.34?'中音鼓':'低音鼓';
 playDrum(freq);
 burst(p,24+height*38);burst(p,24+height*38);
 drumHits.push({x:p.x,y:p.y,t,hue:24+height*38,label});
 if(drumHits.length>14)drumHits.shift();
 ui.drumStatus.textContent='🥁 '+label+' · '+Math.round(freq)+' Hz';
 ui.status.textContent=label+'！';
 if(navigator.vibrate)navigator.vibrate(16);
 return {frequency:freq,label};
}
function isFist(h){
 if(!h||!h[17]||!h[20])return false;
 const width=dist(h[5],h[17]);if(width<12)return false;
 let curled=0;
 for(const [tip,mcp] of [[8,5],[12,9],[16,13],[20,17]]){
  if(dist(h[tip],h[mcp])<width*.95 && dist(h[tip],h[0])<dist(h[mcp],h[0])*1.65)curled++;
 }
 return curled>=3;
}
function isOpenPalm(h){
 if(!h||isFist(h))return false;
 const width=dist(h[5],h[17]);if(width<12)return false;
 let extended=0;
 for(const [tip,pip,mcp] of [[8,6,5],[12,10,9],[16,14,13],[20,18,17]]){
  if(dist(h[tip],h[mcp])>width*.72 && dist(h[tip],h[0])>dist(h[pip],h[0])*1.17)extended++;
 }
 return extended>=3;
}
function palmCenter(h){
 return {x:(h[5].x+h[9].x+h[13].x+h[17].x)/4,y:(h[5].y+h[9].y+h[13].y+h[17].y)/4};
}
function queuePalmStrum(direction,t,point){
 if(!strings.length){ui.strumStatus.textContent='🖐 請先拉好琴弦，再揮掌演奏';return false;}
 // Rightward palm = upper-to-lower, leftward palm = lower-to-upper.
 const ordered=[...strings].sort((a,b)=>((a.a.y+a.b.y)-(b.a.y+b.b.y)) || a.i-b.i);
 if(direction<0)ordered.reverse();
 for(let i=0;i<ordered.length;i++)strumQueue.push({id:ordered[i].id,at:t+i*62});
 strumWaves.push({t,point:{...point},direction});
 if(strumWaves.length>8)strumWaves.shift();
 const label=direction>0?'→ 右揮：由上往下撥':'← 左揮：由下往上撥';
 ui.strumStatus.textContent='🖐 '+label+' · '+ordered.length+' 條';
 ui.status.textContent=label;
 return true;
}
function processPalmStrums(t){
 if(mode!=='camera'||!ui.strumEnabled.checked)return;
 // Only evaluate new camera inference results, never repeat on render frames.
 if(lastLandmarkAt===strumLastInference)return;
 strumLastInference=lastLandmarkAt;
 // Do not confuse two index fingers holding a new line with strumming.
 if(candidate){strumStates.fill(null);return;}
 for(let i=0;i<2;i++){
  const h=hands[i];
  if(!h||!isOpenPalm(h)){strumStates[i]=null;continue;}
  const p=palmCenter(h),st=strumStates[i];
  if(!st){strumStates[i]={anchor:p,p,t,fired:false,direction:0,quietSince:0};continue;}
  const dt=t-st.t,dx=p.x-st.p.x,dy=p.y-st.p.y;
  if(dt<=0||dt>280||Math.hypot(dx,dy)>Math.max(280,size.w*.72)){
   strumStates[i]={anchor:p,p,t,fired:false,direction:0,quietSince:0};continue;
  }
  const triggerDist=Math.max(52,size.w*.125);
  if(Math.abs(dx)<3){
   if(!st.quietSince)st.quietSince=t;
   if(t-st.quietSince>230){st.anchor=p;st.fired=false;}
  }else{
   st.quietSince=0;
   if(st.fired && Math.sign(dx)!==st.direction && Math.abs(dx)>Math.max(11,size.w*.025)){
    st.anchor={...st.p};st.fired=false;
   }
  }
  const totalDx=p.x-st.anchor.x,totalDy=p.y-st.anchor.y;
  const velocity=Math.abs(dx)/dt*1000;
  if(!st.fired && strings.length && Math.abs(totalDx)>=triggerDist &&
      Math.abs(totalDx)>Math.abs(totalDy)*1.35 &&
      Math.abs(dx)>Math.max(5,size.w*.012) &&
      velocity>Math.max(115,size.w*.3)){
    const direction=Math.sign(totalDx);
    if(queuePalmStrum(direction,t,p)){st.fired=true;st.direction=direction;}
  }
  st.p=p;st.t=t;
 }
}
function runStrumQueue(t){
 if(!strumQueue.length)return;
 for(let i=strumQueue.length-1;i>=0;i--){
  const q=strumQueue[i];if(q.at>t)continue;
  strumQueue.splice(i,1);
  const s=strings.find(x=>x.id===q.id);
  if(s && s.a){pluck(s,t,{x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2});}
 }
}
function drawStrumWaves(t){
 strumWaves=strumWaves.filter(w=>t-w.t<560);
 for(const w of strumWaves){
  const k=clamp((t-w.t)/560,0,1),x=w.point.x,y=w.point.y;
  ctx.save();ctx.globalCompositeOperation='screen';
  ctx.shadowColor='#aeffed';ctx.shadowBlur=18;
  ctx.strokeStyle='rgba(174,255,231,'+(1-k)+')';ctx.lineWidth=5*(1-k)+1;
  ctx.beginPath();ctx.arc(x,y,24+94*k,0,Math.PI*2);ctx.stroke();
  ctx.restore();
 }
}
function indexExtended(h){
 if(!h||isFist(h))return false;
 const width=dist(h[5],h[17]);if(width<12)return false;
 return dist(h[8],h[5])>width*.85 && dist(h[8],h[0])>dist(h[6],h[0])*1.08;
}
function processDrumHands(t){
 if(mode!=='camera'||!ui.drumEnabled.checked)return;
 if(lastLandmarkAt===drumLastInference)return;
 drumLastInference=lastLandmarkAt;
 for(let i=0;i<2;i++){
  const h=hands[i],isClosed=isFist(h);
  if(!h||!isClosed){drumStates[i]=null;continue;}
  const pos={x:(h[0].x+h[9].x)/2,y:(h[0].y+h[9].y)/2};
  const palmWidth=dist(h[5],h[17]);
  const st=drumStates[i];
  if(!st){drumStates[i]={p:pos,w:palmWidth,t,ready:true,lastHit:-1000};continue;}
  const dt=clamp(t-st.t,1,300),dy=pos.y-st.p.y;
  const speed=dy/dt*1000,depthChange=palmWidth/Math.max(10,st.w);
  // Downward strike or thrust toward camera; must start a fresh attack.
  const downStrike=dy>8 && speed>Math.max(190,size.h*.28);
  const forwardStrike=depthChange>1.18 && dt<220;
  if(st.ready && t-st.lastHit>320 && (downStrike||forwardStrike)){
   fireDrum(pos,t);st.ready=false;st.lastHit=t;
  }
  // Lift hand or pause to re-arm; remaining clenched alone cannot repeatedly sound.
  if(!st.ready && (dy< -Math.max(7,size.h*.010)||(Math.abs(dy)<3 && t-st.lastHit>270)))st.ready=true;
  st.p=pos;st.w=palmWidth;st.t=t;
 }
}
function drawDrumHits(t){
 drumHits=drumHits.filter(p=>t-p.t<520);
 for(const p of drumHits){
  const k=(t-p.t)/520,r=18+105*k;
  ctx.save();ctx.globalCompositeOperation='screen';ctx.strokeStyle='hsla('+p.hue+',95%,69%,'+(1-k)+')';
  ctx.lineWidth=5*(1-k)+1;ctx.shadowColor='#ffb967';ctx.shadowBlur=13;
  ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();
  ctx.globalCompositeOperation='source-over';ctx.font='bold 18px system-ui';
  ctx.fillStyle='rgba(255,231,181,'+(1-k)+')';ctx.textAlign='center';
  ctx.fillText('🥁 '+p.label,p.x,p.y-25-k*25);ctx.restore();
 }
}

function burst(p,hue){for(let i=0;i<12;i++){const a=Math.random()*Math.PI*2,z=1+Math.random()*5;particles.push({x:p.x,y:p.y,vx:Math.cos(a)*z,vy:Math.sin(a)*z,life:1,hue})}if(particles.length>230)particles.splice(0,particles.length-230)}
function pluck(s,t,p){if(!s?.a||t-s.lastHit<160)return false;s.lastHit=t;s.amp=clamp(s.len*.035,10,28);burst(p||{x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2},s.hue);beep(s.freq,s.len);return true}
function started(m){cancelAnimationFrame(raf);strings.length=0;candidate=null;lastCreatedPose=null;drumHits=[];strumQueue.length=0;strumWaves.length=0;resetGesture();ui.strumStatus.textContent='🖐 右揮由上往下，左揮由下往上';refreshStringUI();ui.drumStatus.textContent='🥁 握拳向下敲，位置越高鼓聲越高';mode=m;ui.welcome.classList.add('hidden');ui.controls.classList.remove('hidden');ui.flip.style.display=m==='camera'?'':'none';ui.mode.textContent=m==='camera'?'即時鏡頭':'展示';ui.status.textContent=m==='camera'?'追蹤中':'展示中';lastFrame=performance.now();raf=requestAnimationFrame(tick)}
function cleanup(){cancelAnimationFrame(raf);candidate=null;lastCreatedPose=null;strings.length=0;drumHits=[];strumQueue.length=0;strumWaves.length=0;resetGesture();refreshStringUI();mode='idle';if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;model=null;hands=[];smoothed=[];resetGesture();ui.welcome.classList.remove('hidden');ui.controls.classList.add('hidden');ui.status.textContent='尚未啟動';ui.error.textContent=''}
ui.start.addEventListener('click',async()=>{ui.error.textContent='';ui.start.disabled=true;ui.start.textContent='正在啟動…';try{if(!navigator.mediaDevices?.getUserMedia)throw Error('無法取得相機：請使用 HTTPS 網址');await enableSound();stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30},facingMode:facing}});video.srcObject=stream;await video.play();model=await makeModel();lastVideoTime=-1;started('camera')}catch(e){console.error(e);ui.error.textContent='啟動失敗：'+(e.message||e)+'。請檢查相機授權、網路或改用展示模式。';if(stream)stream.getTracks().forEach(t=>t.stop());stream=null}finally{ui.start.disabled=false;ui.start.textContent='📷 開啟鏡頭，開始玩'}});
ui.demo.addEventListener('click',async()=>{try{await enableSound()}catch(e){console.warn(e)}started('demo')});

function refreshStringUI(){
 ui.stringCount.textContent='琴弦 '+strings.length+'/'+MAX_STRINGS;
 ui.undoString.disabled=strings.length===0;ui.clearStrings.disabled=strings.length===0;
 ui.help.textContent=strings.length?'已固定 '+strings.length+' 條 · 張掌右揮上→下、左揮下→上 · 握拳敲鼓':'雙食指拉弦穩住 1 秒 · 張掌左右掃弦 · 握拳敲鼓';
}
ui.undoString.addEventListener('click',()=>{if(!strings.length)return;strings.pop();candidate=null;lastCreatedPose=null;resetGesture();refreshStringUI();ui.status.textContent='已撤銷上一條，可重新拉弦';});
ui.clearStrings.addEventListener('click',()=>{strings.length=0;candidate=null;lastCreatedPose=null;resetGesture();refreshStringUI();ui.status.textContent='已清空所有琴弦';});
ui.stop.addEventListener('click',cleanup);
ui.flip.addEventListener('click',async()=>{if(mode!=='camera')return;candidate=null;lastCreatedPose=null;resetGesture();const previous=facing;facing=facing==='user'?'environment':'user';if(stream)stream.getTracks().forEach(t=>t.stop());try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},facingMode:facing}});video.srcObject=stream;await video.play();smoothed=[];hands=[];resetGesture();lastVideoTime=-1}catch(e){facing=previous;ui.status.textContent='無法切換鏡頭'}});
ui.quality.addEventListener('change',()=>{interval=ui.quality.value==='eco'?110:ui.quality.value==='smooth'?50:65});
ui.drumEnabled.addEventListener('change',()=>{drumStates.fill(null);ui.drumStatus.textContent=ui.drumEnabled.checked?'🥁 握拳向下敲，位置越高鼓聲越高':'🥁 鼓聲已關閉'});
ui.strumEnabled.addEventListener('change',()=>{strumStates.fill(null);ui.strumStatus.textContent=ui.strumEnabled.checked?'🖐 右揮由上往下，左揮由下往上':'🖐 揮掌掃弦已關閉';});
ui.share.addEventListener('click',async()=>{try{if(navigator.share)await navigator.share({title:'空中光弦',url:location.href,text:'伸出雙手，用手機鏡頭彈光弦！'});else if(navigator.clipboard){await navigator.clipboard.writeText(location.href);ui.status.textContent='已複製分享網址'}else prompt('複製網址',location.href)}catch(e){if(e.name!=='AbortError')ui.status.textContent='分享失敗'}});
ui.shot.addEventListener('click',()=>{const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='air-strings.png';a.click()});
canvas.addEventListener('pointermove',e=>{if(mode==='demo'){const r=canvas.getBoundingClientRect();demoMouse={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height,active:true}}});
canvas.addEventListener('pointerdown',e=>{if(mode==='demo'){const r=canvas.getBoundingClientRect(),p={x:e.clientX-r.left,y:e.clientY-r.top};if(ui.drumEnabled.checked)fireDrum(p,performance.now());else if(strings.length)pluck(strings[0],performance.now(),p)}});
function demoHand(x,y,side,t){const {w,h}=size,dx=side===0?-1:1,p=Array.from({length:21},()=>({x:x*w,y:y*h}));p[0]={x:x*w,y:(y+.13)*h};for(let j=0;j<5;j++){const k=[1,5,9,13,17][j];for(let n=0;n<4;n++)p[k+n]={x:(x+dx*(j-2)*.028+dx*n*.008)*w,y:(y-.01-n*.025+.008*Math.sin(t*.001+j+side))*h}}return p}
function update(t){if(mode==='demo'){const x=demoMouse.active?demoMouse.x:.7,y=demoMouse.active?demoMouse.y:.50;hands=[demoHand(.28+.04*Math.sin(t*.0006),.53,0,t),demoHand(clamp(x,.4,.88),clamp(y,.3,.76),1,t)];return}if(mode!=='camera'||!model||video.readyState<2)return;if(t-lastInfer<interval||video.currentTime===lastVideoTime)return;lastInfer=t;lastVideoTime=video.currentTime;try{const r=model.detectForVideo(video,t),v=rectCover(size.w,size.h,video.videoWidth||640,video.videoHeight||480);cover=v;hands=smooth(r.landmarks.map(hand=>hand.map(p=>mapPoint(p,v))));lastLandmarkAt=t}catch(e){console.error(e);ui.status.textContent='辨識異常'}}

function buildStrings(){
 for(const s of strings){s.a={x:s.an.x*size.w,y:s.an.y*size.h};s.b={x:s.bn.x*size.w,y:s.bn.y*size.h};s.len=dist(s.a,s.b);s.amp*=.95;}
}
function currentIndexPose(){
 if(hands.length!==2)return null;
 let a=hands[0][8],b=hands[1][8];
 if(!a||!b||!indexExtended(hands[0])||!indexExtended(hands[1]))return null;if(a.x>b.x)[a,b]=[b,a];
 if(dist(a,b)<Math.max(86,Math.min(size.w,size.h)*.22))return null;
 return {a:{...a},b:{...b}};
}
function samePose(p,q,r){return p&&q&&dist(p.a,q.a)<r&&dist(p.b,q.b)<r}
function updateDraft(t){
 const pose=currentIndexPose(),d=Math.min(size.w,size.h);
 if(!pose||(mode==='camera'&&t-lastLandmarkAt>400)){candidate=null;return;}
 if(strings.length>=MAX_STRINGS){candidate=null;return;}
 if(samePose(pose,lastCreatedPose,Math.max(37,d*.10))){candidate=null;return;}
 if(strings.some(s=>samePose(pose,{a:s.a,b:s.b},Math.max(18,d*.055)))){candidate=null;return;}
 const tolerance=Math.max(19,d*.055);
 if(!candidate||!samePose(pose,candidate.origin,tolerance)){candidate={origin:{a:{...pose.a},b:{...pose.b}},a:{...pose.a},b:{...pose.b},startedAt:t}}
 else{candidate.a=pose.a;candidate.b=pose.b}
 const elapsed=t-candidate.startedAt;
 if(elapsed>=HOLD_MS){
  const i=strings.length,[note,freq]=SCALE[i],frozen={a:{...candidate.a},b:{...candidate.b}};
  const s={id:Date.now()+i,i,hue:HUE[i],note,freq,
    an:{x:frozen.a.x/size.w,y:frozen.a.y/size.h},bn:{x:frozen.b.x/size.w,y:frozen.b.y/size.h},
    a:frozen.a,b:frozen.b,len:dist(frozen.a,frozen.b),amp:20,lastHit:-1000};
  strings.push(s);lastCreatedPose=frozen;candidate=null;
  burst({x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2},s.hue);beep(s.freq,s.len);
  if(navigator.vibrate)navigator.vibrate(35);
  refreshStringUI();ui.status.textContent='第 '+strings.length+' 條已固定：'+s.note;
 }else{ui.status.textContent='保持食指不動 '+Math.max(.1,(HOLD_MS-elapsed)/1000).toFixed(1)+' 秒';}
}
function drawDraft(t){
 if(!candidate)return;
 const a=candidate.a,b=candidate.b,progress=clamp((t-candidate.startedAt)/HOLD_MS,0,1),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
 ctx.save();ctx.globalCompositeOperation='screen';ctx.lineCap='round';ctx.shadowColor='#a6fff0';ctx.shadowBlur=14;
 ctx.strokeStyle='rgba(170,255,235,'+(.50+progress*.45)+')';ctx.lineWidth=3;ctx.setLineDash([10,6]);
 ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
 for(const p of [a,b]){ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fillStyle='#f9e2b7';ctx.fill()}
 ctx.shadowBlur=5;ctx.strokeStyle='#f6e2b0';ctx.lineWidth=4;ctx.beginPath();ctx.arc(mx,my-30,19,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke();
 ctx.globalCompositeOperation='source-over';ctx.fillStyle='#fff3dd';ctx.font='bold 16px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillText(Math.max(0,(HOLD_MS-(t-candidate.startedAt))/1000).toFixed(1),mx,my-30);
 ctx.font='bold 12px system-ui';ctx.fillText('穩住 1 秒固定',mx,my-59);ctx.restore();
}
function offset(p,a,b){const dx=b.x-a.x,dy=b.y-a.y;return(dx*(p.y-a.y)-dy*(p.x-a.x))/(Math.hypot(dx,dy)||1)}
function projection(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy||1;return clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/den,0,1)}

function gesture(t){
 if(!hands.length){resetGesture();return;}
 hands.forEach((h,hi)=>{
  if(isFist(h)||(ui.strumEnabled.checked&&isOpenPalm(h))){oldTips[hi].clear();return;}
  const palm=dist(h[5],h[17])||55;
  for(const f of [8,12]){
   const current=h[f],previous=oldTips[hi].get(f);
   oldTips[hi].set(f,{...current});if(!previous)continue;
   const speed=dist(current,previous);
   if(speed<Math.max(8,palm*.13)||speed>Math.max(270,palm*5))continue;
   for(const s of strings){
    if(!s.a)continue;
    const d0=offset(previous,s.a,s.b),d1=offset(current,s.a,s.b);
    if(d0*d1>=0||Math.abs(d1-d0)<Math.max(9,palm*.14))continue;
    if(Math.max(Math.abs(d0),Math.abs(d1))>Math.max(130,palm*2.8))continue;
    const u=projection(current,s.a,s.b);if(u<.08||u>.92)continue;
    pluck(s,t,{x:mix(s.a.x,s.b.x,u),y:mix(s.a.y,s.b.y,u)});
   }
  }
 });
 for(let i=hands.length;i<2;i++)oldTips[i].clear();
}
function drawBackground(){const {w,h}=size;if(mode==='camera'&&video.readyState>=2){const r=rectCover(w,h,video.videoWidth||640,video.videoHeight||480);cover=r;if(ui.showCam.checked){ctx.save();if(facing==='user'){ctx.translate(w,0);ctx.scale(-1,1)}ctx.drawImage(video,r.x,r.y,r.w,r.h);ctx.restore();ctx.fillStyle='rgba(6,10,22,.20)';ctx.fillRect(0,0,w,h)}else{ctx.fillStyle='#08111d';ctx.fillRect(0,0,w,h)}}else{ctx.fillStyle='#07111c';ctx.fillRect(0,0,w,h);const g=ctx.createRadialGradient(w*.5,h*.4,20,w*.5,h*.4,w*.9);g.addColorStop(0,'#183047');g.addColorStop(1,'#07111c');ctx.fillStyle=g;ctx.fillRect(0,0,w,h)}}

function drawString(s,t){
 const a=s.a,b=s.b,len=s.len,nx=-(b.y-a.y)/(len||1),ny=(b.x-a.x)/(len||1);
 ctx.save();ctx.globalCompositeOperation='screen';ctx.lineCap='round';
 for(const [width,alpha,blur] of [[12,.13,15],[4,.30,7],[1.2,.95,0]]){
  ctx.beginPath();
  for(let j=0;j<=30;j++){const u=j/30,warp=Math.sin(u*Math.PI)*Math.sin(u*22-t*.05)*s.amp;
   const x=mix(a.x,b.x,u)+nx*warp,y=mix(a.y,b.y,u)+ny*warp;
   if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
  ctx.strokeStyle='hsla('+s.hue+',92%,78%,'+alpha+')';
  ctx.shadowBlur=blur;ctx.shadowColor='hsl('+s.hue+',95%,65%)';ctx.lineWidth=width;ctx.stroke();
 }
 ctx.restore();ctx.save();ctx.shadowColor='hsl('+s.hue+',95%,65%)';ctx.shadowBlur=10;ctx.fillStyle='#f0ffe9';
 for(const p of [a,b]){ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill()}
 ctx.shadowBlur=3;ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillText(s.note,(a.x+b.x)/2,(a.y+b.y)/2-13);ctx.restore();
}
function drawHand(h){const edges=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];ctx.save();ctx.globalCompositeOperation='screen';ctx.strokeStyle='rgba(110,255,210,.6)';ctx.lineWidth=1.5;edges.forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(h[a].x,h[a].y);ctx.lineTo(h[b].x,h[b].y);ctx.stroke()});h.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,TIP.includes(i)?4:2.5,0,Math.PI*2);ctx.fillStyle=TIP.includes(i)?'#ffb36e':'#c7fff1';ctx.shadowBlur=10;ctx.shadowColor=ctx.fillStyle;ctx.fill()});ctx.restore()}
function drawParticles(){ctx.save();ctx.globalCompositeOperation='screen';particles=particles.filter(p=>p.life>.035);for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.vx*=.98;p.vy*=.98;p.life*=.947;ctx.globalAlpha=p.life;ctx.fillStyle='hsl('+p.hue+',95%,82%)';ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.6,p.life*2.5),0,Math.PI*2);ctx.fill()}ctx.restore()}

function tick(t){
 if(mode==='idle')return;
 drawBackground();update(t);processDrumHands(t);buildStrings();updateDraft(t);processPalmStrums(t);gesture(t);runStrumQueue(t);
 strings.forEach(s=>drawString(s,t));drawDraft(t);
 if(ui.showPoints.checked)hands.forEach(drawHand);drawParticles();drawDrumHits(t);drawStrumWaves(t);frameN++;
 if(t-fpsFrom>900){const fps=Math.round(frameN*1000/(t-fpsFrom));ui.fps.textContent='FPS '+fps;
  if(mode==='camera'&&ui.quality.value==='auto')interval=fps<18?115:fps<25?85:65;fpsFrom=t;frameN=0;}
 ui.hands.textContent='手部 '+hands.length+' / 2';lastFrame=t;raf=requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetGesture()});
