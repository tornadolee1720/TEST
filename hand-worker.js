/* Air Strings V8 — MediaPipe inference off the UI thread. */
/* Only landmarks return to the page. Camera frames are not uploaded. */
let detector=null,lastTimestamp=-1;
const MODEL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const PACKAGE='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3';
self.onmessage=async ({data})=>{
 if(data?.type==='init'){
  try{
   const mp=await import(PACKAGE+'/vision_bundle.mjs');
   const files=await mp.FilesetResolver.forVisionTasks(PACKAGE+'/wasm');
   detector=await mp.HandLandmarker.createFromOptions(files,{
     baseOptions:{modelAssetPath:MODEL,delegate:'CPU'},
     runningMode:'VIDEO',numHands:2,
     minHandDetectionConfidence:.5,minHandPresenceConfidence:.45,minTrackingConfidence:.5
   });
   self.postMessage({type:'ready'});
  }catch(e){self.postMessage({type:'fatal',reason:String(e?.message||e)})}
  return;
 }
 if(data?.type==='detect'){
  const bitmap=data.bitmap;
  try{
   if(!detector)throw Error('模型尚未啟動');
   const ms=Math.max(data.timestamp,lastTimestamp+1);lastTimestamp=ms;
   const start=performance.now();
   const result=detector.detectForVideo(bitmap,ms);
   self.postMessage({type:'result',timestamp:ms,epoch:data.epoch,landmarks:result.landmarks,processingMs:performance.now()-start});
  }catch(e){
   self.postMessage({type:'error',epoch:data.epoch,reason:String(e?.message||e)});
  }finally{
   if(bitmap?.close)bitmap.close();
  }
 }
};
