// One-time idempotent migration of legacy plaintext biometric rows to AES-256-GCM.
// Run only after backing up MySQL and setting BIOMETRIC_KEY in .env.
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const keyHex = process.env.BIOMETRIC_KEY || '';
if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) { console.error('BIOMETRIC_KEY must contain exactly 64 hex characters.');process.exit(1); }
const key = Buffer.from(keyHex,'hex');
function seal(value) {
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return `enc:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${bytes.toString('base64')}`;
}
(async()=>{
 const db=await mysql.createConnection({host:process.env.DB_HOST||'localhost',user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'voting_system'});
 try {
  await db.beginTransaction();
  const [rows]=await db.query('SELECT biometric_id,facial_encoding,facial_image FROM BIOMETRIC_REGISTRATION FOR UPDATE');
  let modified=0;
  for(const row of rows){
   const updates=[], values=[];
   for(const field of ['facial_encoding','facial_image']){
    const raw=row[field];if(raw===null)continue;
    const txt=Buffer.isBuffer(raw)?raw.toString('utf8'):String(raw);
    if(txt.startsWith('enc:v1:')) continue;
    if(field==='facial_encoding'){
       const parsed=JSON.parse(txt);
       if(!Array.isArray(parsed)||parsed.length!==128||!parsed.every(Number.isFinite)) throw new Error('Invalid descriptor in '+row.biometric_id);
    }
    updates.push(`${field}=?`);values.push(seal(txt));
   }
   if(updates.length){ values.push(row.biometric_id);await db.query(`UPDATE BIOMETRIC_REGISTRATION SET ${updates.join(',')} WHERE biometric_id=?`,values);modified++; }
  }
  await db.commit();console.log(`Encrypted records: ${modified}. Existing encrypted records were left unchanged.`);
 }catch(err){await db.rollback();console.error('Migration rolled back:',err.message);process.exitCode=1;}
 finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
