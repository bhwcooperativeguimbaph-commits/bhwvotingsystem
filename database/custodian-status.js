'use strict';
// Restricted read-only custodian delivery/confirmation status. Never project
// shareHash, private-key material, or provider message contents to the browser.
async function getCustodianDeliveryStatus(db,electionId){
 if(typeof electionId!=='string'||!/^ELEC-[a-f0-9-]{36}$/i.test(electionId))
  throw new TypeError('Invalid election ID');
 const exists=await db.collection('elections').findOne({electionId},
  {projection:{_id:0,electionId:1,keyProvisioningState:1,keyDeliveryConfirmed:1}});
 if(!exists)return null;
 const records=await db.collection('keyCustodians').find({electionId},{
  projection:{_id:0,shareIndex:1,email:1,status:1,deliveryAcceptedAt:1,confirmedAt:1},
  sort:{shareIndex:1}
 }).toArray();
 return {
  electionId,provisioning:exists.keyProvisioningState||'Not started',
  bothConfirmed:exists.keyDeliveryConfirmed===true,
  custodians:records.map(x=>({
   shareIndex:x.shareIndex,email:x.email,status:x.status,
   providerAcceptedAt:x.deliveryAcceptedAt||null,confirmedAt:x.confirmedAt||null
  }))
 };
}
module.exports={getCustodianDeliveryStatus};
