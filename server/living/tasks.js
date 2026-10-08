// Minute-grid activities: elapsed work survives interruptions. Saved task state
// is ordinary Sim state, so checkpoints, exports and rewinds preserve it.
import {rng} from './random.js';
const RESUMABLE=new Set(['work','read','creative_hobby','garden','school_day','kindergarten_day','leisure_expanded_study']);
const PROTECTED=new Set(['sleep','toilet','shower','eat','drink']);
export function taskDuration(p,kind,seconds,time,seed){
  if(!RESUMABLE.has(kind))return seconds;
  const focus=p.state.psychology?.big_five?.conscientiousness??.5;
  const draw=rng(`${seed}:task-duration:${p.profile.seed_key}:${kind}:${time}`)();
  const symptom=p.state.life?.symptoms,burden=symptom&&symptom.until>time&&['attention','sleep','pain'].includes(symptom.pattern)?symptom.intensity*.18:0;
  return Math.max(60,Math.round(seconds*(1.12-focus*.14+(draw-.5)*.16+burden)/60)*60);
}
export function advanceTask(p,time){
  const a=p.state.action;if(!a)return;
  a.taskId ||= `${p.profile.seed_key}:${a.kind}:${a.started}`;
  a.plannedSeconds ??= Math.max(60,a.until-a.started);
  a.progressSeconds ??= Math.max(0,(Math.min(time-60,a.until)-a.started));
  const last=a.lastProgressAt??Math.max(a.started,time-60);
  a.progressSeconds=Math.min(a.plannedSeconds,a.progressSeconds+Math.max(0,time-last));
  a.lastProgressAt=time;
}
export function pauseTask(p,time,emit,{reason,bySimId=null,causeEventId=null}={}){
  const a=p.state.action;if(!a)return null;
  const resumable=RESUMABLE.has(a.kind)&&a.progressSeconds<a.plannedSeconds;
  const e=emit('action_interrupted',p,time,{action:a.kind,taskId:a.taskId,reason,bySimId,causeEventId,progressSeconds:a.progressSeconds||0,plannedSeconds:a.plannedSeconds,resumable});
  e.description=`${p.name} pauses ${a.kind.replaceAll('_',' ')}: ${reason}. ${Math.round((a.progressSeconds||0)/60)} minutes of progress ${resumable?'are retained':'were spent'}.`;
  if(resumable){
    p.state.pausedTasks ||= [];
    if(p.state.pausedTasks.length>=4){const old=p.state.pausedTasks.shift(),abandoned=emit('task_abandoned',p,time,{taskId:old.taskId,action:old.kind,reason:'reprioritized',progressSeconds:old.progressSeconds});abandoned.description=`${p.name} sets aside an unfinished ${old.kind.replaceAll('_',' ')} task after reprioritizing.`;}
    p.state.pausedTasks.push({...a,locationId:p.state.location_id,pausedAt:time,resource:null});
  }
  p.state.action=null;return e;
}
export function resumeTask(p,kind,time,emit){
  const tasks=p.state.pausedTasks||[];
  for(let i=tasks.length-1;i>=0;i--)if(tasks[i].kind===kind&&tasks[i].locationId===p.state.location_id){
    const a=tasks.splice(i,1)[0];
    p.state.action={...a,started:time,lastProgressAt:time,until:time+Math.max(60,a.plannedSeconds-a.progressSeconds),resumptions:(a.resumptions||0)+1};
    const e=emit('action_resumed',p,time,{action:kind,taskId:a.taskId,progressSeconds:a.progressSeconds,plannedSeconds:a.plannedSeconds});
    e.description=`${p.name} resumes ${kind.replaceAll('_',' ')} with ${Math.round(a.progressSeconds/60)} minutes of retained progress.`;p.state.action.event_id=e.id;return true;
  }return false;
}
export function canInterruptForContact(p,other,time,seed,category){
  if(PROTECTED.has(p.state.action?.kind)||p.state.route||p.state.socialUntil>time)return false;
  if(!p.state.action)return true;
  const urgent=['ask_help','comfort','set_boundary','argue'].includes(category),five=p.state.psychology?.big_five||{};
  const closeness=p.relations[other.id]?.closeness||0;
  const willingness=urgent?.85:Math.min(.8,.2+(five.extraversion??.5)*.3+closeness*.2-(p.state.action.kind==='work'?.15:0));
  return rng(`${seed}:interrupt:${p.profile.seed_key}:${other.profile.seed_key}:${time}`)()<willingness;
}
export function beginConversation(a,b,e,duration,emit){
  // Both people must already have accepted the supported contact. A failed
  // interruption leaves their tasks running and never grants romantic consent.
  for(const [p,other] of [[a,b],[b,a]]){
    if(p.state.action)pauseTask(p,e.end,emit,{reason:`a conversation with ${other.name}`,bySimId:other.id,causeEventId:e.id});
    p.state.socialUntil=e.end+Math.max(60,Math.ceil(duration/60)*60);
    p.state.conversation={eventId:e.id,withId:other.id,category:e.facts.category,started:e.end};
  }
}
