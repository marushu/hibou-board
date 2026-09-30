import {migrate} from './portfolio.mjs';
import {validateMetadata} from './metadata.mjs';
export const importKey='atlas-v1-calendar-planning-20540930';
export const atlasLanes=['PRODUCT','WEB・MARKETING','SUPPORT・TRUST','LAUNCH'];
// Synthetic demo evidence. Never a calendarId, event ownership or sync link.
export const checkpoints=[["2054-10-02", "Demo checkpoint 1", "demo:evidence:1", "Fictional example; not a real calendar event."], ["2054-10-05", "Demo checkpoint 2", "demo:evidence:2", "Fictional example; not a real calendar event."], ["2054-10-09", "Demo checkpoint 3", "demo:evidence:3", "Fictional example; not a real calendar event."], ["2054-10-12", "Demo checkpoint 4", "demo:evidence:4", "Fictional example; not a real calendar event."], ["2054-10-16", "Demo checkpoint 5", "demo:evidence:5", "Fictional example; not a real calendar event."], ["2054-10-19", "Demo checkpoint 6", "demo:evidence:6", "Fictional example; not a real calendar event."], ["2054-10-23", "Demo checkpoint 7", "demo:evidence:7", "Fictional example; not a real calendar event."], ["2054-10-30", "Demo checkpoint 8", "demo:evidence:8", "Fictional example; not a real calendar event."], ["2054-11-02", "Demo checkpoint 9", "demo:evidence:9", "Fictional example; not a real calendar event."]];
export const ranges=[["direction", "2054-09-30", "2054-10-02", "Define demo scope", "PRODUCT", "2054-10-02"], ["prototype", "2054-10-05", "2054-10-16", "Build demo prototype", "PRODUCT", "2054-10-16"], ["review", "2054-10-19", "2054-10-23", "Review demo experience", "SUPPORT・TRUST", "2054-10-23"], ["launch", "2054-10-26", "2054-10-30", "Prepare demo release", "LAUNCH", "2054-10-30"]];
const checkpointId=date=>date==='2054-11-02'?'atlas-release':'atlas-v1-checkpoint-'+date;
function base(id,project,title,start,end,lane){return {id,project,title,start,end,lane,assignee:'未割当',actorKind:'unknown',schedulePolicy:'all_day',sourceKind:'unknown',status:'TODO',remaining:null,dependencies:[],blocker:'',decision:'',sample:false,version:1,milestoneId:'',category:'',cadence:'none',scopeLanes:[lane]};}
export function promotePlanning(input){
 const s=migrate(input);if(s.imports?.[importKey])return s;
 const p=s.projects.find(p=>p.id==='atlas');if(!p)throw Error('Atlas project missing');
 const now=new Date().toISOString(),oldLanes=[...p.lanes];
 s.imports??={};s.archivedTasks??=[];s.archivedSync??={};s.importSnapshots??={};
 s.importSnapshots[importKey]={project:structuredClone(p),release:structuredClone(s.tasks.find(t=>t.id==='atlas-release')||null)};
 const retiring=s.tasks.filter(t=>t.project==='atlas'&&(t.id.startsWith('atlas-sample-')||t.sample));
 for(const t of retiring){s.archivedTasks.push({...structuredClone(t),archivedAt:now,archiveReason:importKey});s.archivedSync[t.id]={queued:s.queue.includes(t.id),link:structuredClone(s.links[t.id]||null),conflict:structuredClone(s.conflicts[t.id]||null)};}
 const retired=new Set(retiring.map(t=>t.id));s.tasks=s.tasks.filter(t=>!retired.has(t.id));s.queue=s.queue.filter(id=>!retired.has(id));
 p.name='Atlas v1.0';p.versionLabel='v1.0 · 2054-11-02 公開目標';p.description='2054-09-30検証済み計画 · 完了実績ではありません';p.lanes=[...atlasLanes];p.sourceKind='google_calendar_verified';p.verifiedAt='2054-09-30';
 for(const t of s.tasks){
 t.actorKind??='unknown';t.schedulePolicy??='none';t.sourceKind??='unknown';
 if(t.project==='atlas'){
 const index=oldLanes.indexOf(t.lane);if(!p.lanes.includes(t.lane))t.lane=index>=0?atlasLanes[index]:'LAUNCH';
 if(t.scopeLanes)t.scopeLanes=[...new Set(t.scopeLanes.map(l=>atlasLanes.includes(l)?l:atlasLanes[oldLanes.indexOf(l)]||'LAUNCH'))];
 const dropped=t.dependencies.filter(id=>retired.has(id));if(dropped.length){t.dependencies=t.dependencies.filter(id=>!retired.has(id));t.blocker=[t.blocker,'旧サンプル依存をアーカイブ。実依存の照合待ち: '+dropped.join(', ')].filter(Boolean).join(' / ');}
 }
 }
 const created=[];
 for(const [date,title,ref,notes] of checkpoints){
 const id=checkpointId(date),t={...base(id,'atlas',title,date,date,'LAUNCH'),milestone:true,scopeLanes:[...atlasLanes],sourceKind:'google_calendar_verified',sourceRef:ref,verifiedAt:'2054-09-30',notes,sourceCalendar:'Demo calendar',sourceSnapshot:{title,start:date,end:date,notes},classificationNote:'チェックポイントはLAUNCHに表示。scopeLanesはリリース全体の参照範囲で、担当割当ではありません。'};
 const existing=s.tasks.find(x=>x.id===id);
 if(existing){
 if(id!=='atlas-release')throw Error('Import ID collision: '+id);
 // Keep intentional user edits while retiring the old inferred assignee/status.
 const old=s.importSnapshots[importKey].release;
 const defaults={title:'Atlas リリース目標',start:'2054-11-02',end:'2054-11-02',assignee:'Owner',remaining:0,blocker:'',decision:''};
 for(const key of Object.keys(defaults))if(old[key]!==defaults[key])t[key]=old[key];
 t.dependencies=existing.dependencies;t.version=existing.version+1;
 Object.assign(existing,t);
 }else{s.tasks.push(t);created.push(id);}
 }
 for(const [slug,start,end,title,lane,milestoneDate] of ranges){
 const id='atlas-v1-plan-'+slug;if(s.tasks.some(t=>t.id===id))throw Error('Import ID collision: '+id);
 s.tasks.push({...base(id,'atlas',title,start,end,lane),sourceKind:'planning_agreement',sourceRef:importKey+':'+slug,verifiedAt:'2054-09-30',milestoneId:checkpointId(milestoneDate),notes:'合意済み計画期間。着手・完了・担当の証拠ではありません。',classificationNote:'内容に基づくBoard上の分類。担当・工数は未確認。',sourceSnapshot:{title,start,end}});created.push(id);
 }
 const rebootId='workshop-device-check';if(s.tasks.some(t=>t.id===rebootId))throw Error('Import ID collision: '+rebootId);
 s.tasks.push({...base(rebootId,'workshop','デモ端末の動作確認','2054-09-30','2054-09-30',s.projects.find(p=>p.id==='workshop').lanes[0]),actorKind:'human',assignee:'Owner',schedulePolicy:'human_time_block',sourceKind:'owner_provided',sourceRef:importKey+':workshop-device-request',verifiedAt:'2054-09-30',planningDateOnly:true,notes:'架空の端末確認タスク。未実施。日付はデモ用の仮置きです。'});created.push(rebootId);
 for(const t of s.tasks)validateMetadata(t,s.projects.find(p=>p.id===t.project),{required:true});
 s.schemaVersion=3;s.revision++;s.imports[importKey]={at:now,verifiedAsOf:'2054-09-30',authority:'Synthetic demonstration fixture',created,archived:[...retired]};s.audit.push({at:now,type:'planning.promote',key:importKey,created,archived:[...retired],statusPolicy:'TODO; no completion inferred',calendarWrites:0});return s;
}
