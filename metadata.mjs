export const actorKinds=['human','ai','collab','unknown'];
export const schedulePolicies=['human_time_block','all_day','none'];
export const sourceKinds=['google_calendar_verified','owner_provided','planning_agreement','unknown'];
export const actorLabels={human:'Owner',ai:'AI',collab:'共同作業',unknown:'実行者未確認'};
export const policyLabels={human_time_block:'人の時間枠 · 未設定',all_day:'終日計画',none:'Boardのみ'};
export const sourceLabels={google_calendar_verified:'Google Calendar検証済み計画',owner_provided:'Owner提供',planning_agreement:'合意済み計画期間',unknown:'出典未確認'};
export function validateMetadata(t,project,{required=false}={}){
 for(const [key,values] of [['actorKind',actorKinds],['schedulePolicy',schedulePolicies],['sourceKind',sourceKinds]])if((required||t[key]!==undefined)&&!values.includes(t[key]))throw Error('Invalid '+key);
 if(t.schedulePolicy==='human_time_block'&&t.actorKind!=='human')throw Error('Human time block requires verified Owner actor');
 if(t.sourceRef!==undefined&&(typeof t.sourceRef!=='string'||t.sourceRef.length>1000||/[\u0000-\u001f]/.test(t.sourceRef)))throw Error('Invalid sourceRef');
 if(t.verifiedAt!==undefined&&(typeof t.verifiedAt!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(t.verifiedAt)||!Number.isFinite(Date.parse(t.verifiedAt))||new Date(t.verifiedAt.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==t.verifiedAt.slice(0,10)))throw Error('Invalid verifiedAt');
 if(t.scopeLanes!==undefined&&(!Array.isArray(t.scopeLanes)||new Set(t.scopeLanes).size!==t.scopeLanes.length||t.scopeLanes.some(l=>!project.lanes.includes(l))))throw Error('Invalid scopeLanes');
 if(t.planningDateOnly!==undefined&&typeof t.planningDateOnly!=='boolean')throw Error('Invalid planningDateOnly');
}
