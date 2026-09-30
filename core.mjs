import {validateMetadata} from './metadata.mjs';
export const statuses=['TODO','DOING','REVIEW','DONE'];
export const day=d=>Date.parse(d+'T00:00:00Z')/86400000;
export const add=(d,n)=>new Date((day(d)+n)*86400000).toISOString().slice(0,10);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function validDate(d){return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(day(d))&&add(d,0)===d;}
export function workdays(a,b){let n=0;for(let d=day(a);d<=day(b);d++){const w=new Date(d*86400000).getUTCDay();if(w!==0&&w!==6)n++;}return n;}
export function risk(t,tasks,date=today()){
 if(t.status==='DONE')return {level:'on_track',reasons:['完了済み'],slack:null};
 const reasons=[];let score=0;
 const start=t.milestone?date:(t.start>date?t.start:date);const slack=t.remaining===null||t.planningDateOnly?null:workdays(start,t.end)-t.remaining;
 if(t.remaining===null){score=1;reasons.push('残作業未見積 · 確度未評価');}
 if(t.planningDateOnly){score=1;reasons.push('計画日仮置き · 期限/時刻未設定');}
 if(!t.planningDateOnly&&t.end<date){score=2;reasons.push('期限超過');}
 if(slack!==null&&slack<0){score=2;reasons.push(`残作業に対し ${-slack} 営業日不足`);}else if(slack!==null&&slack<=2){score=Math.max(score,1);reasons.push(`余裕 ${slack} 営業日`);}
 if(t.blocker){score=Math.max(score,1);reasons.push('ブロッカー: '+t.blocker);}
 for(const id of t.dependencies){const d=tasks.find(x=>x.id===id);if(!d||d.status!=='DONE'){score=Math.max(score,1);reasons.push('未完了の依存: '+(d?.title||id));if(!d||d.end>=t.start){score=2;reasons.push('依存タスクが予定開始に間に合わない');}}}
 const milestone=t.milestoneId!==undefined?tasks.find(x=>x.id===t.milestoneId&&x.project===t.project&&x.milestone):tasks.find(x=>x.project===t.project&&x.milestone&&x.id!==t.id);
 if(milestone&&t.end>milestone.end){score=2;reasons.push('リリース目標を超過');}
 if(!reasons.length)reasons.push(`残作業 ${t.remaining} 日 / 余裕 ${slack} 営業日`);
 return {level:['on_track','watch','at_risk'][score],reasons,slack};
}
export function edit(state,id,patch){
 const t=state.tasks.find(t=>t.id===id);if(!t)throw Error('Task not found');
 const allowed=['title','status','start','end','remaining','assignee','lane','blocker','decision','dependencies','milestoneId','category','cadence','actorKind','schedulePolicy','sourceKind','sourceRef','verifiedAt','scopeLanes','planningDateOnly'];
 if(Object.keys(patch).some(k=>!allowed.includes(k)))throw Error('Unsupported field');
 const n={...t,...patch};
 if(!statuses.includes(n.status)||!validDate(n.start)||!validDate(n.end)||n.start>n.end||day(n.end)-day(n.start)>730||(n.remaining!==null&&(!Number.isFinite(n.remaining)||n.remaining<0||n.remaining>730)))throw Error('Invalid status, dates or remaining work');
 for(const key of ['title','assignee','lane','blocker','decision'])if(typeof n[key]!=='string'||n[key].length>1000)throw Error('Invalid text');
 if(!n.title.trim()||!state.projects.find(p=>p.id===n.project).lanes.includes(n.lane))throw Error('Invalid title or lane');
 if(!Array.isArray(n.dependencies)||n.dependencies.some(d=>d===id||!state.tasks.some(x=>x.id===d&&x.project===n.project)))throw Error('Invalid dependency');
 if(n.milestoneId&&(n.milestone||!state.tasks.some(x=>x.id===n.milestoneId&&x.project===n.project&&x.milestone)))throw Error('Invalid milestone');
 if(n.category&&!(state.projects.find(p=>p.id===n.project).categories||[]).includes(n.category))throw Error('Invalid operations category');
 if(n.cadence!==undefined&&!['none','daily','weekly','monthly','as-needed'].includes(n.cadence))throw Error('Invalid cadence');
 validateMetadata(n,state.projects.find(p=>p.id===n.project),{required:state.schemaVersion>=3});
 const visit=(tid,path)=>{if(path.has(tid))throw Error('Dependency cycle');const task=tid===id?n:state.tasks.find(x=>x.id===tid);for(const dep of task.dependencies)visit(dep,new Set([...path,tid]));};visit(id,new Set());
 if(allowed.every(k=>JSON.stringify(n[k])===JSON.stringify(t[k])))return;
 n.version++;Object.assign(t,n);if((t.schedulePolicy||'all_day')!=='none')state.queue=[...new Set([...state.queue,id])];else state.queue=state.queue.filter(x=>x!==id);state.audit.push({at:new Date().toISOString(),type:'board.edit',id,version:t.version,patch});
}
export const externalId=id=>'hb'+Array.from(new TextEncoder().encode(id)).map(x=>x.toString(16).padStart(2,'0')).join('');
const dates=t=>({start:t.start,end:add(t.end,1)});
const same=(a,b)=>a.start===b.start&&a.end===b.end;
// Adapter contract: read(id), create(event) idempotent by id, update(id,event,etag) CAS.
export class MockCalendar {
 constructor(events){this.events=events;this.calendarId='mock-hibou-team';this.name='Hibou チーム';}
 read(id){return structuredClone(this.events[id]||null);}
 create(event){if(this.events[event.id])return this.read(event.id);this.events[event.id]={...event,etag:'1'};return this.read(event.id);}
 update(id,patch,etag){const e=this.events[id];if(!e||e.etag!==etag)throw Error('ETAG_CONFLICT');this.events[id]={...e,...patch,etag:String(Number(e.etag)+1)};return this.read(id);}
}
export function sync(state,adapter){
 if(adapter.calendarId!=='mock-hibou-team')throw Error('Live calendar disabled in MVP');
 for(const t of state.tasks){
 // none is Board-only; human blocks await time selection and notification integration.
 if(t.schedulePolicy==='none'||t.schedulePolicy==='human_time_block')continue;
 const id=externalId(t.id),e=adapter.read(id),link=state.links[t.id],dirty=state.queue.includes(t.id);
 if(!dirty&&!link)continue;
 const conflict=reason=>{state.conflicts[t.id]={reason,remote:e,version:t.version};state.audit.push({at:new Date().toISOString(),type:'sync.conflict',id:t.id,reason});};
 if(id===t.sourceRef||link&&(link.eventId!==id||link.eventId===t.sourceRef)){conflict('Evidence reference cannot be a sync ownership link');continue;}
 if(e&&(e.owner!=='hibou-board-mvp'||e.taskId!==t.id||e.calendarId!==adapter.calendarId)){conflict('イベント所有権が一致しません');continue;}
 if(link&&!e){conflict('リンク先イベントが削除されています');continue;}
 if(e&&(!validDate(e.start)||!validDate(e.end)||e.start>=e.end||day(e.end)-day(e.start)>731)){conflict('終日の日付形式ではありません');continue;}
 const remoteChanged=link&&e.etag!==link.etag;
 if(remoteChanged&&dirty&&!same(dates(t),e)){conflict('ボードとカレンダーの両方が変更されました');continue;}
 if(!link&&e&&!same(dates(t),e)){conflict('既存イベントとの初回照合が必要です');continue;}
 try {
 let result=e;
 if(remoteChanged&&!dirty){t.start=e.start;t.end=add(e.end,-1);t.version++;state.audit.push({at:new Date().toISOString(),type:'calendar.import',id:t.id});}
 else if(dirty){const event={id,taskId:t.id,owner:'hibou-board-mvp',calendarId:adapter.calendarId,summary:t.title,...dates(t),boardVersion:t.version};if(!e)result=adapter.create(event);else if(!same(event,e)||e.summary!==t.title)result=adapter.update(id,event,e.etag);}
 state.links[t.id]={eventId:id,etag:result.etag,version:t.version};delete state.conflicts[t.id];state.queue=state.queue.filter(x=>x!==t.id);
 state.audit.push({at:new Date().toISOString(),type:'sync.ack',id:t.id,etag:result.etag});
 }catch(error){conflict(error.message);}
 }
}
export function resolve(state,id,choice,adapter){
 const c=state.conflicts[id],t=state.tasks.find(t=>t.id===id),e=adapter.read(externalId(id));
 if(!t||t.schedulePolicy==='none'||t.schedulePolicy==='human_time_block'||state.links[id]?.eventId===t.sourceRef||state.links[id]?.eventId&&state.links[id].eventId!==externalId(id))throw Error('Unsafe sync boundary');
 if(!c||!e||e.owner!=='hibou-board-mvp'||e.taskId!==id||e.calendarId!==adapter.calendarId||e.etag!==c.remote?.etag||t.version!==c.version)throw Error('Conflict changed or unsafe ownership');
 if(!validDate(e.start)||!validDate(e.end)||e.start>=e.end)throw Error('Invalid remote dates');
 if(choice==='calendar'){t.start=e.start;t.end=add(e.end,-1);t.version++;state.queue=state.queue.filter(x=>x!==id);}
 else if(choice==='board')state.queue=[...new Set([...state.queue,id])];else throw Error('Invalid resolution');
 state.links[id]={eventId:e.id,etag:e.etag,version:t.version};delete state.conflicts[id];state.audit.push({at:new Date().toISOString(),type:'conflict.resolve',id,choice});sync(state,adapter);
}
