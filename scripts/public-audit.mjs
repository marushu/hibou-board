import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024});
const files=git('ls-files','--stage','-z').split('\0').filter(Boolean);
let deny=[];try{deny=JSON.parse(readFileSync('private/audit-deny.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('Invalid private audit configuration');}
const findings=new Map();let count=0;
const fail=rule=>findings.set(rule,(findings.get(rule)||0)+1);
const forbidden=/(^|\/)(?:node_modules|data|secrets|private|backups|credentials[^/]*|\.git)(?:\/|$)|(?:^|\/)\.env(?!.*\.example$)|\.(?:db(?:-.*)?|sqlite.*|pem|key|p12|log)$/i;
const allowedHosts=new Set(['board.example','evil.example','other.example','example.com','www.w3.org','registry.npmjs.org','github.com','docs.github.com','nodejs.org','simplewebauthn.dev','www.npmjs.com','opencollective.com','feross.org','www.patreon.com']);
function inspect(name,text){
 count++;
 if(forbidden.test(name))fail('forbidden-file');
 if(/-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH)|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|sk-[A-Za-z0-9_-]{24,})/.test(text))fail('credential-pattern');
 if(/\/(?:Users|home)\/[A-Za-z0-9_.-]+|\.ssh\/|\.vtdd\/|\bssh\s+\S+@/i.test(text))fail('private-path');
 // Construct private-name sentinels without embedding their literal values.
 const names=[[116,111,109,105,111],[115,104,117,104,101,105],[115,117,110,97,98,97,101,121,101]];
 if(names.some(c=>text.toLowerCase().includes(String.fromCharCode(...c))))fail('private-name');
 for(const ip of text.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g))if(ip[0]!=='127.0.0.1')fail('network-address');
 for(const host of text.matchAll(/https?:\/\/([a-z0-9.-]+)(?::\d+)?/gi))if(!allowedHosts.has(host[1])&&host[1]!=='127.0.0.1')fail('hostname');
 if(/https?:\/\/\[[0-9a-f:]+\]/i.test(text))fail('network-address');
 for(const item of deny)if(typeof item==='string'&&item.length>=6&&text.includes(item))fail('known-private-value');
 if(name==='planning-import.mjs'){
  const rows=text.match(/export const checkpoints=(.*);/);if(!rows)fail('demo-fixture');else{try{if(JSON.parse(rows[1]).some(row=>!/^demo:evidence:\d+$/.test(row[2])))fail('non-demo-evidence');}catch{fail('demo-fixture');}}
 }
}
for(const entry of files){const [meta,name]=entry.split('\t');const [mode,hash,stage]=meta.split(' ');if(mode!=='100644'&&mode!=='100755'||stage!=='0'){fail('non-regular-index-entry');continue;}inspect(name,git('cat-file','blob',hash));}
if(process.argv.includes('--dist'))for(const f of readdirSync('dist')){const p='dist/'+f;if(!lstatSync(p).isFile()){fail('non-regular-build-entry');continue;}inspect(p,readFileSync(p,'utf8'));}
if(!count)fail('empty-index');
console.log(JSON.stringify({status:findings.size?'FAIL':'PASS',files:count,privateDenyEntries:deny.length,findings:Object.fromEntries(findings)}));
if(findings.size)process.exitCode=1;
