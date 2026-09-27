/* A separate effect keeps turning when the wearer is idle. */
(function(root){
 'use strict';
 root.GALLERY_ATTACHED_EFFECT={state(effect,action,time){
  if(!effect || effect.hiddenActions.includes(action))return null;
  const phase=Math.floor(Math.max(0,time)/effect.frameMs)%effect.framesPerHeight;
  const index=phase+(effect.mountedActions.includes(action)?effect.framesPerHeight:0);
  const [width,height]=effect.tile;
  return {index,sx:(index%effect.columns)*width,sy:Math.floor(index/effect.columns)*height,width,height,x:-effect.anchor[0],y:-effect.anchor[1]};
 }};
})(typeof window==='undefined'?globalThis:window);
