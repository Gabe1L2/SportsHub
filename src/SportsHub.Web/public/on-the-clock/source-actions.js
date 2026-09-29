import {nameMatches,projectionDefaults} from './projections.js';

export function sourceRoles(room,id){
 const roles=[];
 if(room.rankSource===id)roles.push('Ranking source');
 if(room.adpSource===id)roles.push('Active ADP');
 const weight=room.projections?.weights?.[id]||0;
 if(weight>0)roles.push(`Projection weight ${weight}`);
 if(room.projections?.gpSource===id)roles.push('GP source');
 return roles;
}
export function replaceSource(state,room,oldId,source){
 const old=state.sources.find(s=>s.id===oldId);
 if(!old||source.kind!==old.kind||source.platform!==old.platform)throw new Error('Replacement must have the same import type and platform.');
 if(state.sources.some(s=>s.id===source.id))throw new Error('A replacement needs a new source version.');
 const names=new Set(source.players.map(p=>p.id));
 const carriedMatches=target=>Object.fromEntries(Object.entries(nameMatches(state,target,oldId)).filter(([from])=>names.has(from)));
 const matches=carriedMatches(room),ids=source.players.map(p=>matches[p.id]||p.id);
 if(new Set(ids).size!==ids.length)throw new Error('Carried name matches would combine two rows. Review the new names before replacing this source.');
 state.sources.push({...source,replaces:oldId});old.archived=true;
 for(const target of state.rooms){
  const wasSelected=source.kind==='projection'?(target.projections?.weights?.[oldId]||0)>0||target.projections?.gpSource===oldId:source.kind==='ranking'?target.rankSource===oldId:target.adpSource===oldId;
  if(!wasSelected&&target!==room)continue;
  target.aliases??={};target.aliases[source.id]=carriedMatches(target);
  if(source.kind==='projection'){
   target.projections??=projectionDefaults(target.platform);
   target.projections.weights[source.id]=target.projections.weights[oldId]||0;
   target.projections.weights[oldId]=0;
   if(target.projections.gpSource===oldId)target.projections.gpSource=source.id;
  }else if(source.kind==='ranking')target.rankSource=source.id;
  else if(wasSelected||source.platform===target.platform||source.platform==='All')target.adpSource=source.id;
 }
 for(const setup of Object.values(state.draftDefaults||{})){
  if(source.kind==='projection'&&((setup.projections?.weights?.[oldId]||0)>0||setup.projections?.gpSource===oldId)){
   setup.projections.weights[source.id]=setup.projections.weights[oldId]||0;setup.projections.weights[oldId]=0;if(setup.projections.gpSource===oldId)setup.projections.gpSource=source.id;
  }else if(source.kind==='ranking'&&setup.rankSource===oldId)setup.rankSource=source.id;
  else if(source.kind==='adp'&&setup.adpSource===oldId)setup.adpSource=source.id;
 }
 return Object.keys(matches).length;
}
export function deleteBlockers(state,id){
 const rooms=state.rooms.filter(r=>sourceRoles(r,id).length).map(r=>r.name);
 const surviving=new Set(state.sources.filter(s=>s.id!==id).flatMap(s=>s.players.map(p=>p.id)));
 const lostTargets=new Set();
 for(const aliases of [state.aliases,...state.rooms.map(r=>r.aliases),...Object.values(state.draftDefaults||{}).map(setup=>setup.aliases)])for(const [sourceId,matches] of Object.entries(aliases||{}))if(sourceId!==id)for(const target of Object.values(matches))if(!surviving.has(target))lostTargets.add(target);
 return {rooms,linkedNames:lostTargets.size};
}
export function deleteSource(state,id){
 const blockers=deleteBlockers(state,id);
 if(blockers.rooms.length||blockers.linkedNames)throw new Error('This source is still used by a saved draft or name match. Archive it instead.');
 state.sources=state.sources.filter(s=>s.id!==id);
 if(state.aliases)delete state.aliases[id];
 for(const room of state.rooms){if(room.aliases)delete room.aliases[id];if(room.projections)delete room.projections.weights[id];}
 for(const setup of Object.values(state.draftDefaults||{})){if(setup.aliases)delete setup.aliases[id];if(setup.rankSource===id)setup.rankSource=null;if(setup.adpSource===id)setup.adpSource=null;if(setup.projections){delete setup.projections.weights[id];if(setup.projections.gpSource===id)setup.projections.gpSource='blend';}}
}
