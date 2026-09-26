// Raw projection sources are immutable. Settings, name matches and computed ranks live separately.
export const STAT_LABELS={PTS:'Points',REB:'Rebounds',AST:'Assists',STL:'Steals',BLK:'Blocks',TO:'Turnovers',FG3M:'3-pointers made',FGM:'Field goals made',FGA:'Field goals attempted',FTM:'Free throws made',FTA:'Free throws attempted',FG3A:'3-pointers attempted',OREB:'Offensive rebounds',DREB:'Defensive rebounds',FGMI:'Missed field goals',FTMI:'Missed free throws',DD:'Double-doubles',TD:'Triple-doubles',MIN:'Minutes',PF:'Personal fouls'};
export const STAT_KEYS=Object.keys(STAT_LABELS);
export const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const keys={gp:['gp','g','games','gamesplayed','projectedgames'],PTS:['pts','ppg','points'],REB:['reb','rpg','treb','trb','rebounds'],AST:['ast','apg','assists'],STL:['stl','spg','steals'],BLK:['blk','bpg','blocks'],TO:['to','tov','topg','turnovers'],FG3M:['3pm','3ptm','3pt','3p','3pts','3fgm','fg3m','threes'],FGM:['fgm','fg'],FGA:['fga'],FTM:['ftm','ft'],FTA:['fta'],FG3A:['3pa','3pta','fg3a'],OREB:['oreb','orb'],DREB:['dreb','drb'],FGMI:['fgmi','fgmissed'],FTMI:['ftmi','ftmissed'],DD:['dd','dd2','doubledoubles'],TD:['td','td3','tripledoubles'],MIN:['min','mpg','mp','minutes'],PF:['pf','fouls'],fgpair:['fgm/fga','fg%','fgpct'],ftpair:['ftm/fta','ft%','ftpct'],threepair:['3pm/3pa','3ptm/3pta','3p%','3pt%']};
export function projectionMapping(headers){return Object.fromEntries(Object.entries(keys).map(([field,aliases])=>[field,headers.findIndex(h=>(field.endsWith('pair')||!/[/%]/.test(h))&&aliases.map(norm).includes(norm(h)))]));}
export function scoringPreset(platform){const scoring=Object.fromEntries(STAT_KEYS.map(k=>[k,0]));Object.assign(scoring,platform==='DraftKings'?{PTS:1,REB:1.25,AST:1.5,STL:2,BLK:2,TO:-.5,FG3M:.5,DD:1.5,TD:3}:{PTS:1,REB:1.2,AST:1.5,STL:3,BLK:3,TO:-1});return scoring;}
export function projectionDefaults(platform){return {weights:{},scoring:scoringPreset(platform),gpPenalty:20,games:82,gpSource:'blend',ignoreMissingBonuses:true};}
const parseNumber=value=>{const s=String(value??'').trim();return !s||/^(—|–|-|n\/?a|null)$/i.test(s)?null:Number(s.replace(/,/g,''));};
export function normalizeProjections(table,mapping,basis='perGame'){
 if(mapping.name<0)throw new Error('Map the player name column.');
 if(!STAT_KEYS.some(k=>mapping[k]>=0))throw new Error('Map at least one projected stat column, such as PTS.');
 if(basis==='totals'&&!(mapping.gp>=0))throw new Error('Season totals require a GP column to convert to per-game averages.');
 const players=[],errors=[],warnings=[],seen=new Set();
 table.rows.forEach((row,i)=>{
  const read=k=>mapping[k]>=0?String(row[mapping[k]]??'').trim():'';
  const name=read('name'),id=norm(name);if(!id){errors.push(`Row ${i+2}: missing player name.`);return;}
  if(seen.has(id)){errors.push(`Row ${i+2}: duplicate player ${name}. Use full names to distinguish players.`);return;}seen.add(id);
  const gp=parseNumber(read('gp')),rank=parseNumber(read('rank')),adp=parseNumber(read('adp'));
  if(gp!==null&&(!Number.isFinite(gp)||gp<0||gp>100)||basis==='totals'&&!(gp>0)){errors.push(`Row ${i+2}: ${name} needs valid GP (0–100; above 0 for totals).`);return;}
  if([rank,adp].some(v=>v!==null&&(!Number.isFinite(v)||v<=0))){errors.push(`Row ${i+2}: invalid rank or ADP.`);return;}
  const stats={};let invalid=false;
  for(const k of STAT_KEYS){let v=parseNumber(read(k));if(v!==null&&(!Number.isFinite(v)||v<0)){errors.push(`Row ${i+2}: ${name} has invalid ${k}. Import raw numeric stats, not fantasy scores.`);invalid=true;}stats[k]=v;}
  for(const [field,made,attempted] of [['fgpair','FGM','FGA'],['ftpair','FTM','FTA'],['threepair','FG3M','FG3A']]){
   const match=read(field).match(/(?:\(\s*)?(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)(?:\s*\))?/);
   if(match){stats[made]??=Number(match[1]);stats[attempted]??=Number(match[2]);}
  }
  if(invalid)return;
  for(const [m,a] of [['FGM','FGA'],['FTM','FTA'],['FG3M','FG3A']])if(stats[m]!==null&&stats[a]!==null&&stats[m]>stats[a]+.11){errors.push(`Row ${i+2}: ${m} exceeds ${a} for ${name}.`);invalid=true;}
  if(invalid)return;
  if(basis==='totals')for(const k of STAT_KEYS)if(stats[k]!==null)stats[k]/=gp;
  if(stats.REB===null&&stats.OREB!==null&&stats.DREB!==null)stats.REB=stats.OREB+stats.DREB;
  if(stats.FGMI===null&&stats.FGA!==null&&stats.FGM!==null)stats.FGMI=Math.max(0,stats.FGA-stats.FGM);
  if(stats.FTMI===null&&stats.FTA!==null&&stats.FTM!==null)stats.FTMI=Math.max(0,stats.FTA-stats.FTM);
  if(['DD','TD'].some(k=>stats[k]!==null&&stats[k]>1)){errors.push(`Row ${i+2}: DD / TD must be per-game rates between 0 and 1. For season counts, select season totals.`);return;}
  if(!STAT_KEYS.some(k=>stats[k]!==null)){errors.push(`Row ${i+2}: no projected stats for ${name}.`);return;}
  const posRaw=read('pos'),groups={PG:'G',SG:'G',G:'G',SF:'F',PF:'F',F:'F',C:'C'};
  const pos=[...new Set(posRaw.toUpperCase().split(/[^A-Z]+/).map(p=>groups[p]).filter(Boolean))];
  if(!pos.length)warnings.push(`${name}: missing position eligibility.`);
  if(gp===null)warnings.push(`${name}: GP missing; another source must supply it when GP adjustment is on.`);
  players.push({id,name,rank,adp,pos,posRaw,team:read('team'),gp,stats});
 });return {players,errors,warnings};
}
export function validateProjectionConfig(config,sources){
 if(!config||!config.weights||!config.scoring||typeof config.ignoreMissingBonuses!=='boolean')throw new Error('Invalid projection configuration.');
 if(!Number.isFinite(config.gpPenalty)||config.gpPenalty<0||config.gpPenalty>100||!Number.isInteger(config.games)||config.games<1||config.games>100)throw new Error('GP penalty must be 0–100% and scheduled games 1–100.');
 for(const [id,w] of Object.entries(config.weights))if(!sources.some(s=>s.id===id&&s.kind==='projection')||!Number.isFinite(w)||w<0||w>100)throw new Error('Invalid projection source weight (0–100).');
 if(config.gpSource!=='blend'&&!sources.some(s=>s.id===config.gpSource&&s.kind==='projection'))throw new Error('Missing GP source.');
 if(STAT_KEYS.some(k=>!Number.isFinite(config.scoring[k])||Math.abs(config.scoring[k])>100)||STAT_KEYS.every(k=>config.scoring[k]===0))throw new Error('Scoring values must be between −100 and 100, with at least one nonzero value.');
}
export function nameMatches(state,room,sourceId){return room?.aliases?.[sourceId]??state.aliases?.[sourceId]??{};}
export function canonicalId(state,source,player,room){return player.canonicalPlayerId||nameMatches(state,room,source.id)[player.id]||player.id;}
export function activeAdp(state,room){
 const source=state.sources.find(s=>s.id===room.adpSource&&s.kind==='adp'&&(s.platform===room.platform||s.platform==='All'));
 return {source,byPlayer:new Map((source?.players||[]).map(p=>[canonicalId(state,source,p,room),p]))};
}
export function platformPosition(player,adp,source){
 const pos=adp?.pos?.length===1?adp.pos:null;
 return pos?{...player,pos:[...pos],posRaw:pos[0],positionSource:source.id}:{...player,positionSource:null};
}
export function buildConsensus(state,room){
 const market=activeAdp(state,room);
 const config=room.projections||projectionDefaults(room.platform),sources=state.sources.filter(s=>s.kind==='projection'),active=sources.filter(s=>(config.weights[s.id]||0)>0);
 const sourcesById=new Map(sources.map(s=>[s.id,s]));
 const catalog=new Map();for(const s of state.sources)for(const p of s.players){const id=canonicalId(state,s,p,room);if(!catalog.has(id)||s.kind==='ranking')catalog.set(id,p);}
 const byPlayer=new Map();for(const source of active)for(const p of source.players){const id=canonicalId(state,source,p,room);if(!byPlayer.has(id))byPlayer.set(id,[]);byPlayer.get(id).push({source,player:p,weight:config.weights[source.id]});}
 const gpByPlayer=new Map();const gpSource=sourcesById.get(config.gpSource);if(gpSource)for(const p of gpSource.players)gpByPlayer.set(canonicalId(state,gpSource,p,room),p.gp);
 const ranking=state.sources.find(s=>s.id===room.rankSource),rankById=new Map((ranking&&!ranking.demo?ranking.players:[]).map(p=>[canonicalId(state,ranking,p,room),p]));
 const totalWeight=active.reduce((sum,s)=>sum+config.weights[s.id],0);
 const rows=[...byPlayer.entries()].map(([id,contributions])=>{
  const primary=catalog.get(id)||contributions[0].player,rankPlayer=rankById.get(id);
  const metadata=[rankPlayer,...contributions.map(c=>c.player),primary].filter(Boolean);
  const eligibility=metadata.find(p=>p.pos.length),stats={},statCoverage={};
  const blend=field=>{const values=contributions.filter(c=>Number.isFinite(field==='gp'?c.player.gp:c.player.stats?.[field]));const weight=values.reduce((a,c)=>a+c.weight,0);return {value:weight?values.reduce((sum,c)=>sum+c.weight*(field==='gp'?c.player.gp:c.player.stats[field]),0)/weight:null,weight};};
  for(const k of STAT_KEYS){const b=blend(k);stats[k]=b.value;statCoverage[k]=totalWeight?b.weight/totalWeight:0;}
  const gp=config.gpSource==='blend'?blend('gp').value:gpByPlayer.get(id)??null;
  const missing=[],omitted=[];let fp=0;
  for(const k of STAT_KEYS)if(config.scoring[k]!==0){if(stats[k]===null){if(config.ignoreMissingBonuses&&['DD','TD'].includes(k))omitted.push(k);else missing.push(k);}else fp+=stats[k]*config.scoring[k];}
  const issues=[...missing.map(k=>`Missing ${k}`)];if(config.gpPenalty>0&&gp===null)issues.push('Missing GP');if(gp!==null&&gp>config.games)issues.push('GP exceeds scheduled games');if(gp===0)issues.push('No projected games');
  const rawFp=missing.length?null:fp,penalty=gp===null?0:(config.gpPenalty/100)*Math.max(0,1-gp/config.games);
  // Subtract a fraction of magnitude so negative fantasy scores never improve with a GP penalty.
  const adjusted=issues.length?null:fp-Math.abs(fp)*penalty;
  return {id,name:primary.name,rank:rankPlayer?.rank??null,adp:rankPlayer?.adp??primary.adp??null,pos:eligibility?.pos||[],posRaw:eligibility?.posRaw||'',team:metadata.find(p=>p.team)?.team||'',stats,gp,rawFp,adjusted,penalty,issues,missing,omitted,statCoverage,coverage:totalWeight?contributions.reduce((sum,c)=>sum+c.weight,0)/totalWeight:0,sourceCount:contributions.length,contributions:contributions.map(c=>({id:c.source.id,name:c.source.name,weight:c.weight,player:c.player})),consensusRank:null};
 });
 const ranked=rows.filter(p=>p.adjusted!==null).sort((a,b)=>b.adjusted-a.adjusted||b.rawFp-a.rawFp||a.name.localeCompare(b.name));ranked.forEach((p,i)=>p.consensusRank=i+1);
 return [...ranked,...rows.filter(p=>p.adjusted===null).sort((a,b)=>a.name.localeCompare(b.name))].map(p=>platformPosition(p,market.byPlayer.get(p.id),market.source));
}
