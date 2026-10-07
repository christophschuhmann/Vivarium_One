// Direct port of the pinned OpenSims psychology.action_bias. Keeping this tiny
// pure function local avoids sending an entire city to Python every minute.
const factors={chat:['extraversion','agreeableness','socializing'],socialize:['extraversion','agreeableness','socializing'],read:['openness','conscientiousness','reading'],work:['conscientiousness','openness'],craft:['openness','conscientiousness','craft'],garden:['openness','agreeableness','gardening'],walk:['openness','extraversion','walking'],relax:['neuroticism','openness','relaxing'],cooking:['conscientiousness','openness','cooking']};
export function actionBias(p,kind,time){
 const k=({creative_hobby:'craft',stroll:'walk',eat_meal:'cooking',prepare_meal:'cooking'})[kind]||kind,psych=p.state.psychology||{},five=psych.big_five||{},[a,b,pref]=factors[k]||['openness','conscientiousness'];
 let score=((five[a]??.5)-.5)*.75+((five[b]??.5)-.5)*.25;
 if(pref)score+=((p.profile.preferences?.[pref]??.5)-.5)*.65;
 if(['chat','socialize'].includes(k))score-=((five.neuroticism??.5)-.5)*.15;
 const drive=psych.social_style?.drive??.5;
 if(['work','read','craft'].includes(k))score+=(drive-.5)*.26;else if(['relax','walk'].includes(k))score-=(drive-.5)*.12;
 for(const h of psych.hobbies||[])if(h.kind===({read:'reading',chat:'socializing',socialize:'socializing'}[k]||k))score+=((h.enjoyment??.5)-.5)*.3;
 const ambitious={community:['chat','socialize'],mastery:['read','work','craft'],create:['craft'],care:['garden','socialize'],stability:['relax']};
 for(const goal of psych.ambitions||[])if(!goal.completed&&ambitious[goal.kind]?.includes(k))score+=.12*(1-(goal.progress||0));
 for(const f of psych.fears||[]){if(f.expires_at!=null&&f.expires_at<=time)continue;const v=f.intensity||0;if(f.kind==='social_rejection'&&['chat','socialize'].includes(k))score-=v*.18;else if(f.kind==='job_loss'&&k==='work')score+=v*.25;else if(f.kind==='dogs'&&k==='walk')score-=v*.2;}
 return Math.round(Math.max(-1,Math.min(1,score))*10000)/10000;
}
