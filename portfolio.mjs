import {risk,today,validDate} from './core.mjs';
export const operationsCategories=['support/inquiries','incidents','maintenance','App Store releases','improvements','marketing/ads'];
export const cadenceOptions=['none','daily','weekly','monthly','as-needed'];
export function migrate(input){
 const s=structuredClone(input);if((s.schemaVersion||1)>=2)return s;
 s.portfolio={id:'hibou',name:'Hibou'};
 for(const p of s.projects){p.portfolio='hibou';p.family=p.id==='atlas'?'Atlas':p.name;p.stream='development';p.versionLabel=p.id==='atlas'?'2054-11 release target':'未登録';}
 if(!s.projects.some(p=>p.id==='atlas-ops'))s.projects.push({id:'atlas-ops',portfolio:'hibou',family:'Atlas',name:'Atlas 運用',stream:'operations',versionLabel:'継続運用（将来枠）',description:'運用は開発バージョンと別管理 · 未開始',active:false,lanes:['運用チーム · 未割当'],categories:[...operationsCategories]});
 for(const t of s.tasks){t.milestoneId=t.sample&&t.project==='atlas'?'atlas-release':'';t.category='';t.cadence='none';}
 s.schemaVersion=2;s.revision++;s.audit.push({at:new Date().toISOString(),type:'schema.migrate',version:2});return s;
}
export function filterTasks(state,f={},date=today()){
 if((f.from&&!validDate(f.from))||(f.to&&!validDate(f.to))||(f.from&&f.to&&f.from>f.to))return [];
 return state.tasks.filter(t=>{
 const p=state.projects.find(x=>x.id===t.project);
 return (!f.project||f.project==='all'||t.project===f.project)&&(!f.lane||f.lane==='all'||t.lane===f.lane||t.scopeLanes?.includes(f.lane))&&(!f.actorKind||f.actorKind==='all'||t.actorKind===f.actorKind)&&(!f.assignee||f.assignee==='all'||t.assignee===f.assignee)&&(!f.status||f.status==='all'||t.status===f.status)&&(!f.stream||f.stream==='all'||p?.stream===f.stream)&&(!f.risk||f.risk==='all'||risk(t,state.tasks,date).level===f.risk)&&(!f.attention||f.attention==='all'||(f.attention==='blocked'?Boolean(t.blocker):f.attention==='decision'?Boolean(t.decision):Boolean(t.blocker||t.decision)))&&(!f.from||t.end>=f.from)&&(!f.to||t.start<=f.to);
 });
}
export function projectSummary(state,project,visible=state.tasks,date=today()){
 const ts=visible.filter(t=>t.project===project.id),open=ts.filter(t=>t.status!=='DONE'),work=ts.filter(t=>!t.milestone),known=work.filter(t=>!t.sample),sample=work.filter(t=>t.sample),order={on_track:0,watch:1,at_risk:2};
 const assessments=open.map(t=>({task:t,...risk(t,state.tasks,date)})).sort((a,b)=>order[b.level]-order[a.level]);
 const next=open.filter(t=>!t.planningDateOnly).slice().sort((a,b)=>a.end.localeCompare(b.end)||a.id.localeCompare(b.id))[0]||null;
 const milestone=open.filter(t=>t.milestone).sort((a,b)=>a.end.localeCompare(b.end))[0]||null;
 return {tasks:ts,open,knownDone:known.filter(t=>t.status==='DONE').length,knownTotal:known.length,sampleDone:sample.filter(t=>t.status==='DONE').length,sampleTotal:sample.length,next,milestone,level:assessments[0]?.level||(ts.length?'on_track':'unknown'),reasons:assessments.filter(x=>x.level!=='on_track').flatMap(x=>x.reasons.map(reason=>({id:x.task.id,title:x.task.title,sample:!!x.task.sample,reason}))),blockers:open.filter(t=>t.blocker),decisions:open.filter(t=>t.decision),doing:open.filter(t=>t.status==='DOING'||t.status==='REVIEW')};
}
