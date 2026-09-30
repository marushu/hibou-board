import {test} from 'node:test';import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';import {migrate,filterTasks,projectSummary} from '../portfolio.mjs';
import {promotePlanning,checkpoints,ranges,atlasLanes,importKey} from '../planning-import.mjs';
import {edit,sync,resolve,MockCalendar,externalId,risk} from '../core.mjs';
import {validateMetadata} from '../metadata.mjs';
const planned=()=>promotePlanning(migrate(seed()));
const taskId='atlas-v1-plan-direction';
test('authoritative import: exact four lanes, nine dated checkpoint source refs and four TODO planning ranges',()=>{
 const s=planned(),p=s.projects.find(p=>p.id==='atlas'),ts=s.tasks.filter(t=>t.project==='atlas');
 assert.equal(p.name,'Atlas v1.0');assert.deepEqual(p.lanes,atlasLanes);assert.equal(ts.length,13);assert.equal(s.tasks.length,14);assert.ok(!s.tasks.some(t=>t.sample||t.id.startsWith('atlas-sample-')));assert.equal(s.archivedTasks.length,4);
 assert.equal(ts.filter(t=>t.milestone).length,9);assert.ok(ts.every(t=>t.status==='TODO'&&t.actorKind==='unknown'&&t.assignee==='未割当'&&t.remaining===null&&t.schedulePolicy==='all_day'));
 for(const [date,title,ref] of checkpoints){const t=ts.find(t=>t.sourceRef===ref);assert.ok(t);assert.equal(t.start,date);assert.equal(t.end,date);assert.equal(t.title,title);assert.equal(t.milestone,true);assert.equal(t.sourceKind,'google_calendar_verified');assert.equal(t.verifiedAt,'2054-09-30');}
 for(const [slug,start,end] of ranges){const t=ts.find(t=>t.id==='atlas-v1-plan-'+slug);assert.equal(t.start,start);assert.equal(t.end,end);assert.equal(t.sourceKind,'planning_agreement');assert.ok(!t.milestone);}
 assert.equal(s.tasks.find(t=>t.id==='atlas-release').end,'2054-11-02');assert.ok(!s.tasks.some(t=>t.project==='beacon'));assert.equal(s.projects.find(p=>p.id==='beacon').active,null);
});
test('archive preserves edited samples, mock ownership and event fixtures without promoting sample completion',()=>{
 const old=migrate(seed());edit(old,'atlas-sample-1',{status:'DONE',title:'Edited sample'});sync(old,new MockCalendar(old.events));edit(old,'atlas-sample-1',{end:'2054-10-04'});const snapshot=structuredClone(old),s=promotePlanning(old);
 assert.deepEqual(old,snapshot);assert.equal(s.archivedTasks.find(t=>t.id==='atlas-sample-1').status,'DONE');assert.equal(s.archivedTasks[0].title,'Edited sample');assert.equal(s.archivedSync['atlas-sample-1'].queued,true);assert.ok(!s.queue.includes('atlas-sample-1'));assert.deepEqual(s.events,old.events);assert.deepEqual(s.links,old.links);assert.deepEqual(s.audit.slice(0,old.audit.length),old.audit);assert.ok(s.tasks.every(t=>t.status==='TODO'));
 const before=structuredClone(s.events);sync(s,new MockCalendar(s.events));assert.deepEqual(s.events,before);assert.equal(projectSummary(s,s.projects[0],s.tasks,'2054-09-30').sampleTotal,0);
});
test('promotion is idempotent and preserves later board edits; original release ID and safe edits survive',()=>{
 const old=migrate(seed());edit(old,'atlas-release',{title:'Owner-edited release label',end:'2054-11-03',decision:'Keep owner note'});const s=promotePlanning(old),release=s.tasks.find(t=>t.id==='atlas-release');assert.equal(release.title,'Owner-edited release label');assert.equal(release.end,'2054-11-03');assert.equal(release.sourceSnapshot.end,'2054-11-02');assert.equal(release.decision,'Keep owner note');
 edit(s,taskId,{status:'DOING',end:'2054-10-03',actorKind:'ai',schedulePolicy:'none',assignee:'AI assigned after promotion'});assert.deepEqual(promotePlanning(s),s);assert.equal(Object.keys(s.imports).length,1);assert.ok(s.imports[importKey]);
});
test('legacy source refs never become sync ownership: foreign fixtures untouched and forged links rejected',()=>{
 const s=planned(),t=s.tasks.find(t=>t.sourceKind==='google_calendar_verified'),legacy={id:t.sourceRef,owner:'legacy-calendar',summary:'Legacy untouched',start:t.start,end:t.end,etag:'9'};
 s.events[t.sourceRef]=structuredClone(legacy);edit(s,t.id,{title:t.title+' board edit'});const adapter=new MockCalendar(s.events);sync(s,adapter);assert.deepEqual(s.events[t.sourceRef],legacy);assert.equal(s.links[t.id].eventId,externalId(t.id));assert.notEqual(s.links[t.id].eventId,t.sourceRef);
 s.links[t.id].eventId=t.sourceRef;edit(s,t.id,{title:t.title+' again'});const before=structuredClone(s.events);sync(s,adapter);assert.deepEqual(s.events,before);assert.ok(s.conflicts[t.id]);assert.throws(()=>resolve(s,t.id,'board',adapter),/boundary/);
});
test('task metadata enum, source, verifiedAt, scope and policy validation fails atomically',()=>{
 const s=planned();for(const patch of [{actorKind:'robot'},{schedulePolicy:'timed'},{sourceKind:'guessed'},{sourceRef:{}},{sourceRef:'bad\nref'},{verifiedAt:'yesterday'},{verifiedAt:'2054-02-30'},{scopeLanes:['not-a-lane']},{scopeLanes:'PRODUCT'},{scopeLanes:['PRODUCT','PRODUCT']},{actorKind:'collab',schedulePolicy:'human_time_block'},{actorKind:'ai',schedulePolicy:'human_time_block'},{planningDateOnly:'yes'}]){const before=structuredClone(s);assert.throws(()=>edit(s,taskId,patch));assert.deepEqual(s,before);}
 edit(s,taskId,{actorKind:'collab',schedulePolicy:'all_day',scopeLanes:['PRODUCT','LAUNCH'],sourceKind:'owner_provided',sourceRef:'owner-note',verifiedAt:'2054-09-30T10:00:00+09:00'});validateMetadata(s.tasks.find(t=>t.id===taskId),s.projects[0],{required:true});
});
test('human task is TODO and planning-only: no reboot, clock time, mock calendar write or notification',()=>{
 const s=planned(),t=s.tasks.find(t=>t.id==='workshop-device-check');assert.equal(t.title,'デモ端末の動作確認');assert.equal(t.status,'TODO');assert.equal(t.actorKind,'human');assert.equal(t.assignee,'Owner');assert.equal(t.schedulePolicy,'human_time_block');assert.equal(t.sourceKind,'owner_provided');assert.equal(t.planningDateOnly,true);assert.equal(t.start,'2054-09-30');assert.ok(t.notes.includes('未実施'));assert.equal(t.startTime,undefined);assert.equal(t.notificationSent,undefined);
 edit(s,t.id,{title:t.title+' owner note'});const before=structuredClone(s.events);sync(s,new MockCalendar(s.events));assert.deepEqual(s.events,before);assert.ok(s.queue.includes(t.id));assert.equal(s.links[t.id],undefined);assert.ok(!risk(t,s.tasks,'2054-10-20').reasons.includes('期限超過'));assert.equal(projectSummary(s,s.projects.find(p=>p.id==='workshop')).next,null);
});
test('AI none remains Board-only even with pre-existing link; collab all-day never creates clock times',()=>{
 const s=planned(),a=new MockCalendar(s.events);edit(s,taskId,{title:'Board edit'});sync(s,a);const before=structuredClone(s.events);edit(s,taskId,{actorKind:'ai',schedulePolicy:'none',end:'2054-10-03'});sync(s,a);assert.deepEqual(s.events,before);assert.ok(!s.queue.includes(taskId));edit(s,taskId,{actorKind:'collab',schedulePolicy:'all_day'});sync(s,a);const e=s.events[externalId(taskId)];assert.equal(e.startTime,undefined);assert.equal(e.end,'2054-10-04');
});
test('promoted portfolio filters use scope lanes and actor kinds; risk reports unknown effort without certainty',()=>{
 const s=planned();assert.equal(filterTasks(s,{actorKind:'human'}).length,1);assert.equal(filterTasks(s,{project:'atlas',lane:'WEB・MARKETING'}).length,9);assert.equal(filterTasks(s,{status:'DONE'}).length,0);const t=s.tasks.find(t=>t.id===taskId);assert.equal(risk(t,s.tasks,'2054-09-30').slack,null);assert.ok(risk(t,s.tasks,'2054-09-30').reasons.some(r=>r.includes('未見積')));assert.equal(risk(t,s.tasks,'2054-10-10').level,'at_risk');
});
