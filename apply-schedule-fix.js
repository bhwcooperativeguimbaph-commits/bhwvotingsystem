// Run once from the project root: node apply-schedule-fix.js
const fs = require('fs');
const path = require('path');
const serverPath = path.join(process.cwd(), 'server.js');
const appPath = path.join(process.cwd(), 'public', 'app.js');
function patch(file, change) {
  if (!fs.existsSync(file)) throw new Error('Missing file: ' + file);
  const original = fs.readFileSync(file, 'utf8');
  const output = change(original);
  if (original === output) { console.log('Already patched: ' + file); return; }
  if (!fs.existsSync(file + '.before-schedule-fix.bak')) fs.copyFileSync(file, file + '.before-schedule-fix.bak');
  fs.writeFileSync(file, output);
  console.log('Patched: ' + file);
}
// Check both existing sources before making any changes.
const serverOriginal = fs.readFileSync(serverPath, 'utf8');
const appOriginal = fs.readFileSync(appPath, 'utf8');
const oldSelect = "(SELECT title FROM ELECTION WHERE status = 'Active' LIMIT 1) as activeTitle";
const oldReturn = "activeTitle: rows[0] ? rows[0].activeTitle : null";
if (!serverOriginal.includes('as activeStart') && (!serverOriginal.includes(oldSelect) || !serverOriginal.includes(oldReturn))) {
  throw new Error('Server monitoring route differs from expected version. No files changed.');
}
if (!appOriginal.includes('function formatElectionSchedulePH(') && (!appOriginal.includes('async function fetchTurnout()') || !appOriginal.includes('const dt = document.getElementById(\'dash-elec-title\')'))) {
  throw new Error('Frontend fetchTurnout differs from expected version. No files changed.');
}
patch(serverPath, text => {
  if (text.includes('as activeStart')) return text;
  text = text.replace(oldSelect, "(SELECT title FROM ELECTION WHERE status = 'Active' ORDER BY created_at DESC LIMIT 1) as activeTitle,\n            (SELECT DATE_FORMAT(start_datetime, '%Y-%m-%dT%H:%i:%s') FROM ELECTION WHERE status = 'Active' ORDER BY created_at DESC LIMIT 1) as activeStart,\n            (SELECT DATE_FORMAT(end_datetime, '%Y-%m-%dT%H:%i:%s') FROM ELECTION WHERE status = 'Active' ORDER BY created_at DESC LIMIT 1) as activeEnd");
  return text.replace(oldReturn, oldReturn + ",\n            activeStart: rows[0] ? rows[0].activeStart : null,\n            activeEnd: rows[0] ? rows[0].activeEnd : null");
});
patch(appPath, text => {
  if (text.includes('function formatElectionSchedulePH(')) return text;
  const marker = 'async function fetchTurnout() {';
  const helper = `function formatElectionSchedulePH(value) {
    if (!value) return 'Not scheduled';
    // The backend serializes MySQL DATETIME as YYYY-MM-DDTHH:mm:ss.
    // Election schedule fields are entered as Philippine wall-clock time.
    const matched = String(value).match(/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})(?::(\\d{2}))?/);
    if (!matched) return 'Invalid date';
    const [, year, month, day, hour, minute, second] = matched;
    const date = new Date(Date.UTC(+year, +month - 1, +day, +hour - 8, +minute, +(second || 0)));
    if (Number.isNaN(date.getTime())) return 'Invalid date';
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short'
    }).format(date);
}

`;
  text = text.replace(marker, helper + marker);
  const anchor = "const aesStatus = document.getElementById('stat-aes-status');";
  const addition = `
            // Populate both schedule cards from the active election API.
            const isActive = !!data.activeTitle;
            const dashSchedule = document.getElementById('dash-election-schedule');
            if (dashSchedule) dashSchedule.classList.toggle('hidden', !isActive);
            for (const [id, value] of [
                ['dash-election-start', data.activeStart],
                ['dash-election-end', data.activeEnd],
                ['setup-election-start', data.activeStart],
                ['setup-election-end', data.activeEnd]
            ]) {
                const element = document.getElementById(id);
                if (element) element.textContent = isActive ? formatElectionSchedulePH(value) : '—';
            }
`;
  return text.replace(anchor, anchor + addition);
});
console.log('SUCCESS. Restart Node and hard-refresh Chrome (Ctrl+Shift+R).');
