// ADP models opponent order, never player value. No imports or source rows are mutated.
export const GUIDANCE_DEFAULTS = {spread:20,needBonus:2};
export const SCENARIOS = 128;
const mask = p => p.pos.reduce((m,g)=>m|({G:1,F:2,C:4}[g]||0),0);
const position = m => ({pos:['G','F','C'].filter((_,i)=>m&(1<<i))});
function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function normal(id,trial){
 // Stable common scenarios across alternatives, reloads, and source row ordering.
 let h=hash(id+':'+trial);const random=()=>{h+=0x6D2B79F5;let t=h;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)+1;};
 return Math.sqrt(-2*Math.log(random()/4294967297))*Math.cos(2*Math.PI*random()/4294967297);
}
export function lookAhead({pool,available,roster,fit,lineupFit,room,pick,myPick,following,allocate,allocateBestBallLineup}){
 const cfg={...GUIDANCE_DEFAULTS,...room.config.guidance},consensus=room.orderMode==='consensus',bestBall=room.platform==='Underdog';
 const rankOf=p=>consensus?p.consensusRank:p.rank;
 const maxRank=Math.max(1,...pool.map(p=>rankOf(p)||0));
 const value=p=>consensus?p.adjusted:100*(1-(p.rank-1)/maxRank);
 const qualified=p=>Number.isFinite(rankOf(p))&&Number.isFinite(value(p));
 const groups=Array.from({length:8},()=>[]),single=[],pair=[];
 const coverage=players=>bestBall?allocateBestBallLineup(players).filled:allocate(players,room.config.targets).filled;
 const baseline=bestBall?lineupFit.filled:fit.filled;
 const lineupUrgency=bestBall?1+2*Math.min(1,roster.length/5):1;
 for(let m=0;m<8;m++){
  single[m]=coverage([...roster,position(m)])-baseline;
  pair[m]=[];
  for(let n=0;n<8;n++)pair[m][n]=coverage([...roster,position(m),position(n)])-baseline;
 }
 const candidates=available.filter(qualified).map(p=>({...p,baseValue:value(p),improves:single[mask(p)]>0,lineupGain:bestBall?single[mask(p)]:0,needScore:100*single[mask(p)],rosterBonus:cfg.needBonus*lineupUrgency*single[mask(p)],unlikely:following!==null&&p.adp!==null&&p.adp<following,expectedNext:null,nextPlayer:null,nextFrequency:null,waitChance:null,myChance:null,samples:0,uncovered:0}));
 const before=myPick===null?0:myPick-pick,between=following===null?0:following-myPick-1;
 const missingAdp=available.filter(p=>!Number.isFinite(p.adp)).length;
 let reason=null;
 if(myPick===null)reason='Your roster is complete.';
 else if(following===null)reason='Final roster pick: choose the strongest immediate value.';
 else if(!available.some(p=>Number.isFinite(p.adp)))reason='Import ADP to model the picks between your turns. Showing immediate value.';
 else if(room.picks.some(p=>!p.player))reason='Resolve unknown picks in pick history to model the remaining pool. Showing immediate value.';
 else if(available.length<=before+between+1)reason='The imported player pool is too small to model a second pick. Showing immediate value.';
 const active=reason===null;
 const meta={active,reason,missingAdp,scenarios:active?SCENARIOS:0,before,between,myPick,following,consensus,bestBall,lineupUrgency,unit:consensus?'adjusted FP/G':'rank-value points',...cfg};
 if(!active){for(const p of candidates){p.score=p.baseValue+p.rosterBonus;p.pairProjection=null;}return finish();}
 const market=available.map((p,i)=>({id:p.id,index:i,adp:Number.isFinite(p.adp)?p.adp:rankOf(p)||maxRank+1}));
 const indexById=new Map(market.map(p=>[p.id,p.index]));
 const sums=new Map(candidates.map(p=>[p.id,{next:0,projection:0,wait:0,partners:new Map()}]));
 for(const p of candidates)groups[mask(p)].push(p);
 groups.forEach(g=>g.sort((a,b)=>b.baseValue-a.baseValue||a.id.localeCompare(b.id)));
 const immediate=[...candidates].sort((a,b)=>(b.baseValue+b.rosterBonus)-(a.baseValue+a.rosterBonus)||a.id.localeCompare(b.id));
 const cutoff=before+between;
 for(let trial=0;trial<SCENARIOS;trial++){
  const order=market.map(p=>({...p,priority:p.adp+(cfg.spread?Math.max(1.5,p.adp*cfg.spread/100)*normal(p.id,trial):0)})).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
  const ranks=new Int32Array(market.length);order.forEach((p,i)=>ranks[p.index]=i);
  const at=p=>ranks[indexById.get(p.id)];
  // Taking a candidate inside the opponent prefix shifts its cutoff by one.
  // Two best survivors per position group suffice: one may be the current pick.
  const survivors=[cutoff,cutoff+1].map(limit=>groups.map(g=>{const top=[];for(const p of g)if(at(p)>=limit){top.push(p);if(top.length===2)break;}return top;}));
  const alternatives=[];for(const p of immediate)if(at(p)>=before){alternatives.push(p);if(alternatives.length===2)break;}
  for(const p of candidates){
   const rank=at(p);if(rank<before)continue;
   p.samples++;const sum=sums.get(p.id),pm=mask(p),shift=rank<cutoff?1:0;
   let next=null,best=-Infinity,bonus=0;
   for(let m=0;m<8;m++){
    const q=survivors[shift][m].find(q=>q.id!==p.id);if(!q)continue;
    const extra=cfg.needBonus*lineupUrgency*(pair[pm][m]-single[pm]),utility=q.baseValue+extra;
    if(utility>best||utility===best&&q.id<(next?.id||'')){next=q;best=utility;bonus=extra;}
   }
   if(next){sum.next+=next.baseValue+bonus;sum.projection+=next.baseValue;sum.partners.set(next.id,(sum.partners.get(next.id)||0)+1);}else p.uncovered++;
   // Waiting means choosing the strongest immediate alternative at your turn.
   const alternative=alternatives.find(q=>q.id!==p.id);
   const waitCutoff=cutoff+(alternative&&at(alternative)<cutoff?1:0);
   if(rank>=waitCutoff)sum.wait++;
  }
 }
 const byId=new Map(candidates.map(p=>[p.id,p]));
 for(const p of candidates){
  const sum=sums.get(p.id);p.myChance=p.samples/SCENARIOS;
  p.expectedNext=p.samples?sum.next/p.samples:null;
  p.score=p.samples?p.baseValue+p.rosterBonus+p.expectedNext:null;
  p.pairProjection=p.samples?p.baseValue+sum.projection/p.samples:null;
  // A missing ADP has only a rank proxy for simulation, not a personal survival estimate.
  p.waitChance=p.samples&&Number.isFinite(p.adp)?sum.wait/p.samples:null;
  const partner=[...sum.partners].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0];
  if(partner){p.nextPlayer=byId.get(partner[0]).name;p.nextFrequency=partner[1]/p.samples;}
 }
 return finish();
 function finish(){candidates.sort((a,b)=>(b.score??-Infinity)-(a.score??-Infinity)||b.baseValue-a.baseValue||a.name.localeCompare(b.name));return {candidates,guidance:meta};}
}
