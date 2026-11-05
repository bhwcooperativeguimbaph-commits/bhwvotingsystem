'use strict';
const crypto=require('node:crypto');
const {normalizeWords,wordsToEntropy}=require('./custodian-mnemonic');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function confirmCustodianShare(db,{electionId,shareIndex,share}){
 if(!/^ELEC-[0-9a-f-]{36}$/i.test(electionId||'')||![1,2].includes(shareIndex)||
    typeof share!=='string'||share.length>10000)return false;
 const record=await db.collection('keyCustodians').findOne({electionId,shareIndex});
 if(!record)return false;
 let value;
 if(/^BHW[12]\./.test(share)){
  value=share.trim();
  if(!new RegExp('^BHW'+shareIndex+'\\.[a-f0-9]{20}\\.[A-Za-z0-9_-]+$').test(value)||
    record.fingerprint!==value.split('.')[1])return false;
 }else{
  try{
   value=normalizeWords(share);
   const bytes=wordsToEntropy(value);bytes.fill(0);
  }catch(_){return false}
 }
 if(record.shareHash!==hash(value))return false;
 await db.collection('keyCustodians').updateOne(
  {_id:record._id,status:{$in:['Sent','Confirmed']}},{$set:{status:'Confirmed',confirmedAt:new Date()}});
 const confirmed=await db.collection('keyCustodians').countDocuments({electionId,status:'Confirmed'});
 if(confirmed===2)await db.collection('elections').updateOne({
  electionId,keyProvisioningState:'Ready',keyFingerprint:record.fingerprint
 },{$set:{keyDeliveryConfirmed:true}});
 return true;
}
module.exports={confirmCustodianShare};
