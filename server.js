// server.js
const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const https = require('https');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.SMTP_USER || '', pass: process.env.SMTP_APP_PASSWORD || '' }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// MySQL Connection Pool Configuration
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'voting_system',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

let masterDecryptionKey = "";

// Initialize MySQL Schema (Expanded for Roadmap)
const initQueries = [
    // 1. Base Tables
    `CREATE TABLE IF NOT EXISTS ADMIN (
        admin_id VARCHAR(50) PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(100),
        role VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS VOTER (
        voter_id VARCHAR(50) PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(20),
        status VARCHAR(20) DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ELECTION (
        election_id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        description TEXT,
        start_datetime DATETIME,
        end_datetime DATETIME,
        status VARCHAR(20) DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    // 2. First-Level Dependent Tables
    `CREATE TABLE IF NOT EXISTS BIOMETRIC_REGISTRATION (
        biometric_id VARCHAR(50) PRIMARY KEY,
        voter_id VARCHAR(50) NULL,
        admin_id VARCHAR(50) NULL,
        bhw_id VARCHAR(50),
        facial_image LONGBLOB,
        facial_encoding LONGTEXT,
        biometric_status VARCHAR(20),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (voter_id) REFERENCES VOTER(voter_id) ON DELETE CASCADE,
        FOREIGN KEY (admin_id) REFERENCES ADMIN(admin_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS CANDIDATE (
        candidate_id VARCHAR(50) PRIMARY KEY,
        election_id VARCHAR(50) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        position VARCHAR(50) NOT NULL,
        platform TEXT,
        photo VARCHAR(255),
        status VARCHAR(20) DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (election_id) REFERENCES ELECTION(election_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS ELECTION_SCHEDULE (
        schedule_id VARCHAR(50) PRIMARY KEY,
        admin_id VARCHAR(50) NOT NULL,
        election_id VARCHAR(50) NOT NULL,
        action VARCHAR(50) NOT NULL,
        schedule_datetime DATETIME NOT NULL,
        remark TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES ADMIN(admin_id),
        FOREIGN KEY (election_id) REFERENCES ELECTION(election_id) ON DELETE CASCADE
    )`,
    // 3. Second-Level Dependent Tables
    `CREATE TABLE IF NOT EXISTS VOTE (
        vote_id VARCHAR(50) PRIMARY KEY,
        voter_id VARCHAR(50) NOT NULL,
        candidate_id VARCHAR(50) NOT NULL,
        election_id VARCHAR(50) NOT NULL,
        vote_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
        vote_hash VARCHAR(255) NOT NULL,
        encrypted_vote LONGTEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'Valid',
        FOREIGN KEY (voter_id) REFERENCES VOTER(voter_id),
        FOREIGN KEY (candidate_id) REFERENCES CANDIDATE(candidate_id),
        FOREIGN KEY (election_id) REFERENCES ELECTION(election_id)
    )`,
    `CREATE TABLE IF NOT EXISTS ELECTION_RESULT (
        result_id VARCHAR(50) PRIMARY KEY,
        election_id VARCHAR(50) NOT NULL,
        total_votes INT DEFAULT 0,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        encryption_status VARCHAR(50) NOT NULL,
        result_data LONGTEXT NOT NULL,
        result_hash VARCHAR(255) NOT NULL,
        FOREIGN KEY (election_id) REFERENCES ELECTION(election_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS RESULT_DISCLOSURE (
        rd_id VARCHAR(50) PRIMARY KEY,
        admin_id VARCHAR(50) NOT NULL,
        election_id VARCHAR(50) NOT NULL,
        is_disclosed BOOLEAN DEFAULT FALSE,
        scheduled_at DATETIME,
        disclosed_at DATETIME NULL,
        encryption_status VARCHAR(50),
        encrypted_result_key VARCHAR(255) NULL,
        remark TEXT,
        FOREIGN KEY (admin_id) REFERENCES ADMIN(admin_id),
        FOREIGN KEY (election_id) REFERENCES ELECTION(election_id) ON DELETE CASCADE
    )`,
    // 4. Third-Level Dependent Tables & Logs
    `CREATE TABLE IF NOT EXISTS RECEIPT_CODE (
        receipt_code_id VARCHAR(50) PRIMARY KEY,
        vote_id VARCHAR(50) NOT NULL,
        receipt_code VARCHAR(100) UNIQUE NOT NULL,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'Issued',
        FOREIGN KEY (vote_id) REFERENCES VOTE(vote_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS AUDIT_LOG (
        log_id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id VARCHAR(50) NULL,
        voter_id VARCHAR(50) NULL,
        action VARCHAR(150) NOT NULL,
        details TEXT,
        ip_address VARCHAR(45),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES ADMIN(admin_id),
        FOREIGN KEY (voter_id) REFERENCES VOTER(voter_id) ON DELETE SET NULL
    )`,
    // 5. Insert Default Super Admin
    `CREATE TABLE IF NOT EXISTS ADMIN_LOGIN_CHALLENGE (
        challenge_hash CHAR(64) PRIMARY KEY,
        code_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        attempts INT NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS PASSWORD_RESET_COOLDOWN (
        account_id VARCHAR(50) PRIMARY KEY,
        next_allowed DATETIME NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ADMIN_MFA_SEND_COOLDOWN (
        account_id VARCHAR(50) PRIMARY KEY,
        last_sent DATETIME(3) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ADMIN_ID_SEQUENCE (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY)`,
    `CREATE TABLE IF NOT EXISTS FINAL_ELECTION_REPORT (
        election_id VARCHAR(50) PRIMARY KEY,
        report_json LONGTEXT NOT NULL,
        report_hash CHAR(64) NOT NULL,
        finalized_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (election_id) REFERENCES ELECTION(election_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS MEMBER_NOTIFICATION (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        election_id VARCHAR(50) NOT NULL,
        candidate_id VARCHAR(50) NOT NULL,
        voter_id VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        read_at DATETIME NULL,
        UNIQUE KEY one_winner_notice (election_id, candidate_id, voter_id),
        INDEX member_inbox (voter_id, created_at),
        FOREIGN KEY (election_id) REFERENCES ELECTION(election_id) ON DELETE CASCADE,
        FOREIGN KEY (candidate_id) REFERENCES CANDIDATE(candidate_id),
        FOREIGN KEY (voter_id) REFERENCES VOTER(voter_id)
    )`,
    `CREATE TABLE IF NOT EXISTS MEMBER_INBOX_MESSAGE (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        election_id VARCHAR(50) NOT NULL,
        voter_id VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        read_at DATETIME NULL,
        UNIQUE KEY one_result_message_per_member (election_id, voter_id),
        INDEX inbox_member_created (voter_id, created_at),
        FOREIGN KEY (election_id) REFERENCES ELECTION(election_id) ON DELETE RESTRICT,
        FOREIGN KEY (voter_id) REFERENCES VOTER(voter_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS ELECTION_ANNOUNCEMENT (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        election_id VARCHAR(50) NOT NULL UNIQUE,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (election_id) REFERENCES ELECTION(election_id) ON DELETE RESTRICT
    )`,
    `CREATE TABLE IF NOT EXISTS MEMBER_ANNOUNCEMENT_READ (
        announcement_id BIGINT UNSIGNED NOT NULL,
        voter_id VARCHAR(50) NOT NULL,
        read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (announcement_id,voter_id),
        FOREIGN KEY (announcement_id) REFERENCES ELECTION_ANNOUNCEMENT(id) ON DELETE CASCADE,
        FOREIGN KEY (voter_id) REFERENCES VOTER(voter_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS AUTH_SESSION (
        token_hash CHAR(64) PRIMARY KEY, account_id VARCHAR(50) NOT NULL,
        role VARCHAR(30) NOT NULL, expires_at DATETIME NOT NULL,
        INDEX (expires_at)
    )`
];

// Execute table creation sequentially to prevent Foreign Key errors
async function initializeDatabase() {
    for (let i = 0; i < initQueries.length; i++) {
        try {
            await pool.promise().query(initQueries[i]);
        } catch (err) {
            console.error("DB Init Error:", err.sqlMessage || err.message);
        }
    }
    // Fail startup instead of falsely reporting success if essential V6 tables cannot be created.
    for (const table of ['ELECTION','CANDIDATE','KEY_CUSTODIAN','FINAL_ELECTION_REPORT','ELECTION_ANNOUNCEMENT','MEMBER_INBOX_MESSAGE']) {
        const [rows]=await pool.promise().query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
        if (!rows[0].n) throw new Error('Required database table is missing: '+table+'; check CREATE permissions and earlier DB Init Error output');
    }
    // Keep official announcements as permanent history until explicitly removed.
    // Older deployments used ON DELETE CASCADE; convert that FK so deleting an
    // election cannot silently erase published, verified announcements.
    try {
        const [foreignKeys] = await pool.promise().query(`
            SELECT k.CONSTRAINT_NAME, r.DELETE_RULE
            FROM information_schema.KEY_COLUMN_USAGE k
            JOIN information_schema.REFERENTIAL_CONSTRAINTS r
              ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
            WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='ELECTION_ANNOUNCEMENT'
              AND k.COLUMN_NAME='election_id' AND k.REFERENCED_TABLE_NAME='ELECTION'`);
        for (const fk of foreignKeys.filter(key => key.DELETE_RULE !== 'RESTRICT' && key.DELETE_RULE !== 'NO ACTION')) {
            if (!/^[A-Za-z0-9_]+$/.test(fk.CONSTRAINT_NAME)) throw Error('Unexpected foreign key identifier');
            await pool.promise().query(`ALTER TABLE ELECTION_ANNOUNCEMENT DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
            await pool.promise().query(`ALTER TABLE ELECTION_ANNOUNCEMENT
                ADD CONSTRAINT fk_announcement_election_restrict FOREIGN KEY (election_id)
                REFERENCES ELECTION(election_id) ON DELETE RESTRICT`);
        }
    } catch (err) { console.error('Announcement retention migration failed:', err.message); }
    // Enforce at most one ballot per member per election; never delete old ballots.
    try {
        const [uniqueIndexes] = await pool.promise().query(`
            SELECT INDEX_NAME FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='VOTE' AND NON_UNIQUE=0
            GROUP BY INDEX_NAME HAVING COUNT(*)=2
              AND SUM(COLUMN_NAME='voter_id')=1 AND SUM(COLUMN_NAME='election_id')=1`);
        if (!uniqueIndexes.length) await pool.promise().query(
            'ALTER TABLE VOTE ADD UNIQUE KEY unique_vote_per_election (election_id,voter_id)');
    } catch (err) { console.error('Unique per-election vote index migration failed; inspect historical duplicates:', err.message); }
    // Backfill announcement inbox only from pre-existing verified snapshots.
    // No encrypted votes are disclosed and no member/candidate matching occurs.
    try {
        const [snapshots]=await pool.promise().query('SELECT election_id,report_json,report_hash FROM FINAL_ELECTION_REPORT');
        for (const snapshot of snapshots) {
            if (crypto.createHash('sha256').update(snapshot.report_json).digest('hex')!==snapshot.report_hash) continue;
            let report; try {report=JSON.parse(snapshot.report_json);}catch(_){continue;}
            if (!Array.isArray(report.positions)) continue;
            const elected=report.positions.flatMap(p=>p.candidates.filter(c=>c.outcome==='Winner').map(c=>`${p.position}: ${c.name} (${c.votes} votes)`));
            const unresolved=report.positions.filter(p=>p.tieUnresolved).map(p=>p.position);
            const message=[elected.length?'Verified winner(s): '+elected.join('; '):'No confirmed winners have been declared.',unresolved.length?'Unresolved tie(s): '+unresolved.join(', ')+'. Contested seats remain unawarded.':'','These results were officially finalized and verified.'].filter(Boolean).join('\n');
            await pool.promise().query('INSERT IGNORE INTO ELECTION_ANNOUNCEMENT (election_id,title,message) VALUES (?,?,?)',[snapshot.election_id,`Final Election Results: ${report.title}`,message]);
        }
    } catch(e) {console.error('Announcement backfill:',e.message);}
    // Backfill account-specific inbox entries only for already verified announcements.
    // Every member has their own read state, even if the announcement is shared.
    try {
        await pool.promise().query(`INSERT IGNORE INTO MEMBER_INBOX_MESSAGE (election_id,voter_id,title,message,created_at,read_at)
            SELECT a.election_id,v.voter_id,a.title,a.message,a.created_at,r.read_at
            FROM ELECTION_ANNOUNCEMENT a CROSS JOIN VOTER v
            LEFT JOIN MEMBER_ANNOUNCEMENT_READ r ON r.announcement_id=a.id AND r.voter_id=v.voter_id
            INNER JOIN FINAL_ELECTION_REPORT f ON f.election_id=a.election_id`);
    } catch(e) { console.error('Member inbox backfill:',e.message); }
    const [[{ total }]] = await pool.promise().query("SELECT COUNT(*) AS total FROM ADMIN WHERE admin_id = 'SUPERADMIN'");
    if (!total) {
        if (!process.env.INITIAL_SUPERADMIN_PASSWORD || process.env.INITIAL_SUPERADMIN_PASSWORD.length < 12) {
            console.error('SECURITY SETUP: Set INITIAL_SUPERADMIN_PASSWORD (12+ characters) before first launch.');
        } else {
            await pool.promise().query(`INSERT INTO ADMIN (admin_id, full_name, username, password_hash, role) VALUES ('SUPERADMIN','Master System','ADMIN',?,'superadmin')`, [hashPassword(process.env.INITIAL_SUPERADMIN_PASSWORD)]);
        }
    }
    // Ensure schema is ready before accepting election deployments.
    const [maxColumn] = await pool.promise().query("SHOW COLUMNS FROM CANDIDATE LIKE 'max_votes'");
    if (!maxColumn.length) await pool.promise().query('ALTER TABLE CANDIDATE ADD COLUMN max_votes INT NOT NULL DEFAULT 1');
    const [photoColumn] = await pool.promise().query("SHOW COLUMNS FROM CANDIDATE LIKE 'photo'");
    if (photoColumn.length && !/longtext/i.test(photoColumn[0].Type)) await pool.promise().query('ALTER TABLE CANDIDATE MODIFY photo LONGTEXT');
    const [ballotColumn] = await pool.promise().query("SHOW COLUMNS FROM VOTE LIKE 'candidate_id'");
    if (ballotColumn.length && ballotColumn[0].Null !== 'YES') await pool.promise().query('ALTER TABLE VOTE MODIFY candidate_id VARCHAR(50) NULL');
    const [keyTable] = await pool.promise().query("SHOW TABLES LIKE 'KEY_CUSTODIAN'");
    if (!keyTable.length) await pool.promise().query(`CREATE TABLE KEY_CUSTODIAN
        (id INT AUTO_INCREMENT PRIMARY KEY, election_id VARCHAR(50), email VARCHAR(100), token VARCHAR(100))`);
    const [cols] = await pool.promise().query("SHOW COLUMNS FROM CANDIDATE LIKE 'member_id'");
    if (!cols.length) await pool.promise().query('ALTER TABLE CANDIDATE ADD COLUMN member_id VARCHAR(50) NULL');
    console.log("Database tables initialized successfully.");
}

const databaseReady = initializeDatabase().catch(err => {
    console.error('FATAL: Database initialization failed:', err);
    process.exitCode = 1;
    throw err;
});



function euclideanDistance(desc1, desc2) {
    if (desc1.length !== desc2.length) return Infinity;
    let sum = 0;
    for (let i = 0; i < desc1.length; i++) sum += Math.pow(desc1[i] - desc2[i], 2);
    return Math.sqrt(sum);
}

// Phase 3: authenticated ballot encryption for NEW votes. Legacy AES-CBC records
// remain readable for archival compatibility until a planned, audited migration.
function encryptVote(choice, key) {
    if (!key) throw new Error('Election encryption tokens are missing.');
    const validKey = crypto.createHash('sha256').update(key).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', validKey, iv);
    const ciphertext = Buffer.concat([cipher.update(choice, 'utf8'), cipher.final()]);
    return 'gcm1:' + iv.toString('hex') + ':' + cipher.getAuthTag().toString('hex') + ':' + ciphertext.toString('hex');
}
function decryptVote(encryptedChoice, key) {
    try {
        if (!key || typeof encryptedChoice !== 'string') return 'DECRYPTION_FAILED';
        const validKey = crypto.createHash('sha256').update(key).digest();
        if (encryptedChoice.startsWith('gcm1:')) {
            const parts = encryptedChoice.split(':');
            if (parts.length !== 4 || !/^[a-f0-9]{24}$/i.test(parts[1]) || !/^[a-f0-9]{32}$/i.test(parts[2]) || !/^(?:[a-f0-9]{2})+$/i.test(parts[3])) return 'DECRYPTION_FAILED';
            const decipher = crypto.createDecipheriv('aes-256-gcm', validKey, Buffer.from(parts[1], 'hex'));
            decipher.setAuthTag(Buffer.from(parts[2], 'hex'));
            return Buffer.concat([decipher.update(Buffer.from(parts[3], 'hex')), decipher.final()]).toString('utf8');
        }
        // For pre-upgrade vote records only; never create new CBC records.
        if (!/^(?:[a-f0-9]{2})+$/i.test(encryptedChoice)) return 'DECRYPTION_FAILED';
        const decipher = crypto.createDecipheriv('aes-256-cbc', validKey, Buffer.alloc(16, 0));
        return decipher.update(encryptedChoice, 'hex', 'utf8') + decipher.final('utf8');
    } catch (_) { return 'DECRYPTION_FAILED'; }
}

// Patch to ensure the Areas table exists
pool.query(`CREATE TABLE IF NOT EXISTS areas (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) UNIQUE)`, () => {});



// Phase 1 security: persisted opaque sessions, roles, CSRF origin gate and login throttling.
const secureCookie = process.env.COOKIE_SECURE === 'true'; // Set true behind HTTPS.
// Phase 2: AES-256-GCM encryption of biometric templates and captured photos.
// Keep BIOMETRIC_KEY out of source control. Back it up securely: losing it loses access to encrypted templates.
function biometricKey() {
    const hex = process.env.BIOMETRIC_KEY || '';
    if (!/^[a-fA-F0-9]{64}$/.test(hex)) throw new Error('BIOMETRIC_KEY must be 64 hex characters (32 bytes)');
    return Buffer.from(hex, 'hex');
}
function encryptBiometric(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', biometricKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
    return 'enc:v1:' + iv.toString('base64') + ':' + cipher.getAuthTag().toString('base64') + ':' + encrypted.toString('base64');
}
function decryptBiometric(value) {
    if (value == null) return null;
    const txt = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
    if (!txt.startsWith('enc:v1:')) return txt; // Legacy rows until the migration is run
    const parts = txt.split(':');
    if (parts.length !== 5) throw new Error('Invalid encrypted biometric data');
    const decipher = crypto.createDecipheriv('aes-256-gcm', biometricKey(),Buffer.from(parts[2],'base64'));
    decipher.setAuthTag(Buffer.from(parts[3],'base64'));
    return Buffer.concat([decipher.update(Buffer.from(parts[4],'base64')),decipher.final()]).toString('utf8');
}
function getDescriptor(value) {
    try { const d=JSON.parse(decryptBiometric(value)); return Array.isArray(d)&&d.length===128?d:null; }
    catch (e) { console.error('Biometric decryption failed:',e.message); return null; }
}
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
    if (typeof password !== 'string' || typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const expected = Buffer.from(parts[2], 'hex');
    if (expected.length !== 64) return false;
    return crypto.timingSafeEqual(expected, crypto.scryptSync(password, parts[1], 64));
}
const loginAttempts = new Map();
function throttle(req, res, next) {
    const key = req.ip + ':' + req.path;
    const now = Date.now();
    const record = loginAttempts.get(key) || { count: 0, until: now + 15 * 60000 };
    if (now > record.until) { record.count = 0; record.until = now + 15 * 60000; }
    if (record.count >= 8) return res.status(429).json({success:false,message:'Too many attempts. Try again later.'});
    record.count++; loginAttempts.set(key, record);
    next();
}
async function newSession(res, accountId, role) {
    const token = crypto.randomBytes(32).toString('hex');
    await pool.promise().query('INSERT INTO AUTH_SESSION (token_hash, account_id, role, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))', [hashToken(token),accountId,role]);
    res.cookie('bhw_session', token, {httpOnly:true,sameSite:'strict',secure:secureCookie,path:'/',maxAge:8*3600000});
}
function cookieToken(req) {
    const match = /(?:^|; )bhw_session=([0-9a-f]{64})(?:;|$)/.exec(req.headers.cookie || '');
    return match ? match[1] : null;
}
// Shared face matcher for pre-scan, login and the diagnostic test.
const FACE_MATCH_THRESHOLD = 0.42;
// Conservative buffer: if two identities score almost equally, do not guess.
// Tune using consented genuine/impostor evaluation samples, not arbitrary percentage claims.
const FACE_AMBIGUITY_MARGIN = 0.06;
const FACE_SELECT_SQL = `SELECT b.biometric_id, b.facial_encoding, b.facial_image, b.biometric_status,
    v.voter_id, v.full_name AS voter_name, v.status AS voter_status,
    (SELECT COUNT(*) FROM VOTE cv JOIN ELECTION ce ON ce.election_id=cv.election_id
     WHERE cv.voter_id = v.voter_id AND ce.status = 'Active'
       AND ce.start_datetime <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
       AND ce.end_datetime > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)) AS has_voted,
    a.admin_id, a.full_name AS admin_name, a.role, a.status AS admin_status
    FROM BIOMETRIC_REGISTRATION b
    LEFT JOIN VOTER v ON b.voter_id = v.voter_id
    LEFT JOIN ADMIN a ON b.admin_id = a.admin_id
    WHERE b.facial_encoding IS NOT NULL
      AND (v.voter_id IS NOT NULL OR a.admin_id IS NOT NULL)`;
function matchFace(records, descriptor, requireActive = true) {
    const candidates = [];
    for (const r of records) {
        if (requireActive && ((r.voter_id && r.voter_status !== 'Active') ||
            (r.admin_id && r.admin_status !== 'Active') ||
            (r.biometric_status && r.biometric_status !== 'Active'))) continue;
        const stored = getDescriptor(r.facial_encoding);
        if (!stored) continue;
        const distance = euclideanDistance(stored, descriptor);
        if (Number.isFinite(distance) && distance < FACE_MATCH_THRESHOLD) {
            candidates.push({ record: r, distance, identity: r.admin_id || r.voter_id });
        }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const first = candidates[0];
    const secondDifferent = candidates.find(c => first && c.identity !== first.identity);
    const ambiguous = !!(first && secondDifferent &&
        secondDifferent.distance - first.distance < FACE_AMBIGUITY_MARGIN);
    return { best: ambiguous ? null : (first?.record || null),
        distance: first?.distance ?? FACE_MATCH_THRESHOLD, ambiguous };
}
function validFaceDescriptor(descriptor) {
    return Array.isArray(descriptor) && descriptor.length === 128 && descriptor.every(Number.isFinite);
}
// Pre-scan intentionally does not disclose the person's name or account ID.
// It is only a preliminary match, NOT authentication or liveness verification.
app.post('/api/face-prescan', throttle, async (req, res) => {
    const { descriptor } = req.body || {};
    if (!validFaceDescriptor(descriptor)) return res.status(400).json({success:false,message:'Invalid face data.'});
    res.set('Cache-Control','no-store');
    try {
        const [records] = await pool.promise().query(FACE_SELECT_SQL);
        const {best, ambiguous} = matchFace(records, descriptor);
        if (ambiguous) return res.json({success:true,recognized:false,message:'Face match is ambiguous. Contact an administrator for identity review.'});
        if (!best) return res.json({success:true,recognized:false,message:'No active registered face found. Contact an administrator if you believe this is incorrect.'});
        if (best.role === 'superadmin') return res.json({success:true,recognized:false,message:'Super Admin must sign in using the password and MFA.'});
        return res.json({success:true,recognized:true,message:'Face recognized. Continue with the facial challenge.'});
    } catch (e) {
        console.error('Face pre-scan error:', e.message);
        return res.status(503).json({success:false,message:'Face verification temporarily unavailable.'});
    }
});

// One-use, short-lived login challenge. This is replay protection, NOT trusted PAD.
const faceChallenges = new Map();
const FACE_CHALLENGE_TTL_MS = 120_000;
app.post('/api/face-challenge', throttle, (req, res) => {
    const now = Date.now();
    for (const [k,v] of faceChallenges) if (v.expires < now) faceChallenges.delete(k);
    if (faceChallenges.size >= 1000) return res.status(503).json({success:false,message:'Challenge service busy.'});
    const id = crypto.randomBytes(24).toString('hex');
    const actions = crypto.randomInt(2) === 0 ? ['turn-left','turn-right','blink'] : ['turn-right','turn-left','blink'];
    faceChallenges.set(id,{actions, expires:now+FACE_CHALLENGE_TTL_MS, ip:req.ip});
    res.set('Cache-Control','no-store');
    res.json({success:true,challengeId:id,actions,expiresInSeconds:120});
});
const publicEndpoints = new Set(['/areas','/election-info','/election/active','/admin/login-password','/admin/login-otp','/login-face','/face-prescan','/face-challenge','/superadmin/request-reset','/superadmin/verify-reset','/superadmin/reset-status']);
app.use('/api', async (req,res,next) => {
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
        const origin = req.get('origin');
        const expected = `${req.protocol}://${req.get('host')}`;
        if (origin && origin !== expected) return res.status(403).json({success:false,message:'Cross-origin request rejected.'});
        if (req.method !== 'OPTIONS' && !req.is('application/json')) return res.status(415).json({success:false,message:'JSON content type required.'});
    }
    if (publicEndpoints.has(req.path) || req.path.startsWith('/geo/')) return next();
    const token = cookieToken(req);
    if (!token) return res.status(401).json({success:false,message:'Please log in.'});
    try {
        const [sessions] = await pool.promise().query('SELECT account_id, role FROM AUTH_SESSION WHERE token_hash=? AND expires_at > NOW()', [hashToken(token)]);
        if (!sessions.length) return res.status(401).json({success:false,message:'Session expired.'});
        const session = sessions[0];
        const isMember = session.role === 'member';
        const [accounts] = await pool.promise().query(isMember ? 'SELECT status FROM VOTER WHERE voter_id=?' : 'SELECT status FROM ADMIN WHERE admin_id=?', [session.account_id]);
        if (!accounts.length || accounts[0].status !== 'Active') return res.status(403).json({success:false,message:'Account disabled.'});
        req.auth = session;
        if (req.path === '/logout' || req.path === '/session') return next();
        if (req.path === '/vote' || req.path.startsWith('/member/notifications')) return isMember ? next() : res.status(403).json({success:false,message:'Voter access only.'});
        if (req.path === '/test-face') return ['admin','superadmin'].includes(session.role) ? next() : res.status(403).json({success:false,message:'Admin access only.'});
        if (req.path.startsWith('/superadmin/')) return session.role === 'superadmin' ? next() : res.status(403).json({success:false,message:'Super Admin only.'});
        if (req.path.startsWith('/admin/')) return ['admin','superadmin'].includes(session.role) ? next() : res.status(403).json({success:false,message:'Admin access only.'});
        return res.status(403).json({success:false,message:'Access denied.'});
    } catch (err) { console.error('Authorization error',err); res.status(503).json({success:false,message:'Authentication unavailable.'}); }
});
app.get('/api/session', (req,res) => {
    if (req.auth.role === 'member') return res.json({success:true,role:'member',memberId:req.auth.account_id});
    pool.query('SELECT full_name FROM ADMIN WHERE admin_id=?',[req.auth.account_id],(err,rows)=>{
        if (err || !rows?.length) return res.status(500).json({success:false});
        res.json({success:true,role:req.auth.role,memberId:req.auth.account_id,fullName:rows[0].full_name});
    });
});
app.post('/api/logout', async (req,res) => {
    // req.auth is populated by the authenticated API middleware. Only a genuine,
    // active Super Admin session can reset the mail send cooldowns.
    const token = cookieToken(req);
    const connection = await pool.promise().getConnection().catch(() => null);
    if (!connection) return res.status(503).json({success:false,message:'Logout temporarily unavailable.'});
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM AUTH_SESSION WHERE token_hash=? AND account_id=?',
            [hashToken(token),req.auth.account_id]);
        if (req.auth.account_id === 'SUPERADMIN' && req.auth.role === 'superadmin') {
            await connection.query("DELETE FROM ADMIN_MFA_SEND_COOLDOWN WHERE account_id='SUPERADMIN'");
            await connection.query("DELETE FROM PASSWORD_RESET_COOLDOWN WHERE account_id='SUPERADMIN'");
            // Previously issued reset codes are invalidated on logout to prevent
            // old emailed codes from being valid alongside a freshly issued code.
            await connection.query("UPDATE ADMIN SET reset_code=NULL,reset_expiry=NULL WHERE admin_id='SUPERADMIN'");
        }
        await connection.commit();
        res.clearCookie('bhw_session',{path:'/',sameSite:'strict',secure:secureCookie});
        res.clearCookie('bhw_pending_mfa',pendingMfaCookieOptions);
        res.set('Cache-Control','no-store');
        return res.json({success:true,emailCooldownReset:req.auth.role==='superadmin' && req.auth.account_id==='SUPERADMIN'});
    } catch(err) {
        await connection.rollback().catch(() => {});
        console.error('Logout failed:',err.message);
        return res.status(503).json({success:false,message:'Logout failed. Please retry.'});
    } finally {connection.release();}
});
// Offline Philippine address selector — reads the complete PSGC snapshot from ./data/geo-cache.
// Frontend /public/js/app.js uses these same API paths; no browser changes necessary.
const GEO_ROOT = path.join(__dirname, 'data', 'geo-cache');
app.get(['/api/geo/:level', '/api/geo/:level/:code'], (req, res) => {
    const {level, code} = req.params;
    const directories = {regions:'', provinces:'provinces', cities:'cities', regioncities:'regioncities', barangays:'barangays'};
    if (!Object.prototype.hasOwnProperty.call(directories, level) ||
        (level !== 'regions' && !/^[0-9]{6,12}$/.test(code || '')) ||
        (level === 'regions' && code !== undefined)) {
        return res.status(400).json({success:false,message:'Invalid location request.'});
    }
    const filename = level === 'regions' ? 'regions.json' : path.join(directories[level], `${code}.json`);
    try {
        // A completed manifest prevents silently using a partially downloaded hierarchy.
        if (!fs.existsSync(path.join(GEO_ROOT,'manifest.json'))) {
            return res.status(503).json({success:false,message:'Offline location data is not installed. Run node sync-locations.js on an internet-connected PC, then copy the data/geo-cache folder.'});
        }
        const json = JSON.parse(fs.readFileSync(path.join(GEO_ROOT,filename),'utf8'));
        if (!Array.isArray(json) || !json.every(row=>row && typeof row.code === 'string' && typeof row.name === 'string')) {
            throw new Error('Location file has invalid format');
        }
        res.json(json);
    } catch (error) {
        console.error('Local geographic data error:',filename,error.message);
        res.status(503).json({success:false,message:'Offline location files incomplete or damaged. Re-run the sync script and transfer the whole data/geo-cache folder.'});
    }
});

// --- AREA MANAGEMENT ROUTES ---
app.get('/api/areas', (req, res) => {
    pool.query(`SELECT * FROM areas ORDER BY name ASC`, (err, rows) => {
        res.json({ success: true, areas: rows || [] });
    });
});

app.post('/api/admin/areas', (req, res) => {
    const { name } = req.body;
    pool.query(`INSERT INTO areas (name) VALUES (?)`, [name], (err) => {
        if (err) return res.json({ success: false, message: 'Area already exists.' });
        logActivity('ADMIN', `Created new Area: ${name}`, req.ip);
        res.json({ success: true });
    });
});


// --- REGISTER NEW VOTER (DUPLICATE PREVENTION) ---
app.post('/api/admin/register-member', async (req, res) => {
    const { firstName, middleName = '', lastName, area, location, birthdate, gender, photoUrl, descriptor } = req.body || {};
    const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    const first = clean(firstName), middle = clean(middleName), last = clean(lastName);
    const fullName = [first, middle, last].filter(Boolean).join(' ');
    // Enrollment also requires a fresh, single-use challenge (not certified PAD).
    const registrationChallengeId = req.body?.challengeId;
    const enrollmentChallenge = typeof registrationChallengeId === 'string' ? faceChallenges.get(registrationChallengeId) : null;
    if (enrollmentChallenge) faceChallenges.delete(registrationChallengeId);
    if (!enrollmentChallenge || enrollmentChallenge.expires < Date.now() || enrollmentChallenge.ip !== req.ip ||
        !Array.isArray(req.body?.completedActions) ||
        JSON.stringify(req.body.completedActions) !== JSON.stringify(enrollmentChallenge.actions)) {
        return res.status(401).json({success:false,message:'Enrollment facial challenge expired or incomplete. Please retry.'});
    }
    const selectedArea = clean(area);
    const address = typeof req.body.address === 'string' ? req.body.address.trim() : '';
    if (!location || location.country !== 'Philippines' || !['regionCode','provinceCode','cityCode','barangayCode'].every(k => typeof location[k] === 'string' && location[k].length > 0) || address.length > 500 || !address || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate || '') || !['Male','Female'].includes(gender)) return res.status(400).json({success:false,message:'Complete all required address, birthdate, and gender fields.'});
    if (!first || !last || !selectedArea || fullName.length > 100 ||
        !Array.isArray(descriptor) || descriptor.length !== 128 ||
        !descriptor.every(x => typeof x === 'number' && Number.isFinite(x)) ||
        typeof photoUrl !== 'string' || !photoUrl.startsWith('data:image/jpeg;base64,')) {
        return res.status(400).json({ success: false, message: 'Valid first name, last name, area, and facial capture are required.' });
    }

    const connection = await pool.promise().getConnection().catch(() => null);
    if (!connection) return res.status(500).json({ success: false, message: 'Database unavailable.' });
    let enrollmentLocked = false;
    try {
        const [[lock]] = await connection.query("SELECT GET_LOCK('bhw_biometric_enrollment', 10) AS acquired");
        if (lock.acquired !== 1) return res.status(503).json({success:false,message:'Biometric registration is busy; retry shortly.'});
        enrollmentLocked = true;
        // Backward compatibility: legacy databases may not have the area column yet.
        const [columns] = await connection.query("SHOW COLUMNS FROM VOTER LIKE 'area'");
        if (!columns.length) await connection.query("ALTER TABLE VOTER ADD COLUMN area VARCHAR(100) DEFAULT 'N/A'");
        const [addrCols] = await connection.query("SHOW COLUMNS FROM VOTER LIKE 'address'");
        if (!addrCols.length) await connection.query('ALTER TABLE VOTER ADD COLUMN address TEXT');
        await connection.beginTransaction();
        const [names] = await connection.query('SELECT voter_id FROM VOTER WHERE full_name = ? LIMIT 1', [fullName]);
        if (names.length) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'A member with this exact name already exists.' });
        }
        const [faces] = await connection.query('SELECT facial_encoding FROM BIOMETRIC_REGISTRATION WHERE facial_encoding IS NOT NULL');
        for (const row of faces) {
            try {
                const stored = getDescriptor(row.facial_encoding);
                if (!stored) { await connection.rollback(); return res.status(409).json({success:false,message:'An existing biometric template is unreadable. Contact the system administrator before new enrollment.'}); }
                if (Array.isArray(stored) && stored.length === descriptor.length && euclideanDistance(stored, descriptor) < 0.42) {
                    await connection.rollback();
                    return res.status(409).json({ success: false, message: 'This face is already registered.' });
                }
            } catch (error) { throw error; }
        }
        const voterId = `COOPMEM${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const biometricId = `BIO${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
        await connection.query("INSERT INTO VOTER (voter_id, full_name, area, address, status) VALUES (?, ?, ?, ?, 'Active')", [voterId, fullName, selectedArea, address]);
        await connection.query(`INSERT INTO BIOMETRIC_REGISTRATION
            (biometric_id, voter_id, facial_image, facial_encoding, biometric_status)
            VALUES (?, ?, ?, ?, 'Active')`, [biometricId, voterId, encryptBiometric(photoUrl), encryptBiometric(JSON.stringify(descriptor))]);
        await connection.commit();
        logActivity('SUPERADMIN', 'Registered new member', req.ip, `ID: ${voterId}`);
        return res.json({ success: true, memberId: voterId });
    } catch (err) {
        await connection.rollback();
        console.error('Member registration failed:', err);
        return res.status(500).json({ success: false, message: 'Could not register member.' });
    } finally { if (enrollmentLocked) { try { await connection.query("SELECT RELEASE_LOCK('bhw_biometric_enrollment')"); } catch (e) { console.error('Enrollment lock release failed:', e.message); } } connection.release(); }
});

// --- DATABASE SCHEMA PATCHES FOR LARGE PHOTOS ---
// Candidate photo schema is initialized and awaited by initializeDatabase().
pool.query(`ALTER TABLE BIOMETRIC_REGISTRATION MODIFY facial_image LONGTEXT`, () => {});

app.post('/api/login-face', throttle, (req, res) => {
    const { descriptor } = req.body || {};
    if (!Array.isArray(descriptor) || descriptor.length !== 128 || !descriptor.every(Number.isFinite)) return res.status(400).json({ success: false, message: 'Invalid face data.' });

    // Consume the nonce atomically before any database lookup; no replay allowed.
    const challengeId = req.body?.challengeId;
    const ch = typeof challengeId === 'string' ? faceChallenges.get(challengeId) : null;
    if (ch) faceChallenges.delete(challengeId);
    if (!ch || ch.expires < Date.now() || ch.ip !== req.ip ||
        !Array.isArray(req.body?.completedActions) ||
        JSON.stringify(req.body.completedActions) !== JSON.stringify(ch.actions)) {
        return res.status(401).json({success:false,message:'Facial challenge expired or incomplete. Please retry.'});
    }
    // SECURITY LIMITATION: completedActions are asserted by browser JS, not trusted PAD.
    // A video replay or forged HTTP request can bypass them. Do not use this as an
    // independent proof of liveness or as production-grade voter identity assurance.
    const query = FACE_SELECT_SQL;

    pool.query(query, async (err, records) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error.' });
        
        const {best: bestMatch, ambiguous} = matchFace(records, descriptor);
        if (ambiguous) return res.status(409).json({success:false,message:"Multiple identities look similar to this scan. Contact an administrator for identity review."});
        if (!bestMatch) {
            return res.status(401).json({ success: false, message: 'Face not recognized in the system.' });
        }

        // Convert the database photo string securely
        let photoStr = null;
        try { photoStr = decryptBiometric(bestMatch.facial_image); } catch (e) { console.error('Photo decryption error',e.message); }

        // Handle Admin Match
        if (bestMatch.admin_id) {
            if (bestMatch.admin_status !== 'Active') return res.status(403).json({ success: false, message: 'Account Disabled.' });
            if (bestMatch.role === 'superadmin') return res.status(403).json({success:false,message:'Super Admin must use password login.'});
            await newSession(res,bestMatch.admin_id,bestMatch.role);
            logActivity(bestMatch.admin_id, 'Admin biometric login successful', req.ip);
            return res.json({ 
                success: true, role: bestMatch.role, memberId: bestMatch.admin_id, 
                firstName: bestMatch.admin_name.split(' ')[0], lastName: bestMatch.admin_name.split(' ')[1] || '',
                photoUrl: photoStr
            });
        }
        
        // Handle Voter Match
        if (bestMatch.voter_id) {
            if (bestMatch.voter_status !== 'Active') return res.status(403).json({ success: false, message: 'Account Disabled.' });
            await newSession(res,bestMatch.voter_id,'member');
            logActivity(bestMatch.voter_id, 'Voter biometric login successful', req.ip);
            return res.json({ 
                success: true, role: 'member', memberId: bestMatch.voter_id, 
                firstName: bestMatch.voter_name.split(' ')[0], lastName: bestMatch.voter_name.split(' ')[1] || '',
                photoUrl: photoStr, hasVoted: bestMatch.has_voted > 0
            });
        }
    });
});

// --- AUDIT LOG HELPER (FIXED FOR FOREIGN KEYS) ---
function logActivity(userId, action, ip, details = '') {
    let adminId = null;
    let voterId = null;

    // Strictly check if it's a valid ID, otherwise safely assign to SUPERADMIN
    if (userId === 'SUPERADMIN' || (userId.startsWith('ADMIN') && userId.length > 5)) {
        adminId = userId;
    } else if (userId && userId.startsWith('COOPMEM')) {
        voterId = userId;
    } else {
        adminId = 'SUPERADMIN'; // Fallback for 'SYSTEM' or 'ADMIN' texts to prevent FK crashes
    }

    pool.query(
        `INSERT INTO AUDIT_LOG (admin_id, voter_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?)`,
        [adminId, voterId, action, details, ip],
        (err) => {
            if (err) console.error("Audit Log Error:", err.sqlMessage || err);
        }
    );
}

// --- BIOMETRIC TEST: MATCH BOTH VOTERS AND ADMINISTRATORS ---
// Protected by the existing /api role middleware; this route never signs anyone in.
app.post('/api/test-face', (req, res) => {
    const { descriptor } = req.body || {};
    if (!Array.isArray(descriptor) || descriptor.length !== 128 || !descriptor.every(Number.isFinite)) {
        return res.status(400).json({ success: false, message: 'Invalid face descriptor.' });
    }

    const query = FACE_SELECT_SQL;
    pool.query(query, (err, records) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error.' });
        const {best: bestMatch, distance: lowestDistance, ambiguous} = matchFace(records, descriptor);
        if (ambiguous) return res.json({success:false,message:"Ambiguous face match. Multiple accounts are too close to distinguish confidently; do not use this scan to authenticate."});
        if (!bestMatch) {
            // Authorized administrative diagnostic only. Never reduce the login
            // threshold or expose account identity through unauthenticated endpoints.
            let readable = 0, unreadable = 0, inactive = 0, closest = Infinity;
            for (const record of records) {
                const stored = getDescriptor(record.facial_encoding);
                if (!stored) { unreadable++; continue; }
                readable++;
                const d = euclideanDistance(stored, descriptor);
                if (d < closest) closest = d;
                if ((record.voter_id && record.voter_status !== 'Active') ||
                    (record.admin_id && record.admin_status !== 'Active') ||
                    (record.biometric_status && record.biometric_status !== 'Active')) inactive++;
            }
            let message = 'No active matching identity. ';
            if (!records.length) message += 'No linked biometric records found.';
            else if (!readable) message += 'Stored biometric templates could not be read; verify BIOMETRIC_KEY and migration.';
            else if (closest < FACE_MATCH_THRESHOLD) message += 'Closest stored face belongs to an inactive account or biometric record.';
            else message += `Closest descriptor distance: ${closest.toFixed(4)} (required below ${FACE_MATCH_THRESHOLD}). Try even lighting and look straight at the camera.`;
            return res.json({success:false, message, diagnostic:{records:records.length,readable,unreadable,inactive}});
        }
        // A face embedding distance is not a calibrated confidence or accuracy percentage.
        return res.json({
            success: true,
            memberId: bestMatch.admin_id || bestMatch.voter_id,
            name: bestMatch.admin_id ? bestMatch.admin_name : bestMatch.voter_name,
            role: bestMatch.admin_id ? 'admin' : 'member',
            biometricId: bestMatch.biometric_id,
            distance: Number(lowestDistance.toFixed(4))
        });
    });
});


// --- FETCH MEMBERS DIRECTORY ---
app.get('/api/admin/members', (req, res) => {
    // Check if voter exists in the VOTE table to determine has_voted status
    const query = `
        SELECT 
            v.voter_id as member_id, 
            v.full_name, 
            v.area, 
            v.status as is_active,
            CASE WHEN EXISTS (
                SELECT 1 FROM VOTE cv JOIN ELECTION ce ON ce.election_id=cv.election_id
                WHERE cv.voter_id=v.voter_id AND ce.status='Active'
                AND ce.start_datetime <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
                AND ce.end_datetime > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
            ) THEN 1 ELSE 0 END as has_voted
        FROM VOTER v
        ORDER BY v.created_at DESC
    `;
    pool.query(query, (err, rows) => {
        if (err) return res.status(500).json({ success: false });
        // Format for frontend compatibility
        const formatted = rows.map(r => ({
            ...r,
            first_name: r.full_name, last_name: '', // Fallback for old UI
            is_active: r.is_active === 'Active' ? 1 : 0
        }));
        res.json({ success: true, members: formatted });
    });
});

// --- LIVE DASHBOARD MONITORING ---
app.get('/api/admin/monitoring', (req, res) => {
    pool.query(`
        SELECT 
            (SELECT COUNT(*) FROM VOTER WHERE status = 'Active') as totalMembers,
            (SELECT COUNT(DISTINCT cv.voter_id) FROM VOTE cv JOIN ELECTION ce ON ce.election_id=cv.election_id
             WHERE ce.status='Active' AND ce.start_datetime <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
             AND ce.end_datetime > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)) as totalVoted,
            (SELECT title FROM ELECTION WHERE status = 'Active' AND end_datetime > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR) ORDER BY created_at DESC LIMIT 1) as activeTitle,
            (SELECT DATE_FORMAT(start_datetime, '%Y-%m-%dT%H:%i:%s') FROM ELECTION WHERE status = 'Active' AND end_datetime > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR) ORDER BY created_at DESC LIMIT 1) as activeStart,
            (SELECT DATE_FORMAT(end_datetime, '%Y-%m-%dT%H:%i:%s') FROM ELECTION WHERE status = 'Active' AND end_datetime > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR) ORDER BY created_at DESC LIMIT 1) as activeEnd
    `, (err, rows) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ 
            success: true, 
            totalMembers: rows[0] ? rows[0].totalMembers : 0,
            totalVoted: rows[0] ? rows[0].totalVoted : 0,
            activeTitle: rows[0] ? rows[0].activeTitle : null,
            activeStart: rows[0] ? rows[0].activeStart : null,
            activeEnd: rows[0] ? rows[0].activeEnd : null
        });
    });
});

// --- AREA DEMOGRAPHICS STATS ---
app.get('/api/admin/area-stats', (req, res) => {
    pool.query(`
        SELECT 
            v.area, 
            COUNT(v.voter_id) as total, 
            SUM(CASE WHEN EXISTS (
                SELECT 1 FROM VOTE cv JOIN ELECTION ce ON ce.election_id=cv.election_id
                WHERE cv.voter_id=v.voter_id AND ce.status='Active'
                  AND ce.start_datetime <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
                  AND ce.end_datetime > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
            ) THEN 1 ELSE 0 END) as voted
        FROM VOTER v
        WHERE v.status = 'Active'
        GROUP BY v.area
        ORDER BY v.area ASC
    `, (err, rows) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, stats: rows || [] });
    });
});


// --- FETCH ELECTION HISTORY ---
app.get('/api/admin/history', async (req,res)=>{
    try {
        await databaseReady;
        const [rows]=await pool.promise().query(`SELECT e.election_id AS id,e.title,
            e.description,e.start_datetime AS start_time,e.end_datetime AS end_time,e.status,
            e.created_at,CASE WHEN f.election_id IS NULL THEN 0 ELSE 1 END AS finalized,
            (SELECT COUNT(*) FROM CANDIDATE c WHERE c.election_id=e.election_id) AS candidate_count,
            (SELECT COUNT(*) FROM VOTE v WHERE v.election_id=e.election_id) AS ballot_count
            FROM ELECTION e LEFT JOIN FINAL_ELECTION_REPORT f ON f.election_id=e.election_id
            ORDER BY e.created_at DESC,e.election_id DESC`);
        res.set('Cache-Control','no-store').json({success:true,history:rows});
    }catch(e){console.error('Election history:',e);res.status(500).json({success:false,message:'History could not be retrieved.'});}
});

// Official election snapshot. Calculations include only valid, authenticated ballots.
// Positions with a tie crossing the seat cutoff have NO announced winner until resolved.
function buildVerifiedReport(election, candidates, votes, members, key) {
    const byId = new Map(candidates.map(c => [c.candidate_id, c]));
    const byPosition = new Map();
    for (const c of candidates) {
        if (!byPosition.has(c.position)) byPosition.set(c.position, []);
        byPosition.get(c.position).push(c);
    }
    const memberArea = new Map(members.map(m => [m.voter_id, m.area || 'Unassigned']));
    const areas = {};
    for (const m of members) {
        const area = m.area || 'Unassigned';
        if (!areas[area]) areas[area] = {registered:0, voted:0};
        if (m.status === 'Active') areas[area].registered++;
    }
    const counts = new Map(candidates.map(c => [c.candidate_id, {overall:0, byArea:{}}]));
    const votedMembers = new Set();
    const names = new Map();
    for (const [position, list] of byPosition) {
        const map = new Map();
        for (const c of list) {
            if (map.has(c.full_name)) throw Error('Duplicate candidate names in position ' + position);
            map.set(c.full_name, c);
        }
        names.set(position,map);
    }
    for (const vote of votes) {
        if (!memberArea.has(vote.voter_id) || votedMembers.has(vote.voter_id)) throw Error('Unknown or duplicate voter in recorded ballots');
        if (crypto.createHash('sha256').update(vote.encrypted_vote).digest('hex') !== vote.vote_hash) throw Error('Ballot hash mismatch');
        const decrypted = decryptVote(vote.encrypted_vote,key);
        if (decrypted === 'DECRYPTION_FAILED') throw Error('Ballot decryption/integrity check failed');
        let choices;
        try { choices=JSON.parse(decrypted); } catch(_) { throw Error('Invalid decrypted ballot'); }
        if (!choices || typeof choices!=='object' || Array.isArray(choices) || Object.keys(choices).length !== byPosition.size) throw Error('Unexpected ballot positions');
        for (const [position,list] of byPosition) {
            const selection=choices[position], allowed=names.get(position), max=Math.max(1,Number(list[0].max_votes)||1);
            if (!Array.isArray(selection) || selection.length>max || new Set(selection).size!==selection.length) throw Error('Invalid ballot selection');
            for (const name of selection) {
                const c=allowed.get(name);
                if (!c) throw Error('Ballot references unknown candidate');
                const tally=counts.get(c.candidate_id), area=memberArea.get(vote.voter_id);
                tally.overall++; tally.byArea[area]=(tally.byArea[area]||0)+1;
            }
        }
        votedMembers.add(vote.voter_id);
        areas[memberArea.get(vote.voter_id)].voted++;
    }
    const positions=[];
    for (const [position,list] of byPosition) {
        const seats=Math.max(1,Number(list[0].max_votes)||1);
        if (list.some(c=>Math.max(1,Number(c.max_votes)||1)!==seats)) throw Error('Inconsistent seat count in ' + position);
        const sorted=list.map(c=>({id:c.candidate_id,name:c.full_name,votes:counts.get(c.candidate_id).overall,areas:counts.get(c.candidate_id).byArea})).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
        const cutoff=sorted[Math.min(seats,sorted.length)-1]?.votes ?? 0;
        const boundaryTie=sorted.length>seats && sorted[seats]?.votes===cutoff;
        // A tie at the cutoff invalidates the contested positions only. Winners above it are deterministically elected.
        for (let i=0;i<sorted.length;i++) sorted[i].outcome=(i<seats && sorted[i].votes>0 && (!boundaryTie || sorted[i].votes>cutoff))?'Winner':(boundaryTie && sorted[i].votes===cutoff?'Tie — unresolved':'Not elected');
        positions.push({position,seats,tieUnresolved:boundaryTie,candidates:sorted});
    }
    return {electionId:election.election_id,title:election.title,start:election.start_datetime,end:election.end_datetime,
        ballots:votes.length, registered:members.filter(m=>m.status==='Active').length, areas,positions,
        methodology:'Valid encrypted ballots, verified with custodian tokens. Ties crossing a seat boundary are unresolved; no winner is declared for contested seats.'};
}

app.post('/api/admin/disclose-results', async(req,res)=>{
    if (req.auth?.role!=='superadmin') return res.status(403).json({success:false,message:'Super Admin required for finalization.'});
    const {electionId,providedTokens}=req.body||{};
    if (!Array.isArray(providedTokens)||!providedTokens.length||providedTokens.some(t=>typeof t!=='string')) return res.status(400).json({success:false,message:'Custodian tokens required.'});
    const conn=await pool.promise().getConnection();
    try {
        await conn.beginTransaction();
        const [rows]=await conn.query(electionId==='active'?"SELECT * FROM ELECTION WHERE status IN ('Active','Ended') ORDER BY created_at DESC LIMIT 1 FOR UPDATE":"SELECT * FROM ELECTION WHERE election_id=? FOR UPDATE",electionId==='active'?[]:[electionId]);
        if (!rows.length) throw Error('Election not found');
        const election=rows[0];
        const [[clock]]=await conn.query('SELECT DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR) AS now_ph');
        if (!election.end_datetime || new Date(election.end_datetime).getTime()>new Date(clock.now_ph).getTime()) throw Error('Election has not reached its scheduled end time. Results cannot be finalized.');
        const [keys]=await conn.query('SELECT token FROM KEY_CUSTODIAN WHERE election_id=?',[election.election_id]);
        const actual=keys.map(r=>r.token).sort(), supplied=providedTokens.map(t=>t.trim()).sort();
        if (!actual.length || actual.length!==supplied.length || actual.some((t,i)=>t!==supplied[i])) throw Error('The complete set of valid custodian tokens is required');
        const [existing]=await conn.query('SELECT report_json FROM FINAL_ELECTION_REPORT WHERE election_id=?',[election.election_id]);
        if (existing.length) {await conn.commit();return res.json({success:true,report:JSON.parse(existing[0].report_json),message:'Previously finalized report retrieved. No duplicate notifications created.'});}
        const [candidates]=await conn.query("SELECT candidate_id,full_name,position,max_votes FROM CANDIDATE WHERE election_id=? AND status='Active'",[election.election_id]);
        const [votes]=await conn.query("SELECT voter_id,encrypted_vote,vote_hash FROM VOTE WHERE election_id=? AND status='Valid'",[election.election_id]);
        const [allVotes]=await conn.query('SELECT COUNT(*) AS n FROM VOTE WHERE election_id=?',[election.election_id]);
        if (allVotes[0].n!==votes.length) throw Error('Non-valid ballots require manual review before finalization');
        const [members]=await conn.query('SELECT voter_id,area,status FROM VOTER');
        if (!candidates.length) throw Error('No candidates are configured');
        const report=buildVerifiedReport(election,candidates,votes,members,actual.join(''));
        const payload=JSON.stringify(report),hash=crypto.createHash('sha256').update(payload).digest('hex');
        await conn.query('INSERT INTO FINAL_ELECTION_REPORT (election_id,report_json,report_hash) VALUES (?,?,?)',[election.election_id,payload,hash]);
        await conn.query("UPDATE ELECTION SET status='Completed' WHERE election_id=?",[election.election_id]);
        // One broadcast for every member, created atomically with the verified result.
        // Candidates are NOT required to be member accounts.
        const elected=report.positions.flatMap(p=>p.candidates.filter(c=>c.outcome==='Winner').map(c=>`${p.position}: ${c.name} (${c.votes} votes)`));
        const unresolved=report.positions.filter(p=>p.tieUnresolved).map(p=>p.position);
        const announcement=[
            elected.length?'Verified winner(s): '+elected.join('; '):'No confirmed winners have been declared.',
            unresolved.length?'Unresolved tie(s): '+unresolved.join(', ')+'. Contested seats are NOT awarded pending formal resolution.':'',
            'Official overall and per-area election results are available from the election administration.'
        ].filter(Boolean).join('\n');
        await conn.query('INSERT INTO ELECTION_ANNOUNCEMENT (election_id,title,message) VALUES (?,?,?)',
            [election.election_id,`Final Election Results: ${election.title}`,announcement]);
        // Atomic, once-per-election personalized inbox delivery. No candidate-member links.
        await conn.query(`INSERT IGNORE INTO MEMBER_INBOX_MESSAGE (election_id,voter_id,title,message)
            SELECT ?,v.voter_id,?,? FROM VOTER v`,
            [election.election_id,`Final Election Results: ${election.title}`,announcement]);
        await conn.commit();
        logActivity(req.auth.account_id,'Finalized verified election: '+election.title,req.ip);
        res.json({success:true,report,message:'Verified election finalized; a result announcement is now visible in every member inbox.'});
    }catch(e){await conn.rollback().catch(()=>{});console.error('Finalize results:',e.message);res.status(400).json({success:false,message:e.message});}
    finally{conn.release();}
});

app.get('/api/admin/final-report/:id',async(req,res)=>{
    if (req.auth?.role !== 'superadmin') return res.status(403).json({success:false,message:'Super Admin required.'});
    try {const [rows]=await pool.promise().query('SELECT report_json,report_hash,finalized_at FROM FINAL_ELECTION_REPORT WHERE election_id=?',[req.params.id]);
        if(!rows.length)return res.status(404).json({success:false,message:'Not finalized'});
        const integrity=crypto.createHash('sha256').update(rows[0].report_json).digest('hex');
        if(integrity!==rows[0].report_hash)return res.status(409).json({success:false,message:'Report integrity verification failed'});
        res.set('Cache-Control','no-store');res.json({success:true,report:JSON.parse(rows[0].report_json),hash:integrity,finalizedAt:rows[0].finalized_at});
    }catch(e){res.status(500).json({success:false,message:'Report unavailable'});}
});
// Each authenticated member can retrieve ONLY messages addressed to their own account.
app.get('/api/member/notifications',async(req,res)=>{
    try {
        await databaseReady;
        // Persistent inbox: reconcile only verified finalized announcements for this account.
        // No login presence is required at publication time. Unique(election_id,voter_id) prevents duplicates.
        await pool.promise().query(`INSERT IGNORE INTO MEMBER_INBOX_MESSAGE (election_id,voter_id,title,message,created_at)
          SELECT a.election_id,?,a.title,a.message,a.created_at
          FROM ELECTION_ANNOUNCEMENT a
          JOIN FINAL_ELECTION_REPORT f ON f.election_id=a.election_id`,[req.auth.account_id]);
        const [rows]=await pool.promise().query(`SELECT id,title,message,created_at,read_at
            FROM MEMBER_INBOX_MESSAGE WHERE voter_id=? ORDER BY created_at DESC,id DESC`,[req.auth.account_id]);
        res.set('Cache-Control','no-store');res.json({success:true,notifications:rows,unread:rows.filter(r=>!r.read_at).length});
    }catch(e){console.error('Member inbox:',e);res.status(500).json({success:false,message:'Notifications unavailable'});}
});
app.post('/api/member/notifications/:id/read',async(req,res)=>{
    try {
        if (!/^\d+$/.test(req.params.id)) return res.status(400).json({success:false,message:'Invalid message ID'});
        const [result]=await pool.promise().query(`UPDATE MEMBER_INBOX_MESSAGE SET read_at=COALESCE(read_at,NOW())
            WHERE id=? AND voter_id=?`,[req.params.id,req.auth.account_id]);
        if(!result.affectedRows)return res.status(404).json({success:false,message:'Notification not found'});
        res.json({success:true});
    }catch(e){console.error('Inbox read:',e);res.status(500).json({success:false,message:'Unable to mark notification read'});}
});

// --- DATABASE SCHEMA PATCHES FOR CRYPTOGRAPHIC BALLOT ---
// Ensure the system tracks "Max Votes" per position and allows encrypted JSON ballots
// max_votes schema is initialized and awaited by initializeDatabase().
// nullable ballot candidate reference is initialized and awaited by initializeDatabase().

// --- ATOMIC ELECTION DEPLOYMENT ---
app.post('/api/admin/initialize-election', async (req, res) => {
    if (req.auth?.role !== 'superadmin') return res.status(403).json({success:false,message:'Super Admin access required.'});
    const {title, description, config, startTime, endTime, tokenExpiry, emails} = req.body || {};
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 150)
        return res.status(400).json({success:false,message:'A valid election title is required (up to 150 characters).'});
    const normalizeDate = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value) && !Number.isNaN(Date.parse(value)) ? value.replace('T',' ') + ':00' : null;
    const start = normalizeDate(startTime), end = normalizeDate(endTime), expiry = normalizeDate(tokenExpiry);
    if (!start || !end || !expiry || start >= end || expiry < end)
        return res.status(400).json({success:false,message:'Enter valid schedule dates, with End after Start and Token Expiry not earlier than End.'});
    if (!Array.isArray(config) || !config.length)
        return res.status(400).json({success:false,message:'Add at least one complete ballot position.'});
    const seenPositions = new Set();
    for (const pos of config) {
        if (!pos || typeof pos.title !== 'string' || !pos.title.trim() || pos.title.trim().length > 50)
            return res.status(400).json({success:false,message:'Every position must have a valid title (up to 50 characters).'});
        const positionKey = pos.title.trim().toLowerCase();
        if (seenPositions.has(positionKey)) return res.status(400).json({success:false,message:'Duplicate ballot position: '+pos.title});
        seenPositions.add(positionKey);
        if (typeof pos.maxVotes !== 'number' || !Number.isInteger(pos.maxVotes) || pos.maxVotes < 1 || pos.maxVotes > 100)
            return res.status(400).json({success:false,message:'Max Votes is required for '+pos.title+' (integer 1–100).'});
        if (!Array.isArray(pos.candidates) || !pos.candidates.length || pos.maxVotes > pos.candidates.length)
            return res.status(400).json({success:false,message:'Add enough candidates for '+pos.title+' to cover Max Votes.'});
        const names = new Set();
        for (const cand of pos.candidates) {
            if (!cand || typeof cand.name !== 'string' || !cand.name.trim() || cand.name.trim().length > 100)
                return res.status(400).json({success:false,message:'Every candidate in '+pos.title+' needs a name (up to 100 characters).'});
            const nameKey = cand.name.trim().toLowerCase();
            if (names.has(nameKey)) return res.status(400).json({success:false,message:'Duplicate candidate in '+pos.title+': '+cand.name});
            names.add(nameKey);
        }
    }
    if (!Array.isArray(emails) || !emails.length || emails.some(e=>typeof e !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 100))
        return res.status(400).json({success:false,message:'At least one valid custodian email is required.'});
    const uniqueEmails = [...new Set(emails.map(e=>e.trim().toLowerCase()))];
    if (uniqueEmails.length !== emails.length) return res.status(400).json({success:false,message:'Custodian emails must be unique.'});
    let connection;
    try {
        await databaseReady;
        connection = await pool.promise().getConnection();
        await connection.query("SELECT GET_LOCK('bhw_election_deployment', 10) AS acquired").then(([rows]) => {if (rows[0].acquired !== 1) throw Error('Another deployment is in progress.');});
        await connection.beginTransaction();
        const [ongoing] = await connection.query("SELECT election_id FROM ELECTION WHERE status='Active' AND end_datetime > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR) LIMIT 1 FOR UPDATE");
        if (ongoing.length) {await connection.rollback();return res.status(409).json({success:false,message:'Another election is still open or scheduled. Finalize or wait for its end before deploying a new one.'});}
        const electionId='ELEC-'+crypto.randomUUID();
        const tokens=uniqueEmails.map(()=>crypto.randomBytes(16).toString('hex'));
        await connection.query("UPDATE ELECTION SET status='Ended' WHERE status='Active' AND end_datetime <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)");
        await connection.query("INSERT INTO ELECTION (election_id,title,description,start_datetime,end_datetime,status) VALUES (?,?,?,?,?,'Active')",
            [electionId,title.trim(),typeof description==='string'?description:'',start,end]);
        for (const pos of config) for (const cand of pos.candidates) {
            await connection.query("INSERT INTO CANDIDATE (candidate_id,election_id,full_name,position,photo,max_votes) VALUES (?,?,?,?,?,?)",
                ['CAND-'+crypto.randomUUID(),electionId,cand.name.trim(),pos.title.trim(),typeof cand.photo==='string'?cand.photo:null,pos.maxVotes]);
        }
        for (let i=0;i<uniqueEmails.length;i++) {
            await connection.query('INSERT INTO KEY_CUSTODIAN (election_id,email,token) VALUES (?,?,?)',[electionId,uniqueEmails[i],tokens[i]]);
        }
        // All election + candidates + keys are committed together, or none are saved.
        await connection.commit();
        masterDecryptionKey=[...tokens].sort().join('');
        const deliveries=await Promise.allSettled(uniqueEmails.map((email,i)=>transporter.sendMail({
            from: process.env.SMTP_USER,
            to:email,
            subject:`Cryptographic Token for ${title.trim()}`,
            text:`You are a key custodian for ${title.trim()}.\n\nToken: ${tokens[i]}\n\nExpires: ${tokenExpiry} (Philippine time). Keep this token confidential.`
        })));
        const failed=deliveries.map((r,i)=>r.status==='rejected'?uniqueEmails[i]:null).filter(Boolean);
        if (failed.length) console.error('Custodian email delivery failed for election',electionId,'recipients:',failed);
        logActivity(req.auth.account_id,'Deployed election: '+title.trim(),req.ip);
        res.status(201).json({success:true,electionId,candidatesSaved:config.reduce((n,p)=>n+p.candidates.length,0),
            emailed:uniqueEmails.length-failed.length,emailFailures:failed,
            message:failed.length?'Election and candidate records saved. Some custodian emails failed; do not redeploy. Check delivery securely.':'Election, candidates and custodian keys saved; all token emails accepted by SMTP.'});
    }catch(e){
        if (connection) await connection.rollback().catch(()=>{});
        console.error('Election deployment failed:',e);
        return res.status(500).json({success:false,message:'Election was not deployed: '+e.message});
    }finally{
        if(connection){await connection.query("SELECT RELEASE_LOCK('bhw_election_deployment')").catch(()=>{});connection.release();}
    }
});

// --- FETCH ELECTION INFO FOR VOTER SCREEN ---
app.get('/api/election-info', (req, res) => {
    pool.query(`SELECT * FROM ELECTION WHERE status = 'Active' AND end_datetime > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR) ORDER BY created_at DESC LIMIT 1`, (err, elecRows) => {
        if (err || !elecRows || elecRows.length === 0) return res.json({ active: false });

        const elec = elecRows[0];

        pool.query(`SELECT * FROM CANDIDATE WHERE election_id = ?`, [elec.election_id], (err, candRows) => {
            if (err) return res.status(500).json({ active: false });

            // Dynamically reconstruct the groups for the frontend ballot UI
            const positionsMap = {};
            candRows.forEach(c => {
                if (!positionsMap[c.position]) {
                    positionsMap[c.position] = { title: c.position, maxVotes: c.max_votes || 1, candidates: [] };
                }
                positionsMap[c.position].candidates.push({ name: c.full_name, photo: c.photo });
            });

            res.json({
                active: true,
                title: elec.title,
                config: Object.values(positionsMap),
                startTime: elec.start_datetime,
                endTime: elec.end_datetime
            });
        });
    });
});

// --- CAST CRYPTOGRAPHIC VOTE ---
app.post('/api/vote', async (req, res) => {
    const voterId = req.auth?.account_id;
    const choices = req.body?.choices;
    if (req.auth?.role !== 'member' || !voterId) return res.status(403).json({success:false,message:'Voter session required.'});
    if (!choices || typeof choices !== 'object' || Array.isArray(choices)) return res.status(400).json({success:false,message:'Invalid ballot.'});
    let connection;
    try {
        connection = await pool.promise().getConnection();
        await connection.beginTransaction();
        const [voters] = await connection.query('SELECT status FROM VOTER WHERE voter_id=? FOR UPDATE', [voterId]);
        if (!voters.length || voters[0].status !== 'Active') {
            await connection.rollback(); return res.status(403).json({success:false,message:'Voter is not active.'});
        }
        const [elections] = await connection.query("SELECT * FROM ELECTION WHERE status='Active' AND end_datetime > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR) ORDER BY created_at DESC LIMIT 1", []);
        if (!elections.length) { await connection.rollback(); return res.status(400).json({success:false,message:'No active election.'}); }
        const election = elections[0];
        if (new Date() < new Date(election.start_datetime) || new Date() > new Date(election.end_datetime)) {
            await connection.rollback(); return res.status(403).json({success:false,message:'Voting is not currently open.'});
        }
        const [previous] = await connection.query('SELECT vote_id FROM VOTE WHERE voter_id=? AND election_id=? LIMIT 1', [voterId, election.election_id]);
        if (previous.length) { await connection.rollback(); return res.status(409).json({success:false,message:'You have already voted in this election.'}); }
        const [positions] = await connection.query("SELECT full_name, position, max_votes FROM CANDIDATE WHERE election_id=? AND status='Active'", [election.election_id]);
        const validPositions = new Map();
        for (const c of positions) {
            if (!validPositions.has(c.position)) validPositions.set(c.position, {names:new Set(), max:Number(c.max_votes)||1});
            validPositions.get(c.position).names.add(c.full_name);
        }
        if (!validPositions.size || Object.keys(choices).some(p => !validPositions.has(p))) {
            await connection.rollback(); return res.status(400).json({success:false,message:'Ballot positions are invalid.'});
        }
        for (const [position, options] of validPositions) {
            const selections = choices[position];
            if (!Array.isArray(selections) || selections.length > options.max || new Set(selections).size !== selections.length || selections.some(name => !options.names.has(name))) {
                await connection.rollback(); return res.status(400).json({success:false,message:'Invalid candidate selection for ' + position});
            }
        }
        const [keys] = await connection.query('SELECT token FROM KEY_CUSTODIAN WHERE election_id=?', [election.election_id]);
        if (!keys.length || keys.some(k => !k.token)) {
            await connection.rollback(); return res.status(503).json({success:false,message:'Election encryption keys unavailable.'});
        }
        const electionKey = keys.map(k => k.token).sort().join('');
        const encrypted = encryptVote(JSON.stringify(choices), electionKey);
        const voteId = 'VOTE-' + crypto.randomUUID();
        const voteHash = crypto.createHash('sha256').update(encrypted).digest('hex');
        await connection.query("INSERT INTO VOTE (vote_id,voter_id,candidate_id,election_id,vote_hash,encrypted_vote,status) VALUES (?,?,NULL,?,?,?,'Valid')", [voteId,voterId,election.election_id,voteHash,encrypted]);
        await connection.commit();
        res.json({success:true});
        logActivity(voterId, 'Cast encrypted vote', req.ip);
    } catch (error) {
        if (connection) { try { await connection.rollback(); } catch (_) {} }
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({success:false,message:'A vote is already recorded for this election.'});
        console.error('Vote submission failed:', error.message);
        res.status(500).json({success:false,message:'Could not securely record vote.'});
    } finally { if (connection) connection.release(); }
});

// --- FETCH AUDIT LOGS ---
app.get('/api/admin/logs', (req, res) => {
    const query = `
        SELECT 
            a.log_id as id, 
            COALESCE(a.voter_id, a.admin_id) as user_id, 
            a.action, 
            a.ip_address, 
            a.created_at as timestamp,
            COALESCE(v.full_name, ad.full_name) as full_name,
            COALESCE(ad.role, 'member') as role
        FROM AUDIT_LOG a
        LEFT JOIN VOTER v ON a.voter_id = v.voter_id
        LEFT JOIN ADMIN ad ON a.admin_id = ad.admin_id
        ORDER BY a.created_at DESC 
        LIMIT 200
    `;
    pool.query(query, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'DB Error' });
        
        const formattedLogs = rows.map(r => ({
            id: r.id,
            user_id: r.user_id,
            action: r.action,
            ip_address: r.ip_address,
            timestamp: r.timestamp,
            first_name: r.full_name ? r.full_name.split(' ')[0] : 'System',
            last_name: r.full_name ? r.full_name.split(' ').slice(1).join(' ') : '',
            role: r.role
        }));
        res.json({ success: true, logs: formattedLogs });
    });
});



// --- SUPER ADMIN: REGISTER NEW ADMIN ---
app.post('/api/superadmin/register-admin', async (req, res) => {
    const { firstName, middleName = '', lastName, photoUrl, descriptor } = req.body;
    const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    const first = clean(firstName), middle = clean(middleName), last = clean(lastName);
    if (!first || !last || [first, middle, last].some(x => x.length > 100) ||
        !Array.isArray(descriptor) || descriptor.length !== 128 ||
        !descriptor.every(x => typeof x === 'number' && Number.isFinite(x)) ||
        typeof photoUrl !== 'string' || !photoUrl.startsWith('data:image/jpeg;base64,')) {
        return res.status(400).json({ success: false, message: 'Valid first name, last name, and biometric capture are required.' });
    }
    const fullName = [first, middle, last].filter(Boolean).join(' ');
    if (fullName.length > 100) return res.status(400).json({ success: false, message: 'Full name must be 100 characters or fewer.' });
    const connection = await pool.promise().getConnection().catch(() => null);
    if (!connection) return res.status(500).json({ success: false, message: 'Database unavailable.' });
    let enrollmentLocked = false;
    try {
        const [[lock]] = await connection.query("SELECT GET_LOCK('bhw_biometric_enrollment', 10) AS acquired");
        if (lock.acquired !== 1) return res.status(503).json({success:false,message:'Biometric registration is busy; retry shortly.'});
        enrollmentLocked = true;
        await connection.beginTransaction();
        const [existing] = await connection.query('SELECT admin_id FROM ADMIN WHERE full_name = ? LIMIT 1', [fullName]);
        if (existing.length) { await connection.rollback(); return res.status(409).json({ success: false, message: 'An administrator with this name already exists.' }); }
        const [faces] = await connection.query('SELECT facial_encoding FROM BIOMETRIC_REGISTRATION WHERE facial_encoding IS NOT NULL');
        for (const row of faces) {
            try {
                const stored = getDescriptor(row.facial_encoding);
                if (!stored) { await connection.rollback(); return res.status(409).json({success:false,message:'An existing biometric template is unreadable. Contact the system administrator before new enrollment.'}); }
                if (Array.isArray(stored) && stored.length === descriptor.length && euclideanDistance(stored, descriptor) < 0.42) {
                    await connection.rollback();
                    return res.status(409).json({ success: false, message: 'This face is already registered.' });
                }
            } catch (error) { throw error; }
        }
        const [idResult] = await connection.query('INSERT INTO ADMIN_ID_SEQUENCE (id) VALUES (NULL)');
        const adminId = `ADM${String(idResult.insertId).padStart(4, '0')}`;
        const biometricId = `BIO${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
        const passwordHash = crypto.randomBytes(32).toString('hex'); // Random, non-login credential for biometric-only admins
        await connection.query(`INSERT INTO ADMIN (admin_id, full_name, username, password_hash, role, status)
            VALUES (?, ?, ?, ?, 'admin', 'Active')`, [adminId, fullName, adminId, passwordHash]);
        await connection.query(`INSERT INTO BIOMETRIC_REGISTRATION
            (biometric_id, admin_id, facial_image, facial_encoding, biometric_status)
            VALUES (?, ?, ?, ?, 'Active')`, [biometricId, adminId, encryptBiometric(photoUrl), encryptBiometric(JSON.stringify(descriptor))]);
        await connection.commit();
        logActivity('SUPERADMIN', `Registered new Admin: ${adminId}`, req.ip);
        res.json({ success: true, adminId });
    } catch (err) {
        await connection.rollback();
        console.error('Admin registration failed:', err);
        res.status(500).json({ success: false, message: 'Could not register administrator.' });
    } finally { if (enrollmentLocked) { try { await connection.query("SELECT RELEASE_LOCK('bhw_biometric_enrollment')"); } catch (e) { console.error('Enrollment lock release failed:', e.message); } } connection.release(); }
});


// --- FETCH ALL SYSTEM USERS (COMBINED ADMIN & VOTER TABLES) ---
app.get('/api/superadmin/users', (req, res) => {
    const query = `
        SELECT admin_id AS member_id, full_name, role, status FROM ADMIN
        UNION ALL
        SELECT voter_id AS member_id, full_name, 'member' AS role, status FROM VOTER
        ORDER BY role DESC, member_id ASC
    `;
    pool.query(query, (err, rows) => {
        if (err) return res.status(500).json({ success: false });
        
        // Format the data to match what the frontend UI expects
        const formattedUsers = rows.map(u => ({
            member_id: u.member_id,
            first_name: u.full_name.split(' ')[0],
            last_name: u.full_name.split(' ').slice(1).join(' ') || '',
            role: u.role,
            is_active: u.status === 'Active' ? 1 : 0
        }));
        res.json({ success: true, users: formattedUsers });
    });
});

// --- TOGGLE ACCOUNT STATUS (ACTIVE / DISABLED) ---
app.post('/api/superadmin/toggle-status', (req, res) => {
    const { targetId, currentStatus, reason } = req.body;
    if (targetId === 'SUPERADMIN') return res.json({ success: false, message: "Cannot disable the master account." });

    const newStatusStr = currentStatus === 1 ? 'Disabled' : 'Active';
    const isAdmin = targetId.startsWith('ADMIN');
    const table = isAdmin ? 'ADMIN' : 'VOTER';
    const idCol = isAdmin ? 'admin_id' : 'voter_id';

    pool.query(`UPDATE ${table} SET status = ? WHERE ${idCol} = ?`, [newStatusStr, targetId], (err) => {
        if (err) return res.json({ success: false, message: 'Database error.' });
        
        const logMsg = newStatusStr === 'Disabled' 
            ? `Disabled account: ${targetId} (Reason: ${reason || 'Not specified'})` 
            : `Enabled account: ${targetId}`;
            
        logActivity('SUPERADMIN', logMsg, req.ip);
        res.json({ success: true, newStatus: newStatusStr === 'Active' ? 1 : 0 });
    });
});

// --- FETCH TIMELINE DATA FOR DASHBOARD GRAPH ---
app.get('/api/admin/timeline-stats', (req, res) => {
    // Queries the new AUDIT_LOG table using the 'created_at' column
    pool.query(`SELECT created_at as timestamp FROM AUDIT_LOG WHERE action = 'Cast encrypted vote' ORDER BY created_at ASC`, (err, rows) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, logs: rows || [] });
    });
});

// A short-lived, HttpOnly pending-MFA cookie lets a user resume verification
// after refreshing, logging out, or re-entering their password. It never authenticates
// the user by itself; the password must still be verified to resume via login-password.
const pendingMfaCookieOptions = {httpOnly:true,sameSite:'strict',secure:secureCookie,path:'/api/admin',maxAge:5*60*1000};
function pendingMfaFromRequest(req) {
    const match = /(?:^|;\s*)bhw_pending_mfa=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
    return match ? match[1] : null;
}
async function getActivePendingMfa(req) {
    const challenge = pendingMfaFromRequest(req);
    if (!challenge) return null;
    const [records] = await pool.promise().query(
        'SELECT 1 FROM ADMIN_LOGIN_CHALLENGE WHERE challenge_hash=? AND expires_at>NOW() AND attempts<5 LIMIT 1',
        [hashToken(challenge)]
    );
    return records.length ? challenge : null;
}
// Verify Super Admin Password Login dynamically
// Verify Super Admin Password Login dynamically
app.post('/api/admin/login-password', throttle, async (req,res) => {
    const password = req.body?.password;
    if (typeof password !== 'string' || password.length > 256) return res.status(400).json({success:false,message:'Invalid credentials.'});
    try {
        const [rows] = await pool.promise().query("SELECT password_hash,email,status FROM ADMIN WHERE admin_id='SUPERADMIN'");
        const admin = rows[0];
        if (!admin || admin.status !== 'Active' || !verifyPassword(password,admin.password_hash)) return res.status(401).json({success:false,message:'Invalid credentials.'});
        if (process.env.SUPERADMIN_MFA_ENABLED === 'true') {
            if (!admin.email || !process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) return res.status(503).json({success:false,message:'MFA requires a saved recovery email and configured SMTP credentials.'});
            // A prior successful password login may already have a valid, emailed OTP.
            // Resume it immediately instead of forcing another email / cooldown wait.
            const existingChallenge = await getActivePendingMfa(req);
            if (existingChallenge) return res.json({
                success:false,mfaRequired:true,challenge:existingChallenge,
                reused:true,message:'Enter the code already sent to your email. No new email is needed.'
            });
            // Atomic, persisted five-minute cooldown per account. This prevents concurrent clicks,
            // multiple tabs and server restarts from generating extra email messages.
            await pool.promise().query(
                `INSERT IGNORE INTO ADMIN_MFA_SEND_COOLDOWN (account_id,last_sent) VALUES ('SUPERADMIN', '1970-01-01 00:00:00.000')`
            );
            const [reservation] = await pool.promise().query(
                `UPDATE ADMIN_MFA_SEND_COOLDOWN SET last_sent=NOW(3)
                 WHERE account_id='SUPERADMIN' AND last_sent <= DATE_SUB(NOW(3),INTERVAL 5 MINUTE)`
            );
            if (reservation.affectedRows !== 1) {
                const [[cooldown]] = await pool.promise().query(
                    `SELECT GREATEST(1,CEIL(TIMESTAMPDIFF(SECOND,NOW(3),DATE_ADD(last_sent,INTERVAL 5 MINUTE)))) AS retryAfter
                     FROM ADMIN_MFA_SEND_COOLDOWN WHERE account_id='SUPERADMIN'`
                );
                const retryAfter = Math.max(1, Number(cooldown?.retryAfter) || 300);
                res.set('Retry-After',String(retryAfter));
                return res.status(429).json({success:false,code:'MFA_COOLDOWN',retryAfter,message:`A verification code was recently sent. Wait ${Math.ceil(retryAfter/60)} minute(s) before requesting another. Use the code already emailed to you.`});
            }
            const challenge = crypto.randomBytes(32).toString('hex');
            const code = String(crypto.randomInt(100000,1000000));
            await pool.promise().query('INSERT INTO ADMIN_LOGIN_CHALLENGE (challenge_hash,code_hash,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 5 MINUTE))', [hashToken(challenge), hashToken(code)]);
            try { await transporter.sendMail({from:process.env.SMTP_USER,to:admin.email,subject:'BHW Admin Login Verification',text:`Your login verification code is ${code}. It expires in 5 minutes. If you did not request this, contact your system administrator.`}); }
            catch(e) {
                await pool.promise().query('DELETE FROM ADMIN_LOGIN_CHALLENGE WHERE challenge_hash=?',[hashToken(challenge)]);
                // Cooldown remains set on delivery failure to avoid email floods; operator can troubleshoot SMTP.
                return res.status(503).json({success:false,message:'Could not send login verification email. Wait five minutes before trying again.'});
            }
            res.cookie('bhw_pending_mfa',challenge,pendingMfaCookieOptions);
            return res.json({success:false,mfaRequired:true,challenge,message:'Enter the verification code sent to your registered email.'});
        }
        await newSession(res,'SUPERADMIN','superadmin');
        res.json({success:true,emailConfigured:Boolean(admin.email)});
    } catch(e) { console.error(e);res.status(500).json({success:false,message:'Login unavailable.'}); }
});

app.post('/api/admin/login-otp', throttle, async (req,res) => {
    if (process.env.SUPERADMIN_MFA_ENABLED !== 'true') return res.status(404).json({success:false});
    const {challenge,code} = req.body || {};
    if (!/^[a-f0-9]{64}$/.test(challenge||'') || !/^\d{6}$/.test(code||'')) return res.status(400).json({success:false,message:'Invalid verification request.'});
    try {
        const [rows] = await pool.promise().query('SELECT code_hash, attempts FROM ADMIN_LOGIN_CHALLENGE WHERE challenge_hash=? AND expires_at>NOW()', [hashToken(challenge)]);
        if (!rows.length || rows[0].attempts>=5) return res.status(401).json({success:false,message:'Verification expired or too many attempts.'});
        await pool.promise().query('UPDATE ADMIN_LOGIN_CHALLENGE SET attempts=attempts+1 WHERE challenge_hash=?',[hashToken(challenge)]);
        if (!crypto.timingSafeEqual(Buffer.from(rows[0].code_hash,'hex'),Buffer.from(hashToken(code),'hex'))) return res.status(401).json({success:false,message:'Incorrect verification code.'});
        await pool.promise().query('DELETE FROM ADMIN_LOGIN_CHALLENGE WHERE challenge_hash=?',[hashToken(challenge)]);
        res.clearCookie('bhw_pending_mfa',{path:'/api/admin',sameSite:'strict',secure:secureCookie});
        await newSession(res,'SUPERADMIN','superadmin');
        res.json({success:true});
    } catch(e) {console.error('MFA error',e);res.status(503).json({success:false,message:'Verification unavailable.'});}
});

// Patch ADMIN table for dynamic password resets
pool.query(`ALTER TABLE ADMIN ADD COLUMN reset_code VARCHAR(64) DEFAULT NULL`, () => {});
pool.query(`ALTER TABLE ADMIN MODIFY COLUMN reset_code VARCHAR(64) DEFAULT NULL`, () => {});
pool.query(`ALTER TABLE ADMIN ADD COLUMN reset_expiry DATETIME DEFAULT NULL`, () => {});

// Update Super Admin Email
app.post('/api/superadmin/set-email', (req, res) => {
    const { email } = req.body;
    pool.query(`UPDATE ADMIN SET email = ? WHERE admin_id = 'SUPERADMIN'`, [email], (err) => {
        if (err) return res.status(500).json({ success: false });
        logActivity('SUPERADMIN', `Updated Superadmin recovery email to ${email}`, req.ip);
        res.json({ success: true });
    });
});

// Password reset: one server-enforced send attempt per five minutes for the account.
// The database cooldown survives refreshes, browser changes and server restarts.
const PASSWORD_RESET_COOLDOWN_SECONDS = 300;
function validResetPassword(password) {
    return typeof password === 'string' && password.length >= 12 && password.length <= 128
        && /[a-z]/.test(password) && /[A-Z]/.test(password)
        && /[0-9]/.test(password) && /[^A-Za-z0-9\s]/.test(password);
}
app.get('/api/superadmin/reset-status', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const [rows] = await pool.promise().query(
            `SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), next_allowed)) AS retryAfterSeconds
             FROM PASSWORD_RESET_COOLDOWN WHERE account_id='SUPERADMIN'`
        );
        res.json({success:true, retryAfterSeconds:Math.max(0,Number(rows[0]?.retryAfterSeconds||0))});
    } catch(e) {
        res.status(503).json({success:false,message:'Reset status unavailable.'});
    }
});

app.post('/api/superadmin/request-reset', throttle, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let claimed = false;
    let codeHash = null;
    try {
        // Atomic database claim blocks simultaneous clicks in different tabs.
        await pool.promise().query(
            `INSERT IGNORE INTO PASSWORD_RESET_COOLDOWN (account_id,next_allowed) VALUES ('SUPERADMIN',NOW())`
        );
        const [claim] = await pool.promise().query(
            `UPDATE PASSWORD_RESET_COOLDOWN
             SET next_allowed=DATE_ADD(NOW(), INTERVAL 5 MINUTE)
             WHERE account_id='SUPERADMIN' AND next_allowed<=NOW()`
        );
        if (claim.affectedRows !== 1) {
            const [[row]] = await pool.promise().query(
                `SELECT GREATEST(1,TIMESTAMPDIFF(SECOND,NOW(),next_allowed)) AS remaining
                 FROM PASSWORD_RESET_COOLDOWN WHERE account_id='SUPERADMIN'`
            );
            const remaining = Math.max(1, Number(row?.remaining || 300));
            res.set('Retry-After', String(remaining));
            return res.status(429).json({success:false,message:'A reset code was recently requested. Please wait before requesting another.',retryAfterSeconds:remaining});
        }
        claimed = true;
        const [accounts] = await pool.promise().query(
            "SELECT email FROM ADMIN WHERE admin_id='SUPERADMIN' LIMIT 1"
        );
        if (!accounts.length || !accounts[0].email) throw new Error('Recovery email not configured');
        const email = accounts[0].email;
        const resetCode = String(crypto.randomInt(100000,1000000));
        codeHash = hashToken(resetCode);
        await pool.promise().query(
            `UPDATE ADMIN SET reset_code=?, reset_expiry=DATE_ADD(NOW(), INTERVAL 15 MINUTE)
             WHERE admin_id='SUPERADMIN'`, [codeHash]
        );
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: email,
            subject: 'Super Admin Password Reset Code',
            text: `Your Guimba BHW password reset code is ${resetCode}. It expires in 15 minutes. If you did not request this, contact your system administrator.`,
            html: `<div style="font-family:Arial,sans-serif;padding:20px"><h2>Super Admin Password Reset</h2><p>Use this one-time code:</p><h1 style="letter-spacing:4px">${resetCode}</h1><p>The code expires in 15 minutes. Ignore this message if you did not request it.</p></div>`
        });
        logActivity('SYSTEM','Sent Super Admin password reset code',req.ip);
        return res.json({success:true,message:'If recovery email is configured, a verification code has been sent.',retryAfterSeconds:PASSWORD_RESET_COOLDOWN_SECONDS});
    } catch(e) {
        console.error('Password reset email error:',e.message);
        // If the delivery failed, allow a retry; clear only our own code.
        if (claimed) {
            try {
                if(codeHash) await pool.promise().query(
                    "UPDATE ADMIN SET reset_code=NULL,reset_expiry=NULL WHERE admin_id='SUPERADMIN' AND reset_code=?",[codeHash]
                );
                await pool.promise().query(
                    "UPDATE PASSWORD_RESET_COOLDOWN SET next_allowed=NOW() WHERE account_id='SUPERADMIN'"
                );
            } catch(cleanupErr) {console.error('Reset cooldown rollback failed:',cleanupErr.message);}
        }
        return res.status(503).json({success:false,message:'Unable to send reset code. Check the configured recovery email and SMTP settings.'});
    }
});

app.post('/api/superadmin/verify-reset', throttle, async (req, res) => {
    const {code,newPassword} = req.body || {};
    if (!/^\d{6}$/.test(code || ''))
        return res.status(400).json({success:false,message:'Enter a valid six-digit verification code.'});
    if (!validResetPassword(newPassword))
        return res.status(400).json({success:false,message:'Password must be 12–128 characters and include uppercase, lowercase, a number, and a symbol.'});
    try {
        const [rows] = await pool.promise().query(
            "SELECT reset_code,reset_expiry FROM ADMIN WHERE admin_id='SUPERADMIN' LIMIT 1"
        );
        if (!rows.length || !rows[0].reset_code || !rows[0].reset_expiry || new Date() > new Date(rows[0].reset_expiry)
            || !crypto.timingSafeEqual(Buffer.from(rows[0].reset_code,'hex'), Buffer.from(hashToken(code),'hex')))
            return res.status(400).json({success:false,message:'Invalid or expired verification code.'});
        const hash = hashPassword(newPassword);
        const [update] = await pool.promise().query(
            `UPDATE ADMIN SET password_hash=?,reset_code=NULL,reset_expiry=NULL
             WHERE admin_id='SUPERADMIN' AND reset_code=? AND reset_expiry>NOW()`,
            [hash,hashToken(code)]
        );
        if(update.affectedRows !== 1)
            return res.status(400).json({success:false,message:'Code already used or expired.'});
        await pool.promise().query("DELETE FROM AUTH_SESSION WHERE account_id='SUPERADMIN'");
        logActivity('SUPERADMIN','Super Admin password reset via email code',req.ip);
        res.json({success:true,message:'Password updated successfully.'});
    } catch(e) {
        console.error('Password reset verification error:',e.message);
        res.status(503).json({success:false,message:'Password reset unavailable.'});
    }
});


// ==========================================
// ELECTION & CANDIDATE MANAGEMENT ROUTES
// ==========================================

// 1. Create a New Election
app.post('/api/admin/election/create', (req, res) => {
    const { title, description, startDatetime, endDatetime } = req.body;
    
    // Generate a unique election ID (e.g., ELEC-170420391)
    const electionId = `ELEC-${Math.floor(Date.now() / 1000)}`;

    const query = `
        INSERT INTO ELECTION (election_id, title, description, start_datetime, end_datetime, status) 
        VALUES (?, ?, ?, ?, ?, 'Active')
    `;

    pool.query(query, [electionId, title, description, startDatetime, endDatetime], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Failed to create election.' });
        
        logActivity('SUPERADMIN', `Created new election: ${title}`, req.ip);
        res.json({ success: true, election_id: electionId, message: 'Election created successfully.' });
    });
});

// 2. Add a Candidate to an Election
app.post('/api/admin/candidate/add', (req, res) => {
    const { electionId, fullName, position, platform, photoUrl } = req.body;
    
    // Generate a unique candidate ID
    const candidateId = `CAND-${Math.floor(Math.random() * 1000000)}`;

    const query = `
        INSERT INTO CANDIDATE (candidate_id, election_id, full_name, position, platform, photo) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    pool.query(query, [candidateId, electionId, fullName, position, platform, photoUrl], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Failed to add candidate.' });
        
        logActivity('SUPERADMIN', `Added candidate ${fullName} for position ${position}`, req.ip);
        res.json({ success: true, candidate_id: candidateId, message: 'Candidate added successfully.' });
    });
});

// 3. Fetch the currently Active Election and its Candidates
app.get('/api/election/active', (req, res) => {
    // First, find the active election
    pool.query(`SELECT * FROM ELECTION WHERE status = 'Active' AND end_datetime > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR) ORDER BY created_at DESC LIMIT 1`, (err, elecRows) => {
        if (err || elecRows.length === 0) {
            return res.json({ success: true, active: false, election: null, candidates: [] });
        }

        const election = elecRows[0];

        // Next, fetch all candidates for this election
        pool.query(`SELECT * FROM CANDIDATE WHERE election_id = ? AND status = 'Active'`, [election.election_id], (err, candRows) => {
            if (err) return res.status(500).json({ success: false });
            
            res.json({ 
                success: true, 
                active: true, 
                election: election, 
                candidates: candRows || [] 
            });
        });
    });
});

// --- UPDATE MEMBER INFORMATION ---
app.post('/api/admin/update-member', (req, res) => {
    const { memberId, fullName, area, status } = req.body;
    pool.query(
        `UPDATE VOTER SET full_name = ?, area = ?, status = ? WHERE voter_id = ?`,
        [fullName, area, status, memberId],
        (err) => {
            if (err) return res.json({ success: false, message: 'Database error' });
            logActivity('SUPERADMIN', `Updated information for member: ${memberId}`, req.ip);
            res.json({ success: true });
        }
    );
});

// --- UPDATE MEMBER BIOMETRIC FACE ---
app.post('/api/admin/update-member-face', (req, res) => {
    const { memberId, descriptor, photoUrl } = req.body;
    pool.query(
        `UPDATE BIOMETRIC_REGISTRATION SET facial_encoding = ?, facial_image = ? WHERE voter_id = ?`,
        [encryptBiometric(JSON.stringify(descriptor)), encryptBiometric(photoUrl), memberId],
        (err) => {
            if (err) return res.json({ success: false, message: 'Database error' });
            logActivity('SUPERADMIN', `Updated face biometrics for: ${memberId}`, req.ip);
            res.json({ success: true });
        }
    );
});

app.listen(PORT, () => console.log(`Secure Server running on http://localhost:${PORT}`));

