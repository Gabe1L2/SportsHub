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
 const matches=Object.fromEntries(Object.entries(nameMatches(state,room,oldId)).filter(([from])=>names.has(from)));
 const ids=source.players.map(p=>matches[p.id]||p.id);
 if(new Set(ids).size!==ids.length)throw new Error('Carried name matches would combine two rows. Review the new names before replacing this source.');
 state.sources.push({...source,replaces:oldId});old.archived=true;
 room.aliases??={};room.aliases[source.id]=matches;
 if(source.kind==='projection'){
  room.projections??=projectionDefaults(room.platform);
  room.projections.weights[source.id]=room.projections.weights[oldId]||0;
  room.projections.weights[oldId]=0;
  if(room.projections.gpSource===oldId)room.projections.gpSource=source.id;
 }else if(source.kind==='ranking')room.rankSource=source.id;
 else if(source.platform===room.platform||source.platform==='All')room.adpSource=source.id;
 return Object.keys(matches).length;
}
export function deleteBlockers(state,id){
 const rooms=state.rooms.filter(r=>sourceRoles(r,id).length).map(r=>r.name);
 const surviving=new Set(state.sources.filter(s=>s.id!==id).flatMap(s=>s.players.map(p=>p.id)));
 const lostTargets=new Set();
 for(const aliases of [state.aliases,...state.rooms.map(r=>r.aliases)])for(const [sourceId,matches] of Object.entries(aliases||{}))if(sourceId!==id)for(const target of Object.values(matches))if(!surviving.has(target))lostTargets.add(target);
 return {rooms,linkedNames:lostTargets.size};
}
export function deleteSource(state,id){
 const blockers=deleteBlockers(state,id);
 if(blockers.rooms.length||blockers.linkedNames)throw new Error('This source is still used by a saved draft or name match. Archive it instead.');
 state.sources=state.sources.filter(s=>s.id!==id);
 if(state.aliases)delete state.aliases[id];
 for(const room of state.rooms){if(room.aliases)delete room.aliases[id];if(room.projections)delete room.projections.weights[id];}
}
