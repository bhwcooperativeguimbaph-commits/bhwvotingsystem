'use strict';
// Pure validation before encrypted ballot persistence. Never log member choices.
function validateBallot(choices,candidates){
 if(!choices||typeof choices!=='object'||Array.isArray(choices))throw new TypeError('Invalid ballot');
 if(!Array.isArray(candidates)||!candidates.length)throw new TypeError('No candidates configured');
 const positions=new Map();
 for(const c of candidates){
  if(c.status!=='Active')continue;
  if(typeof c.position!=='string'||typeof c.candidateId!=='string'||!Number.isInteger(c.maxVotes)||c.maxVotes<1)
   throw new TypeError('Invalid candidate configuration');
  if(!positions.has(c.position))positions.set(c.position,{limit:c.maxVotes,ids:new Set()});
  const p=positions.get(c.position);
  if(p.limit!==c.maxVotes)throw new TypeError('Conflicting position voting limits');
  p.ids.add(c.candidateId);
 }
 if(!positions.size)throw new TypeError('No active candidates');
 const requested=Object.keys(choices);
 if(requested.some(p=>!positions.has(p)))throw new TypeError('Unknown ballot position');
 for(const [name,p] of positions){
  const values=choices[name];
  if(!Array.isArray(values)||values.length>p.limit||new Set(values).size!==values.length||
   values.some(id=>typeof id!=='string'||!p.ids.has(id)))
   throw new TypeError('Invalid selection for '+name);
 }
 return true;
}
module.exports={validateBallot};
