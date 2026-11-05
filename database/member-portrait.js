'use strict';
// Encrypt a consented enrollment portrait at rest. Never store a raw data URI.
// Portraits are served only to the authenticated owner or authorized staff,
// after decryption on the server. Never expose biometric recognition descriptors.
const crypto=require('node:crypto');
function decodePhoto(value){
 if(typeof value!=='string'||value.length>240000)throw new TypeError('Invalid member portrait');
 const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match)throw new TypeError('Portrait must be JPG or PNG');
 const raw=Buffer.from(match[2],'base64');
 if(raw.length<80||raw.length>150000)throw new TypeError('Portrait size must not exceed 150KB');
 const jpeg=raw[0]===255&&raw[1]===216&&raw[2]===255;
 const png=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(!(match[1]==='jpeg'?jpeg:png))throw new TypeError('Portrait signature does not match type');
 return {mime:match[1],raw};
}
function encryptPortrait(value,key){
 const parsed=decodePhoto(value);
 if(!Buffer.isBuffer(key)||key.length!==32)throw new TypeError('Invalid encryption key');
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([cipher.update(parsed.raw),cipher.final()]);
 return 'portrait:v1:'+parsed.mime+':'+iv.toString('base64')+':'+
  cipher.getAuthTag().toString('base64')+':'+ciphertext.toString('base64');
}
function decryptPortrait(value,key){
 if(!value)return null;
 if(typeof value!=='string'||!Buffer.isBuffer(key)||key.length!==32)throw new TypeError('Invalid encrypted portrait');
 const parts=value.split(':');
 if(parts.length!==6||parts[0]!=='portrait'||parts[1]!=='v1'||!['jpeg','png'].includes(parts[2]))throw new TypeError('Invalid encrypted portrait');
 const iv=Buffer.from(parts[3],'base64'),tag=Buffer.from(parts[4],'base64');
 if(iv.length!==12||tag.length!==16)throw new TypeError('Invalid portrait encryption');
 const dec=crypto.createDecipheriv('aes-256-gcm',key,iv);dec.setAuthTag(tag);
 const raw=Buffer.concat([dec.update(Buffer.from(parts[5],'base64')),dec.final()]);
 const photo='data:image/'+parts[2]+';base64,'+raw.toString('base64');
 decodePhoto(photo);
 return photo;
}
module.exports={decodePhoto,encryptPortrait,decryptPortrait};
