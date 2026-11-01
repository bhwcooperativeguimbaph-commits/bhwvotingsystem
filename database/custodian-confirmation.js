'use strict';
const crypto=require('node:crypto');
function hash(value){return crypto.createHash('sha256').update(value).digest('hex')}
async function confirmCustodianShare(db,{electionId,shareIndex,share}){
 if(!/^ELEC-[0-9a-f-]{36}$/i.test(electionId||'')||
    ![1,2].includes(shareIndex)||typeof share!=='string'||share.length>10000||
    !/^BHW[12]\.[a-f0-9]{20}\.[A-Za-z0-9_-]+$/.test(share))
  return false;
 const record=await db.collection('keyCustodians').findOne({electionId,shareIndex});
 if(!record||record.shareHash!==hash(share)||record.fingerprint!==share.split('.')[1])
  return false;
 await db.collection('keyCustodians').updateOne(
  {_id:record._id,status:{$in:['Sent','Confirmed']}},{$set:{status:'Confirmed',confirmedAt:new Date()}});
 const confirmations=await db.collection('keyCustodians').countDocuments({electionId,status:'Confirmed'});
 if(confirmations===2)await db.collection('elections').updateOne({
  electionId,keyProvisioningState:'Ready',keyFingerprint:record.fingerprint
 },{$set:{keyDeliveryConfirmed:true}});
 return true;
}
module.exports={confirmCustodianShare};
