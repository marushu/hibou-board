import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {importPrivate} from '../runtime-import.mjs';
import {seed} from '../seed.mjs';
import {promotePlanning} from '../planning-import.mjs';
test('explicit private import accepts schema-3 demo-shaped runtime without promoting or mutating it',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hibou-import-'));try{
  const state=promotePlanning(seed());state.tasks[0].title='Operator fixture';const file=join(dir,'input.json');await writeFile(file,JSON.stringify(state));assert.deepEqual(await importPrivate(file),state);
  for(const mutate of [s=>s.schemaVersion=2,s=>s.tasks[0].actorKind='invalid',s=>s.tasks[0].start='bad',s=>s.tasks.push(s.tasks[0]),s=>s.projects.push(s.projects[0]),s=>s.audit=null]){const s=structuredClone(state);mutate(s);await writeFile(file,JSON.stringify(s));await assert.rejects(importPrivate(file));}
 }finally{await rm(dir,{recursive:true,force:true});}
});
