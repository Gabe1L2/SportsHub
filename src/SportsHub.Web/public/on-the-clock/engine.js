import {lookAhead,GUIDANCE_DEFAULTS} from './lookahead.js';
import {buildConsensus,STAT_KEYS,validateProjectionConfig,projectionDefaults,activeAdp,platformPosition} from './projections.js';
export const GROUPS = ['G','F','C'];
export const key = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export function positions(value) {
  const aliases = {PG:'G',SG:'G',G:'G',GUARD:'G',SF:'F',PF:'F',F:'F',FORWARD:'F',W:'F',WING:'F',C:'C',CENTER:'C'};
  return [...new Set(String(value||'').toUpperCase().split(/[^A-Z]+/).map(p=>aliases[p]).filter(Boolean))];
}
export function snakeTeam(pick,teams) {
  const r = Math.floor((pick-1)/teams), i = (pick-1)%teams;
  return r%2===0 ? i+1 : teams-i;
}
export function nextMine(room,after=room.picks.length) {
  for(let p=after+1;p<=room.config.teams*room.config.rounds;p++) if(snakeTeam(p,room.config.teams)===room.config.slot) return p;
  return null;
}
export function parseTable(raw) {
  raw = String(raw).replace(/^\uFEFF/,'').trim();
  if(!raw) throw new Error('Paste a table or choose a CSV / TSV file first.');
  const lines = raw.split(/\r?\n/).filter(l=>l.trim());
  let rows;
  if(lines[0].includes('|')) {
    rows=lines.map(l=>l.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(x=>x.trim())).filter(r=>!r.every(v=>/^:?-+:?$/.test(v)));
  } else {
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    rows=[]; let row=[],cell='',quoted=false;
    for(let i=0;i<raw.length;i++) {
      const ch=raw[i];
      if(ch==='"') {if(quoted&&raw[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
      else if(ch===delimiter&&!quoted){row.push(cell.trim());cell='';}
      else if(ch==='\n'&&!quoted){row.push(cell.trim());if(row.some(Boolean)) rows.push(row);row=[];cell='';}
      else if(ch!=='\r') cell+=ch;
    }
    if(quoted) throw new Error('A quoted CSV field is not closed. Check the pasted data.');
    row.push(cell.trim()); if(row.some(Boolean)) rows.push(row);
  }
  if(rows.length<2) throw new Error('Include a header row and at least one player.');
  if(rows.length>2001) throw new Error('Please import no more than 2,000 players at once.');
  const headers=rows.shift();
  const aliases={name:['player','name','playername','athlete','fullname'],rank:['rank','ranking','rk','overallrank','overall','rnk','r'],adp:['adp','averageposition','averagedraftposition','avgpick'],pos:['pos','position','positions','eligibility'],team:['team','tm','club']};
  const mapping=Object.fromEntries(Object.entries(aliases).map(([field,names])=>[field,headers.findIndex(h=>names.includes(key(h)))]));
  return {headers,rows,mapping};
}
export function normalizeImport(table,mapping,kind) {
  if(mapping.name<0) throw new Error('Map the player name column.');
  if(kind==='ranking'&&mapping.rank<0) throw new Error('Map a source rank column. Original ranks are required.');
  if(kind==='adp'&&mapping.adp<0) throw new Error('Map an ADP column.');
  const players=[],errors=[],warnings=[],seen=new Set();
  table.rows.forEach((r,i)=>{
    const get=f=>mapping[f]>=0 ? (r[mapping[f]]||'').trim() : '';
    const name=get('name'),id=key(name);
    if(!id){errors.push(`Row ${i+2}: missing player name.`);return;}
    if(seen.has(id)){errors.push(`Row ${i+2}: duplicate player ${name}.`);return;}
    const num=(v)=>v===''||/^(n\/?a|—|-|null)$/i.test(v) ? null : Number(v.replace(/,/g,''));
    const rank=num(get('rank')),adp=num(get('adp'));
    if((kind==='ranking'&&rank===null)||(rank!==null&&(!Number.isFinite(rank)||rank<=0))){errors.push(`Row ${i+2}: ${name} needs a positive numeric rank.`);return;}
    if((kind==='adp'&&adp===null)||(adp!==null&&(!Number.isFinite(adp)||adp<=0))){errors.push(`Row ${i+2}: ${name} needs a positive numeric ADP.`);return;}
    seen.add(id);
    const posRaw=get('pos'),pos=positions(posRaw);
    if(kind==='adp'&&posRaw&&!/^(G|F|C|W|PG|SG|SF|PF|GUARD|FORWARD|WING|CENTER)$/i.test(posRaw)){errors.push(`Row ${i+2}: ${name} needs one platform position: G, F or C (W is treated as F).`);return;}
    if(kind==='adp'&&mapping.pos>=0&&!posRaw)warnings.push(`${name}: no platform position; ranking or projection eligibility will be used.`);
    if(kind==='ranking'&&!pos.length) warnings.push(`${name}: no recognized position. Use G/F/C or PG/SG/SF/PF/C.`);
    players.push({id,name,rank,adp,pos,posRaw,team:get('team')});
  });
  return {players,errors,warnings};
}
export function allocate(roster,targets) {
  // Maximum bipartite matching: a multi-eligible player fills only one target slot.
  const slots=GROUPS.flatMap(g=>Array.from({length:targets[g]},()=>g)),assigned=Array(slots.length).fill(-1);
  function visit(pi,seen) {
    for(let si=0;si<slots.length;si++) if(roster[pi].pos.includes(slots[si])&&!seen.has(si)) {
      seen.add(si);
      if(assigned[si]<0||visit(assigned[si],seen)){assigned[si]=pi;return true;}
    }
    return false;
  }
  roster.forEach((_,i)=>visit(i,new Set()));
  const groups=Object.fromEntries(GROUPS.map(g=>[g,[]])); const used=new Set();
  assigned.forEach((pi,si)=>{if(pi>=0){groups[slots[si]].push(roster[pi]);used.add(pi);}});
  const flex=roster.filter((_,i)=>!used.has(i));
  const deficits=Object.fromEntries(GROUPS.map(g=>[g,Math.max(0,targets[g]-groups[g].length)]));
  return {groups,flex,deficits,filled:used.size};
}
export function allocateBestBallLineup(roster) {
  const slots=['G','G','F','F','C','X'],assigned=Array(slots.length).fill(-1);
  function eligible(player,slot){return slot==='X'?player.pos.length>0:player.pos.includes(slot);}
  function visit(pi,seen){
    for(let si=0;si<slots.length;si++)if(eligible(roster[pi],slots[si])&&!seen.has(si)){
      seen.add(si);
      if(assigned[si]<0||visit(assigned[si],seen)){assigned[si]=pi;return true;}
    }
    return false;
  }
  roster.forEach((_,i)=>visit(i,new Set()));
  return {filled:assigned.filter(i=>i>=0).length};
}
export function poolFor(state,room) {
  const ranking=state.sources.find(s=>s.id===room.rankSource);
  const {source:adpSource,byPlayer:adps}=activeAdp(state,room);
  const players=room.orderMode==='consensus'?buildConsensus(state,room):(ranking?.players||[]).map(p=>({...p,id:p.canonicalPlayerId||p.id}));
  return players.map(p=>{const market=adps.get(p.id),adp=adpSource?market?.adp??null:p.adp,rank=room.orderMode==='consensus'?p.consensusRank:p.rank;return {...platformPosition(p,market,adpSource),adp,adpGap:Number.isFinite(adp)&&Number.isFinite(rank)?adp-rank:null};});
}
export function analysis(state,room) {
  const pool=poolFor(state,room),picked=new Set(room.picks.filter(p=>p.player).map(p=>p.player.id));
  const poolById=new Map(pool.map(p=>[p.id,p])),market=activeAdp(state,room);
  const roster=room.picks.filter(p=>p.team===room.config.slot&&p.player).map(({player})=>{const current=poolById.get(player.id);return platformPosition({...player,pos:current?.pos||player.pos,posRaw:current?.posRaw??player.posRaw},market.byPlayer.get(player.id),market.source);});
  const mineCount=room.picks.filter(p=>p.team===room.config.slot).length,remaining=room.config.rounds-mineCount;
  const fit=allocate(roster,room.config.targets),lineupFit=allocateBestBallLineup(roster),pick=room.picks.length+1;
  const myPick=nextMine(room),following=myPick===null ? null : nextMine(room,myPick);
  const available=pool.filter(p=>!picked.has(p.id));
  const {candidates,guidance}=lookAhead({pool,available,roster,fit,lineupFit,room,pick,myPick,following,allocate,allocateBestBallLineup});
  const shortages=GROUPS.map(g=>{
    const supply=available.filter(p=>p.pos.includes(g)).length,need=fit.deficits[g];
    return {group:g,need,supply,critical:need>0&&(supply<need||Object.values(fit.deficits).reduce((a,b)=>a+b,0)>=remaining),thin:need>0&&supply<=need*2};
  });
  return {pool,roster,fit,lineupFit,pick,myPick,following,available,candidates,guidance,remaining,shortages,mineCount,complete:pick>room.config.teams*room.config.rounds};
}
export function recordPick(room,player) {
  if(room.picks.length>=room.config.teams*room.config.rounds) throw new Error('This draft is complete.');
  if(player&&room.picks.some(p=>p.player?.id===player.id)) throw new Error('That player has already been drafted.');
  const pick=room.picks.length+1;
  room.picks.push({pick,team:snakeTeam(pick,room.config.teams),player:player?structuredClone(player):null});room.redo=[];
}
export function undo(room){if(room.picks.length)room.redo.push(room.picks.pop());}
export function redo(room){if(room.redo.length)room.picks.push(room.redo.pop());}
export function validateConfig(config) {
  if(config.guidance&&(!Number.isFinite(config.guidance.spread)||config.guidance.spread<0||config.guidance.spread>100||!Number.isFinite(config.guidance.needBonus)||config.guidance.needBonus<0||config.guidance.needBonus>100))throw new Error('Draft uncertainty and roster bonus must be between 0 and 100.');
  for(const [field,min,max] of [['teams',2,30],['slot',1,config.teams],['rounds',1,50]]) if(!Number.isInteger(config[field])||config[field]<min||config[field]>max) throw new Error(`Invalid ${field}: use a whole number from ${min} to ${max}.`);
  for(const g of GROUPS) if(!Number.isInteger(config.targets[g])||config.targets[g]<0||config.targets[g]>config.rounds) throw new Error('Position targets must be whole numbers within the roster size.');
  if(Object.values(config.targets).reduce((a,b)=>a+b,0)>config.rounds) throw new Error('Position targets cannot exceed the roster size. Leave remaining spots as flex.');
  if(['rank','adp','need'].some(k=>!Number.isFinite(config.weights[k])||config.weights[k]<0||config.weights[k]>100)||Object.values(config.weights).every(v=>v===0)) throw new Error('Use weights between 0 and 100 with at least one above zero.');
}
export function validateBackup(data) {
  if(data?.version!==1||!Array.isArray(data.sources)||!Array.isArray(data.rooms)||!data.rooms.length) throw new Error('This is not an On the Clock backup.');
  const sourceIds=new Set();
  const canonicalId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  function validPlayer(p,sourceRow=false){return p&&typeof p.name==='string'&&typeof p.id==='string'&&(sourceRow?p.id===key(p.name):p.id===key(p.name)||canonicalId(p.id))&&(p.canonicalPlayerId===undefined||canonicalId(p.canonicalPlayerId))&&Array.isArray(p.pos)&&p.pos.every(g=>GROUPS.includes(g))&&(p.rank===null||Number.isFinite(p.rank)&&p.rank>0)&&(p.adp===null||Number.isFinite(p.adp)&&p.adp>0);}
  for(const s of data.sources){if(typeof s.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(s.id)||sourceIds.has(s.id)||typeof s.name!=='string'||typeof s.raw!=='string'||s.archived!==undefined&&typeof s.archived!=='boolean'||!['ranking','adp','projection'].includes(s.kind)||!['Underdog','DraftKings','All'].includes(s.platform)||!Array.isArray(s.players)||s.players.some(p=>!validPlayer(p,true))||new Set(s.players.map(p=>p.id)).size!==s.players.length)throw new Error('Invalid source in backup.');sourceIds.add(s.id);}
  const playerIds=new Set(data.sources.flatMap(s=>s.players.map(p=>p.id)));
  for(const s of data.sources)if(s.kind==='projection'){
    if(!['perGame','totals'].includes(s.basis)||s.players.some(p=>!p.stats||STAT_KEYS.some(k=>p.stats[k]!==null&&(!Number.isFinite(p.stats[k])||p.stats[k]<0))||p.gp!==null&&(!Number.isFinite(p.gp)||p.gp<0||p.gp>100)))throw new Error('Invalid projection stats in backup.');
  }
  function validateAliases(aliases){
    if(aliases===undefined)return;
    if(!aliases||typeof aliases!=='object'||Array.isArray(aliases))throw new Error('Invalid name matches.');
    for(const [sourceId,matches] of Object.entries(aliases)){
      const source=data.sources.find(s=>s.id===sourceId);if(!source||!matches||typeof matches!=='object'||Array.isArray(matches))throw new Error('Missing source for name matches.');
      for(const [from,to] of Object.entries(matches))if(!source.players.some(p=>p.id===from)||!playerIds.has(to))throw new Error('Invalid player name match.');
      const resolved=source.players.map(p=>matches[p.id]||p.id);if(new Set(resolved).size!==resolved.length)throw new Error('Two source players map to the same player.');
    }
  }
  validateAliases(data.aliases);
  if(data.draftDefaults!==undefined){
    if(!data.draftDefaults||typeof data.draftDefaults!=='object'||Array.isArray(data.draftDefaults)||Object.keys(data.draftDefaults).some(platform=>!['Underdog','DraftKings'].includes(platform)))throw new Error('Invalid saved draft defaults.');
    for(const [platform,setup] of Object.entries(data.draftDefaults)){
      if(!setup||typeof setup!=='object'||!setup.config?.targets||!setup.config?.weights||!['ranking','consensus'].includes(setup.orderMode))throw new Error(`Invalid ${platform} draft defaults.`);
      validateConfig(setup.config);validateAliases(setup.aliases);
      if(setup.projections)validateProjectionConfig(setup.projections,data.sources);
      if(setup.rankSource&&!sourceIds.has(setup.rankSource)||setup.adpSource&&!sourceIds.has(setup.adpSource))throw new Error('Missing source for saved draft defaults.');
    }
  }
  const roomIds=new Set();
  for(const r of data.rooms){
    if(!r||typeof r.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(r.id)||roomIds.has(r.id)||!['Underdog','DraftKings'].includes(r.platform)||typeof r.name!=='string'||r.archived!==undefined&&typeof r.archived!=='boolean'||!r.config?.targets||!r.config?.weights||!Array.isArray(r.picks)||!Array.isArray(r.redo)||!Array.isArray(r.watch)||r.watch.some(id=>typeof id!=='string'||!(/^[a-z0-9]+$/.test(id)||canonicalId(id))))throw new Error('Invalid draft room in backup.');
    validateConfig(r.config);validateAliases(r.aliases);roomIds.add(r.id);
    if(r.orderMode!==undefined&&!['ranking','consensus'].includes(r.orderMode))throw new Error('Invalid board mode.');
    if(r.projections)validateProjectionConfig(r.projections,data.sources);
    if(r.rankSource&&!sourceIds.has(r.rankSource)||r.adpSource&&!sourceIds.has(r.adpSource))throw new Error('Missing source in backup.');
    const picks=[...r.picks,...[...r.redo].reverse()],seen=new Set();
    if(picks.length>r.config.teams*r.config.rounds)throw new Error('Too many picks in backup.');
    picks.forEach((p,i)=>{if(p.pick!==i+1||p.team!==snakeTeam(i+1,r.config.teams)||p.player&&(!validPlayer(p.player)||seen.has(p.player.id)))throw new Error('Invalid or duplicate pick in backup.');if(p.player)seen.add(p.player.id);});
  }
  if(!roomIds.has(data.active))throw new Error('Missing active draft room.');
  return data;
}
export function ensureActiveRoom(data) {
  for(const room of data.rooms){
    let selected=data.sources.find(source=>source.id===room.adpSource&&source.kind==='adp'),replacement;
    while(selected?.archived&&(replacement=[...data.sources].reverse().find(source=>source.kind==='adp'&&!source.archived&&source.replaces===selected.id))){room.adpSource=replacement.id;selected=replacement;}
  }
  for(const setup of Object.values(data.draftDefaults||{})){
    let selected=data.sources.find(source=>source.id===setup.adpSource&&source.kind==='adp'),replacement;
    while(selected?.archived&&(replacement=[...data.sources].reverse().find(source=>source.kind==='adp'&&!source.archived&&source.replaces===selected.id))){setup.adpSource=replacement.id;selected=replacement;}
  }
  const current=data.rooms.find(r=>r.id===data.active&&!r.archived);
  if(current)return data;
  let next=data.rooms.find(r=>!r.archived);
  if(!next){const previous=data.rooms.find(r=>r.id===data.active)||data.rooms[0];next=newRoomFromDefaults(data,previous?.platform||'Underdog',previous);data.rooms.push(next);}
  data.active=next.id;
  return data;
}
export function rememberDraftDefaults(data,room) {
  data.draftDefaults??={};
  data.draftDefaults[room.platform]={orderMode:room.orderMode||'ranking',projections:structuredClone(room.projections||projectionDefaults(room.platform)),rankSource:room.rankSource||null,adpSource:room.adpSource||null,aliases:structuredClone(room.aliases||{}),config:structuredClone(room.config)};
}
export function newRoomFromDefaults(data,platform,fallback=null) {
  const setup=data.draftDefaults?.[platform]||(fallback?.platform===platform?fallback:[...data.rooms].reverse().find(room=>room.platform===platform));
  const supportsPlatform=source=>source.platform==='All'||source.platform===platform;
  const activeRankings=data.sources.filter(source=>source.kind==='ranking'&&!source.archived&&supportsPlatform(source));
  const activeAdp=data.sources.filter(source=>source.kind==='adp'&&!source.archived&&supportsPlatform(source));
  const savedRank=activeRankings.find(source=>source.id===setup?.rankSource);
  const rankSource=(savedRank&&!savedRank.demo?savedRank:activeRankings.find(source=>!source.demo)||savedRank||activeRankings[0])?.id||null;
  const adpSource=activeAdp.find(source=>source.id===setup?.adpSource)?.id||activeAdp[0]?.id||null;
  const next=newRoom(platform,rankSource,adpSource);
  if(setup){next.config=structuredClone(setup.config);next.aliases=structuredClone(setup.aliases||{});next.projections=structuredClone(setup.projections||projectionDefaults(platform));next.orderMode=setup.orderMode||'ranking';}
  return next;
}
export function newRoom(platform,rankSource=null,adpSource=null) {
  return {id:crypto.randomUUID(),platform,name:`${platform} draft`,orderMode:'ranking',projections:projectionDefaults(platform),rankSource,adpSource,picks:[],redo:[],watch:[],config:{guidance:{...GUIDANCE_DEFAULTS},teams:12,slot:2,rounds:16,targets:{G:5,F:5,C:3},weights:{rank:65,adp:20,need:15}}};
}
export function initialState() {
  const names=[['Nikola Jokić','C'],['Victor Wembanyama','C'],['Shai Gilgeous-Alexander','G'],['Luka Dončić','G'],['Giannis Antetokounmpo','F'],['Anthony Edwards','G'],['Cade Cunningham','G'],['Tyrese Haliburton','G'],['Anthony Davis','F/C'],['Jayson Tatum','F'],['Trae Young','G'],['Domantas Sabonis','C'],['Devin Booker','G'],['Stephen Curry','G'],['Donovan Mitchell','G'],['Alperen Şengün','C'],['Jalen Brunson','G'],['Karl-Anthony Towns','F/C'],['Kevin Durant','F'],['Scottie Barnes','F'],['Jalen Johnson','F'],['Evan Mobley','F/C'],['Paolo Banchero','F'],['LaMelo Ball','G'],['James Harden','G'],['Bam Adebayo','C'],['Franz Wagner','F'],['Jalen Williams','G/F'],['Jaren Jackson Jr.','F/C'],['Pascal Siakam','F'],['Jaylen Brown','G/F'],['De’Aaron Fox','G'],['Jamal Murray','G'],['Desmond Bane','G'],['Darius Garland','G'],['Josh Giddey','G'],['Derrick White','G'],['Jarrett Allen','C'],['Chet Holmgren','F/C'],['Myles Turner','C'],['Zach LaVine','G'],['Trey Murphy III','F'],['OG Anunoby','F'],['Mikal Bridges','F'],['Austin Reaves','G'],['Brandon Miller','F'],['Jalen Duren','C'],['Ivica Zubac','C'],['Nic Claxton','C'],['Rudy Gobert','C'],['Anfernee Simons','G'],['Immanuel Quickley','G'],['Jabari Smith Jr.','F'],['Naz Reid','F/C'],['Malik Monk','G'],['Norman Powell','G/F'],['Alex Sarr','C'],['Walker Kessler','C'],['Keegan Murray','F'],['Donte DiVincenzo','G']];
  const raw='Player,Rank,ADP,Position\n'+names.map(([n,p],i)=>`${n},${i+1},${(i+1+(i%5-2)*.4).toFixed(1)},${p}`).join('\n');
  const table=parseTable(raw),source={id:'demo',name:'Sample board · illustrative only',kind:'ranking',platform:'All',raw,created:new Date().toISOString(),demo:true,players:normalizeImport(table,table.mapping,'ranking').players};
  const room=newRoom('Underdog',source.id,null);
  return {version:1,sources:[source],rooms:[room],active:room.id};
}
