import http from 'node:http';
import {readFile,mkdir,open,unlink,chmod} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve as resolvePath} from 'node:path';
import {promotePlanning} from './planning-import.mjs';
import {seed} from './seed.mjs';
import {edit,sync,resolve,MockCalendar,externalId,validDate,day} from './core.mjs';
import {config} from './config.mjs';
import {openStore} from './schema.mjs';
import {Auth} from './auth.mjs';
import {importPrivate} from './runtime-import.mjs';
process.umask(0o077);
const cfg=config(),root=fileURLToPath(new URL('.',import.meta.url));
const dataDir=resolvePath(cfg.dataDir||root+'runtime/private/demo');
await mkdir(dataDir,{recursive:true,mode:0o700});await chmod(dataDir,0o700);
let lock;try{lock=await open(dataDir+'/server.lock','wx',0o600);await lock.writeFile(String(process.pid));}catch{throw Error('Runtime is locked; verify the owning process before recovery.');}
let store;
try{store=openStore(dataDir+'/board.db');}catch(e){await lock.close();await unlink(dataDir+'/server.lock');throw e;}
let state,auth;
try{
 state=store.load();
 if(!state){state=cfg.privateImport?await importPrivate(cfg.privateImport):promotePlanning(seed());store.save(state);}
const services=cfg.servicesFile?JSON.parse(await readFile(cfg.servicesFile,'utf8')):[];
auth=new Auth(store.db,cfg,services);
}catch{store.close();await lock.close();await unlink(dataDir+'/server.lock');throw Error('Runtime initialization failed');}
async function save(n){store.save(n,state.revision);state=n;}
async function jsonBody(req){
 if(req.headers['content-type']?.split(';')[0]!=='application/json')throw Object.assign(Error('JSON required'),{status:415});
 let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>30000)throw Object.assign(Error('Too large'),{status:413});parts.push(chunk);}
 try{const value=JSON.parse(Buffer.concat(parts).toString());if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw Object.assign(Error('Invalid JSON'),{status:400});}
}
let tail=Promise.resolve();
const server=http.createServer(async(req,res)=>{
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
 if(cfg.mode==='production')headers['Strict-Transport-Security']='max-age=31536000';
 for(const [k,v] of Object.entries(headers))res.setHeader(k,v);
 const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 try{
 const allowed=cfg.mode==='demo'?/^127\.0\.0\.1:\d+$/.test(req.headers.host||''):req.headers.host===new URL(cfg.origin).host;
 if(!allowed)return send(403,{error:'Host rejected'});
 const {pathname}=new URL(req.url,'http://127.0.0.1');
 const expectedOrigin=cfg.mode==='demo'?`http://${req.headers.host}`:cfg.origin;
 if(req.method==='POST'&&req.headers.origin&&req.headers.origin!==expectedOrigin)return send(403,{error:'Origin rejected'});
 if(req.method==='GET'&&pathname==='/api/auth/session'){
  if(cfg.mode==='demo')return send(200,{mode:'demo'});
  const p=auth.identify(req);return p?.kind==='human'?send(200,{mode:'production',csrf:p.csrf}):send(401,{error:'Sign in required'});
 }
 if(cfg.mode==='production'&&req.method==='POST'&&/^\/api\/auth\/(register|login)\/(options|verify)$/.test(pathname)){
  if(req.headers.origin!==cfg.origin)return send(403,{error:'Origin required'});
  const body=await jsonBody(req),[,name,step]=pathname.match(/^\/api\/auth\/(register|login)\/(options|verify)$/),kind=name==='register'?'register':'login';
  try{
   if(step==='options')return send(200,await auth.options(kind,req.headers['x-enrollment-token']));
   const session=await auth.verify(kind,body,req.headers['x-enrollment-token']);res.setHeader('Set-Cookie',auth.cookie(session.token));return send(200,{csrf:session.csrf});
  }catch{return send(401,{error:'Authentication failed'});}
 }
 if(cfg.mode==='production'&&pathname.startsWith('/api/')){
  const scope=req.method==='GET'?'board:read':'board:write';
  const principal=auth.authorize(req,scope);if(!principal)return send(403,{error:'Authorization required'});
  if(pathname==='/api/auth/logout'&&req.method==='POST'){
   if(principal.kind!=='human')return send(403,{error:'Human session required'});
   store.db.prepare('DELETE FROM sessions WHERE digest=?').run(principal.digest);res.setHeader('Set-Cookie','__Host-hibou=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');return send(200,{ok:true});
  }
 }
 if(req.method==='GET'&&pathname==='/api/state')return send(200,state);
 if(req.method==='POST'&&pathname==='/api/action'){
 const action=await jsonBody(req);
 const run=async()=>{if(action.revision!==state.revision)return send(409,{error:'別の画面で更新されました。再読み込みしてください。'});const n=structuredClone(state),adapter=new MockCalendar(n.events);
 try{
 if(action.type==='edit')edit(n,action.id,action.patch);
 else if(action.type==='sync')sync(n,adapter);
 else if(action.type==='resolve')resolve(n,action.id,action.choice,adapter);
 else if(action.type==='mock-move'){const task=n.tasks.find(t=>t.id===action.id);if(!task||task.schedulePolicy!=='all_day'||n.links[action.id]?.eventId!==externalId(action.id))throw Error('Active owned all-day mock link required');const id=externalId(action.id),e=adapter.read(id);if(!e||!validDate(action.start)||!validDate(action.end)||action.start>=action.end||day(action.end)-day(action.start)>731)throw Error('有効なリンクと日付が必要です');adapter.update(id,{start:action.start,end:action.end},e.etag);n.audit.push({at:new Date().toISOString(),type:'mock.calendar.edit',id:action.id});}
 else throw Error('Unknown action');
 n.revision++;await save(n);send(200,n);
 }catch(e){send(400,{error:e.message});}};
 tail=tail.then(run,run);await tail;return;
 }
 const files={'/':'index.html','/index.html':'index.html','/app.mjs':'app.mjs','/login.mjs':'login.mjs','/metadata.mjs':'metadata.mjs','/core.mjs':'core.mjs','/portfolio.mjs':'portfolio.mjs','/style.css':'style.css','/manifest.webmanifest':'manifest.webmanifest','/sw.mjs':'sw.mjs','/icon.svg':'icon.svg','/offline.html':'offline.html'};
 if(req.method!=='GET'||!files[pathname])return send(404,{error:'Not found'});
 const f=files[pathname],type=f.endsWith('css')?'text/css':f.endsWith('mjs')?'text/javascript':f.endsWith('svg')?'image/svg+xml':f.endsWith('webmanifest')?'application/manifest+json':'text/html';
 const bytes=await readFile(root+f);res.writeHead(200,{'Content-Type':type});res.end(bytes);
 }catch(e){send(e.status||500,{error:e.status?e.message:'Request failed'});}
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(cfg.port,'127.0.0.1',()=>console.log(`Hibou Board: http://127.0.0.1:${server.address().port}`));
async function stop(){server.close(async()=>{store.close();await lock.close();await unlink(dataDir+'/server.lock');process.exit();});server.closeIdleConnections();}process.on('SIGINT',stop);process.on('SIGTERM',stop);
