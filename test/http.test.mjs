import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,copyFile,rm,readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';import {once} from 'node:events';
const root=new URL('../',import.meta.url);
test('local HTTP lifecycle: schema migration, assets, edits, mock sync, CAS and restart persistence',async()=>{
 const dir=await mkdtemp(new URL('../.smoke-',import.meta.url).pathname);let child;
 async function start(){child=spawn(process.execPath,['server.mjs'],{cwd:dir,env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});let out='';return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout '+out)),5000);child.stdout.on('data',b=>{out+=b;const match=out.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.stderr.on('data',b=>{out+=b;});child.once('exit',code=>{clearTimeout(timer);reject(Error('Early server exit '+code+' '+out));});});}
 async function stop(){if(child.exitCode===null&&child.signalCode===null){const exit=once(child,'exit');child.kill('SIGTERM');await exit;}child=null;}
 try{
 for(const f of ['config.mjs','schema.mjs','auth.mjs','runtime-import.mjs','login.mjs','manifest.webmanifest','sw.mjs','icon.svg','offline.html','server.mjs','core.mjs','metadata.mjs','planning-import.mjs','portfolio.mjs','seed.mjs','index.html','app.mjs','style.css'])await copyFile(new URL(f,root),dir+'/'+f);
 let base=await start();for(const f of ['/','/app.mjs','/core.mjs','/metadata.mjs','/portfolio.mjs','/style.css'])assert.equal((await fetch(base+f)).status,200);
 let s=await(await fetch(base+'/api/state')).json();assert.equal(s.schemaVersion,3);assert.equal(s.projects.length,4);assert.equal(s.projects.at(-1).stream,'operations');
 const send=async action=>fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:s.revision,...action})});
 let r=await send({type:'edit',id:'atlas-v1-plan-direction',patch:{assignee:'Smoke fixture'}});assert.equal(r.status,200);s=await r.json();
 r=await send({type:'sync'});assert.equal(r.status,200);s=await r.json();assert.equal(s.queue.length,0);assert.equal(Object.keys(s.links).length,1);assert.equal(s.events['unrelated-event'].etag,'1');
 assert.equal((await send({type:'sync',revision:-1})).status,409);assert.equal((await fetch(base+'/data/state.json')).status,404);
 assert.equal((await fetch(base+'/api/action',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:'{}'})).status,403);
 await stop();base=await start();const persisted=await(await fetch(base+'/api/state')).json();assert.deepEqual(persisted,s);assert.equal(persisted.tasks.find(t=>t.id==='atlas-v1-plan-direction').assignee,'Smoke fixture');await stop();
 }finally{if(child)await stop();await rm(dir,{recursive:true,force:true});}
});
