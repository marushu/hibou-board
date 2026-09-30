export function config(env=process.env){
 const mode=env.HIBOU_MODE||'demo';
 if(!['demo','production'].includes(mode))throw Error('Invalid mode');
 const port=Number(env.PORT||0);if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid port');
 const origin=env.HIBOU_ORIGIN||'';
 const rpID=env.HIBOU_RP_ID||'';
 if(mode==='production'){
  const u=new URL(origin);
  if(u.protocol!=='https:'||u.origin!==origin||u.hostname!==rpID)throw Error('Exact HTTPS origin and matching RP ID required');
  if(!env.HIBOU_DATA_DIR)throw Error('Dedicated private data directory required');
 }
 if(mode==='demo'&&(env.HIBOU_PRIVATE_IMPORT||env.HIBOU_SERVICES_FILE))throw Error('Private runtime input requires production mode');
 if(env.HIBOU_ENROLLMENT_TOKEN&&env.HIBOU_ENROLLMENT_TOKEN.length<32)throw Error('Enrollment token must have at least 32 characters');
 return {mode,port,origin,rpID,dataDir:env.HIBOU_DATA_DIR,privateImport:env.HIBOU_PRIVATE_IMPORT,servicesFile:env.HIBOU_SERVICES_FILE,enrollmentToken:env.HIBOU_ENROLLMENT_TOKEN||'',sessionMs:8*60*60*1000};
}
