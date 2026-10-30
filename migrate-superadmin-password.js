// One-time setup or upgrade from the earlier plaintext Super Admin password.
// Run: node --env-file=.env migrate-superadmin-password.js
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const password = process.env.NEW_SUPERADMIN_PASSWORD;
if (!password || password.length < 12 || password.length > 256) {
  console.error('Set NEW_SUPERADMIN_PASSWORD to a unique 12+ character password in .env first.');
  process.exit(1);
}
(async () => {
  const conn = await mysql.createConnection({host:process.env.DB_HOST||'localhost',user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'voting_system'});
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = `scrypt$${salt}$${crypto.scryptSync(password,salt,64).toString('hex')}`;
    const [rows] = await conn.query("SELECT admin_id FROM ADMIN WHERE admin_id='SUPERADMIN'");
    if (rows.length) await conn.query("UPDATE ADMIN SET password_hash=?,status='Active' WHERE admin_id='SUPERADMIN'",[hash]);
    else await conn.query("INSERT INTO ADMIN (admin_id,full_name,username,password_hash,role,status) VALUES ('SUPERADMIN','Master System','ADMIN',?,'superadmin','Active')",[hash]);
    console.log('Super Admin password successfully set. Remove NEW_SUPERADMIN_PASSWORD from .env after running this tool.');
  } finally {await conn.end();}
})().catch(e=>{console.error('Migration failed:',e.message);process.exitCode=1;});
