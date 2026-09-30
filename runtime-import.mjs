import {readFile} from 'node:fs/promises';
import {validDate} from './core.mjs';
import {validateMetadata} from './metadata.mjs';
export async function importPrivate(path){
 const s=JSON.parse(await readFile(path,'utf8'));
 if(s.schemaVersion!==3||!Number.isInteger(s.revision)||s.revision<0||!Array.isArray(s.projects)||!Array.isArray(s.tasks))throw Error('Invalid private state schema');
 const ids=new Set();
 for(const p of s.projects){if(typeof p.id!=='string'||ids.has(p.id)||!Array.isArray(p.lanes))throw Error('Invalid project');ids.add(p.id);}
 ids.clear();for(const t of s.tasks){
  const p=s.projects.find(p=>p.id===t.project);
  if(!p||typeof t.id!=='string'||ids.has(t.id)||!validDate(t.start)||!validDate(t.end)||t.start>t.end||!Array.isArray(t.dependencies))throw Error('Invalid private task');
  ids.add(t.id);validateMetadata(t,p,{required:true});
 }
 if(!Array.isArray(s.queue)||!Array.isArray(s.audit)||!s.links||!s.conflicts||!s.events)throw Error('Invalid private state collections');
 return s;
}
