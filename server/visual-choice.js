import {AsyncLocalStorage} from 'node:async_hooks';
const scope=new AsyncLocalStorage();
export const visualChoice=()=>scope.getStore()||{mode:'library'};
export function withVisualChoice(choice,fn){
  const c=choice&&typeof choice==='object'?choice:{};
  if(c.mode==='generate'&&c.confirmImageGeneration!==true)throw Object.assign(new Error('Please explicitly confirm creating a new image first.'),{statusCode:400,code:'IMAGE_CONFIRMATION_REQUIRED'});
  return scope.run({mode:c.mode==='generate'?'generate':'library',assetId:typeof c.assetId==='string'?c.assetId:null,uploadId:typeof c.uploadId==='string'?c.uploadId:null},fn);
}
export function requireImageConsent(){if(visualChoice().mode!=='generate')throw Object.assign(new Error('Choose an existing image, upload a file, or explicitly confirm generating a new image.'),{statusCode:409,code:'IMAGE_CONFIRMATION_REQUIRED'});}
