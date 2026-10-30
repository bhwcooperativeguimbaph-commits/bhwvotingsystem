
let timelineChartInstance = null;
let areaPieInstances = {};

// public/app.js
const video = document.getElementById('webcam');
let isModelsLoaded = false;
let currentVoterId = "";
let currentAdminRole = ""; // NEW: Tracks if the admin is a 'superadmin' or 'admin'
let currentAdminName = "Admin";
let currentAdminPhoto = "";
let verifiedElectionReport = null;
let candidateMemberOptions = [];

async function logoutPortal() {
    // An authenticated Super Admin logout also clears both server-side email cooldowns.
    try {
        const response = await fetch('/api/logout', {method:'POST', credentials:'same-origin',
            headers:{'Content-Type':'application/json'}, body:'{}'});
        if (!response.ok) throw new Error('Logout was not confirmed by the server.');
    } catch(e) {
        console.warn('Logout request failed:', e);
        return showModal('error','Logout Failed','Unable to end the session. Please try again.');
    }
    pendingMfaChallenge = null;
    resetRequestCooldownUntil = 0;
    resetRequestInProgress = false;
    if (resetCooldownTicker) { clearInterval(resetCooldownTicker); resetCooldownTicker = null; }
    document.getElementById('reset-password-modal')?.classList.add('hidden');
    document.getElementById('admin-mfa-panel')?.classList.add('hidden');
    document.getElementById('reset-code-input')?.setAttribute('value', '');
    const password = document.getElementById('reset-new-password');
    if (password) password.value = '';
    updateResetCooldownUI();
    location.reload();
}

// Rehydrate a valid server-side session after page refresh. No credentials in localStorage.
async function restoreSession() {
    try {
        const response = await fetch('/api/session', {credentials:'same-origin',cache:'no-store'});
        if (!response.ok) return;
        const data = await response.json();
        if (!data.success) return;
        if (data.role === 'member') {
            currentVoterId = data.memberId;
            memberHasVoted = Boolean(data.hasVoted);
            const displayName = data.fullName || 'Member';
            document.getElementById('profile-welcome').textContent = 'Welcome, ' + displayName;
            document.getElementById('profile-name').textContent = displayName;
            document.getElementById('profile-id').textContent = data.memberId;
            document.getElementById('profile-avatar-img').src =
                'https://ui-avatars.com/api/?name=' + encodeURIComponent(displayName) + '&background=1d7642&color=fff';
            document.getElementById('landing-page')?.classList.add('hidden');
            document.getElementById('auth-section')?.classList.add('hidden');
            document.getElementById('voting-section')?.classList.add('hidden');
            document.getElementById('voter-profile-section')?.classList.remove('hidden');
            if (video.srcObject) {
                video.srcObject.getTracks().forEach(track => track.stop());
                video.srcObject = null;
            }
            document.getElementById('voter-camera-slot')?.classList.add('hidden');
            await fetchElectionInfo();
            const readyBtn = document.getElementById('btn-proceed-ballot');
            if (readyBtn && memberHasVoted) {
                readyBtn.disabled = true;
                readyBtn.textContent = 'Vote Already Cast';
            }
            await loadMemberNotifications();
            return;
        }
        if (!['admin','superadmin'].includes(data.role)) return;
        currentAdminRole = data.role;
        currentAdminName = data.fullName || 'Administrator';
        currentAdminPhoto = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentAdminName)}&background=1d7642&color=fff`;
        switchToAdminView();
    } catch(e) { console.warn('Session restore unavailable'); }
}
document.addEventListener('DOMContentLoaded',restoreSession);
let pendingMfaChallenge = null;
async function verifyAdminOtp() {
    const code = document.getElementById('admin-otp-input').value.trim();
    if (!/^\d{6}$/.test(code)) return showModal('error','Invalid Code','Enter the 6-digit email code.');
    try {
        const response = await fetch('/api/admin/login-otp', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge:pendingMfaChallenge,code})});
        const data = await response.json();
        if (!data.success) return showModal('error','Verification Failed',data.message || 'Incorrect code.');
        pendingMfaChallenge = null;
        document.getElementById('admin-mfa-panel').classList.add('hidden');
        currentAdminRole='superadmin';currentAdminName='Super Admin';
        currentAdminPhoto='https://ui-avatars.com/api/?name=Super+Admin&background=1d7642&color=fff';
        switchToAdminView();
    } catch(e) {showModal('error','Connection Error','Could not verify code.');}
}

function openLoginPortal() {
    document.getElementById('landing-page').classList.add('hidden');
    document.getElementById('auth-section').classList.remove('hidden');
}

function proceedToBallot() {
    if (!currentElectionConfig.length || !memberVotingOpen) {
        return showModal('info','Ballot Unavailable','No election is currently open for voting. Check your notifications for verified results.');
    }
    document.getElementById('voter-profile-section').classList.add('hidden');
    document.getElementById('voting-section').classList.remove('hidden');
}

// --- LIVENESS DETECTION (BLINK) MATH ---
function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function calculateEAR(eye) {
    // Calculates the Eye Aspect Ratio based on 6 facial landmark points around the eye
    const v1 = getDistance(eye[1], eye[5]);
    const v2 = getDistance(eye[2], eye[4]);
    const h = getDistance(eye[0], eye[3]);
    return (v1 + v2) / (2.0 * h);
}
// ---------------------------------------

// --- CANDIDATE IMAGE ENCODER ---
function encodeCandidateImage(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    if (!["image/jpeg","image/png"].includes(file.type) || !/\.(jpe?g|png)$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
        fileInput.value = "";
        fileInput.nextElementSibling.value = "";
        return showModal("error","Invalid Photo","Upload a JPG or PNG file up to 5 MB.");
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 250;
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            fileInput.nextElementSibling.value = canvas.toDataURL('image/jpeg', 0.8);
        }
        img.src = e.target.result;
    }
    reader.readAsDataURL(file);
}

// --- CUSTOM MODAL SYSTEM ---
function showModal(type, title, message, callback = null) {
    const overlay = document.getElementById('custom-modal-overlay');
    const iconDiv = document.getElementById('modal-icon');
    const titleEl = document.getElementById('modal-title');
    const msgEl = document.getElementById('modal-message');
    const actionsDiv = document.getElementById('modal-actions');

    titleEl.innerText = title;
    msgEl.innerText = message;
    
    // Set icon and colors based on type
    iconDiv.className = 'modal-icon-wrapper';
    if(type === 'success') { iconDiv.classList.add('success'); iconDiv.innerText = '✓'; }
    else if(type === 'error') { iconDiv.classList.add('error'); iconDiv.innerText = '!'; }
    else if(type === 'confirm') { iconDiv.classList.add('confirm'); iconDiv.innerText = '?'; }

    actionsDiv.innerHTML = '';
    
    // If it's a confirmation, show Yes/No. Otherwise, show OK.
    if(type === 'confirm') {
        actionsDiv.innerHTML = `
            <button class="btn-sm cancel" onclick="closeModal()">No</button>
            <button class="btn-sm confirm-btn" id="modal-confirm-btn">Yes</button>
        `;
        document.getElementById('modal-confirm-btn').onclick = () => { closeModal(); if(callback) callback(); };
    } else {
        actionsDiv.innerHTML = `<button class="btn-sm confirm-btn" id="modal-ok-btn">OK</button>`;
        document.getElementById('modal-ok-btn').onclick = () => { closeModal(); if(callback) callback(); };
    }
    
    overlay.classList.add('active');
}

function closeModal() {
    document.getElementById('custom-modal-overlay').classList.remove('active');
}
// -----------------------------

// --- AI & CAMERA INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const maxDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    const regBdate = document.getElementById('reg-bdate');
    if(regBdate) regBdate.max = maxDate.toISOString().split('T')[0];

    // LOAD MODELS FIRST. Camera hardware stays strictly OFF until this finishes.
    Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models')
    ]).then(() => {
        isModelsLoaded = true;
        
        // FIX: Tell the UI that loading is finished so the text updates!
        document.getElementById('model-status').innerText = "AI Models Loaded. Camera Ready.";
        
        document.getElementById('btn-login').disabled = false;
        
        document.getElementById('voter-camera-slot').appendChild(document.getElementById('video-container'));
        document.getElementById('video-container').classList.remove('hidden');
        
        // ONLY turn on the webcam now that the AI is fully ready
        startVideo();
    }).catch(err => {
        document.getElementById('model-status').innerText = "Error loading AI Models.";
    });
});

function startVideo() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: {} })
            .then(stream => video.srcObject = stream)
            .catch(err => console.error("Webcam error:", err));
    }
}

async function getFaceDescriptor() {
    if (!isModelsLoaded) return null;
    const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
    if (!detection) return null;
    return Array.from(detection.descriptor);
}

// --- UNIFIED BULLETPROOF TAB SWITCHING ---
function switchTab(tabId) {
    // 1. Hide all tab contents and remove active class from all links
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
    
    // 2. Show the targeted tab content
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.add('active');
    }

    // 3. Highlight the correct sidebar button by matching its onclick attribute
    document.querySelectorAll('.tab-link').forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        if (onclickAttr.includes(tabId)) {
            btn.classList.add('active');
        }
    });

    // 4. Automatically close mobile sidebar drawer on small screens when clicked
    const sidebar = document.querySelector('.sidebar');
    if (window.innerWidth <= 900 && sidebar) {
        sidebar.classList.remove('mobile-open');
    }

    // 5. Handle webcam slots for tabs requiring video streams
    const vidContainer = document.getElementById('video-container');
    if (vidContainer) {
        if (tabId === 'tab-register') {
            const slot = document.getElementById('admin-camera-slot');
            if (slot) slot.appendChild(vidContainer);
            vidContainer.classList.remove('hidden');
        } else if (tabId === 'tab-test') {
            const slot = document.getElementById('test-camera-slot');
            if (slot) slot.appendChild(vidContainer);
            vidContainer.classList.remove('hidden');
        } else if (tabId === 'tab-users-roles') {
            const slot = document.getElementById('admin-role-camera-slot');
            if (slot) slot.appendChild(vidContainer);
            vidContainer.classList.remove('hidden');
        } else {
            vidContainer.classList.add('hidden'); 
        }
    }

    // 6. Trigger data fetchers based on active tab
    if (tabId === 'tab-dashboard' || tabId === 'tab-setup') fetchTurnout();
    if (tabId === 'tab-results') fetchHistory();
    if (tabId === 'tab-members') fetchMembers();
    if (tabId === 'tab-logs') fetchLogs();
    if (tabId === 'tab-users-roles') fetchSystemUsers();
}

function switchToAdminView() {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('landing-page').style.display = 'none';
    
    // The member authentication camera must not remain visible in an admin session.
    document.getElementById('voter-camera-slot')?.classList.add('hidden');
    if (video.srcObject) { video.srcObject.getTracks().forEach(track => track.stop()); video.srcObject = null; }
    // Hide the top navigation to prevent UI overlapping
    const topNav = document.querySelector('.top-nav');
    if (topNav) topNav.style.display = 'none';
    
    if(document.getElementById('voter-portal')) document.getElementById('voter-portal').classList.add('hidden');
    document.querySelector('.main-wrapper').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'flex';
    
    // Security: Only show Users & Roles to Super Admin
    const usersRoleNav = document.getElementById('nav-users-roles');
    if (usersRoleNav) {
        usersRoleNav.style.display = (currentAdminRole === 'superadmin') ? 'block' : 'none';
    }

    // --- NEW: Instantly update all Admin Name text on the screen! ---
    const adminGreeting = document.getElementById('dash-admin-name');
    if (adminGreeting && currentAdminName) {
        // Use the full name instead of splitting it, and capitalize the first letters
        const formattedName = currentAdminName.replace(/\b\w/g, char => char.toUpperCase());
        adminGreeting.innerText = formattedName;
    }
    
    const topName = document.getElementById('admin-top-name');
    const topRole = document.getElementById('admin-top-role');
    const topAvatar = document.getElementById('admin-top-avatar');
    
    if (topName) topName.innerText = currentAdminName;
    if (topRole) topRole.innerText = currentAdminRole === 'superadmin' ? 'Super Administrator' : 'Administrator';
    if (topAvatar && currentAdminPhoto) topAvatar.src = currentAdminPhoto;

    // Fetch the data for the tables and charts
    fetchTurnout(); 
    fetchHistory(); 
    fetchAreas(); 
    fetchSystemUsers();
    loadCandidateMembers();
}

// --- AUTHENTICATION ---
async function loginFace() {
    if (!isModelsLoaded) return showModal('error','System Not Ready','Wait for the biometric models.');
    const loginBtn = document.getElementById('btn-login');
    if (loginBtn.disabled) return;
    loginBtn.disabled = true;
    const originalLabel = loginBtn.innerText;
    try {
        // Identify first: avoid running the whole challenge for an unregistered face.
        loginBtn.innerText = 'Scanning registered face…';
        const initialDetection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
        if (!initialDetection) throw new Error('No face detected. Face the camera and try again.');
        const initialDescriptor = Array.from(initialDetection.descriptor);
        const preResp = await fetch('/api/face-prescan', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({descriptor:initialDescriptor})
        });
        const pre = await preResp.json();
        if (!preResp.ok || !pre.success) throw new Error(pre.message || 'Pre-scan unavailable.');
        if (!pre.recognized) throw new Error(pre.message || 'No registered face found.');
        const startResp = await fetch('/api/face-challenge',{
            method:'POST',headers:{'Content-Type':'application/json'},body:'{}'
        });
        const challenge = await startResp.json();
        if (!startResp.ok || !challenge.success) throw new Error(challenge.message || 'Cannot start challenge.');
        const actions = challenge.actions;
        const completedActions = [];
        // A slow CPU can take >300ms per face-api.js frame; allow time for complete blinks.
        const deadline = Date.now() + Math.min(110_000, (challenge.expiresInSeconds || 120) * 1000 - 5_000);
        const cue = document.getElementById('face-direction-cue');
        const status = document.getElementById('face-action-status');
        let firstTurnSign = null;
        const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
        // Directions below reflect observed movement in the VIDEO FRAME, not "your left/right".
        // On mirrored cameras, the arrow still follows what the user sees moving in the preview.
        for (let step = 0; step < actions.length; step++) {
            const action = actions[step];
            const isBlink = action === 'blink';
            if (cue) cue.classList.remove('hidden');
            if (status) { status.classList.remove('hidden'); status.textContent = isBlink ? 'Look straight at the camera, then close and OPEN your eyes.' : step === 0 ? 'Turn your head to either side. The arrow follows your movement.' : 'Return to center, then turn to the OTHER side.'; }
            let neutralFrames = 0;
            let samples = [];
            let blinkClosed = false;
            let lowestEyeRatio = 1;
            let eyeBaseline = null;
            let framesInDirection = 0;
            let lastTurnSign = 0;
            let stageDone = false;
            while (Date.now() < deadline) {
                const detection = await faceapi.detectSingleFace(video).withFaceLandmarks();
                if (!detection) {
                    framesInDirection = 0;
                    if (status) status.textContent = 'Face lost. Move into the center of the camera.';
                    await pause(100);
                    continue;
                }
                const lm = detection.landmarks;
                const nose = lm.getNose()[3];
                const jaw = lm.getJawOutline();
                const center = (jaw[0].x + jaw[16].x) / 2;
                const halfWidth = Math.max(Math.abs(jaw[16].x - jaw[0].x) / 2, 1);
                const turn = (nose.x - center) / halfWidth;
                const ear = (calculateEAR(lm.getLeftEye()) + calculateEAR(lm.getRightEye())) / 2;
                const centered = Math.abs(turn) < 0.17;
                if (isBlink) {
                    // Calibrate with open eyes FIRST; do not continuously update the baseline
                    // while blinking, as that can make closure impossible to detect.
                    if (eyeBaseline === null && Number.isFinite(ear) && ear > 0.10 && Math.abs(turn) < 0.32) {
                        samples.push(ear);
                        if (samples.length >= 3) {
                            const sorted = samples.slice().sort((a,b) => a-b);
                            eyeBaseline = sorted[Math.floor(sorted.length / 2)];
                        }
                    }
                    if (eyeBaseline === null) {
                        if (cue) cue.textContent = '👁 KEEP EYES OPEN';
                        if (status) status.textContent = `Calibrating open eyes (${samples.length}/3)… face the camera.`;
                    } else if (!Number.isFinite(ear) || Math.abs(turn) > 0.32) {
                        if (status) status.textContent = 'Keep your face centered and visible.';
                    } else {
                        // Relative EAR thresholds tolerate different eye shapes and glasses.
                        // Require close -> reopen; a permanently closed eye cannot pass.
                        // Minimum strictness for this development demo. A small detectable dip
                        // followed by recovery passes; this is NOT liveness/PAD.
                        const closeLimit = eyeBaseline * 0.96;
                        const reopenLimit = eyeBaseline * 0.94;
                        const relative = Math.round(ear / eyeBaseline * 100);
                        lowestEyeRatio = Math.min(lowestEyeRatio, ear / eyeBaseline);
                        if (!blinkClosed) {
                            if (cue) cue.textContent = '👁 CLOSE THEN OPEN';
                            if (ear <= closeLimit) {
                                blinkClosed = true;
                                if (status) status.textContent = `Eyes closed detected (${relative}% of baseline). Now OPEN.`;
                            } else if (status) {
                                status.textContent = `Eye openness: ${relative}% — close both eyes slowly, then reopen.`;
                            }
                        } else {
                            if (cue) cue.textContent = '👁 OPEN YOUR EYES';
                            // Face-api can sample slowly, so one clearly reopened-eye
                            // frame after confirmed closure is sufficient for this UI step.
                            // Do not add a wall-clock minimum: the detection pass itself
                            // may already take hundreds of milliseconds on modest CPUs.
                            if (ear >= reopenLimit && ear / eyeBaseline >= lowestEyeRatio + 0.025) {
                                stageDone = true;
                                if (status) status.textContent = `Blink confirmed (${relative}% open) ✓`;
                                break;
                            }
                            if (status) status.textContent = `Eyes closed confirmed. Reopen eyes (${relative}% of baseline).`;
                        }
                    }
                } else {
                    if (centered) neutralFrames++;
                    // Center MUST be observed at the beginning of each turn step.
                    if (neutralFrames < 2) {
                        if (cue) cue.textContent = '↔ FACE FORWARD';
                        if (status) status.textContent = 'Look straight ahead first…';
                    } else {
                        const sign = turn < -0.19 ? -1 : turn > 0.19 ? 1 : 0;
                        if (cue) cue.textContent = sign < 0 ? '← MOVING LEFT' : sign > 0 ? 'MOVING RIGHT →' : '↔ TURN YOUR HEAD';
                        const validSign = step === 0 ? sign !== 0 : sign !== 0 && sign === -firstTurnSign;
                        if (validSign) {
                            framesInDirection = lastTurnSign === sign ? framesInDirection + 1 : 1;
                            lastTurnSign = sign;
                            if (framesInDirection >= 2) {
                                if (step === 0) firstTurnSign = sign;
                                stageDone = true;
                                if (status) status.textContent = 'Head turn confirmed ✓';
                                break;
                            }
                        } else {
                            framesInDirection = 0;
                            if (status) status.textContent = step === 0 ? 'Turn left or right until the arrow follows.' : sign === firstTurnSign ? 'That is the first direction. Turn the opposite way.' : 'Turn to the opposite side.';
                        }
                    }
                }
                await pause(90);
            }
            if (!stageDone) throw new Error(isBlink ? 'Blink was not confirmed before the challenge expired. Try a deliberate close-and-open blink in good light.' : 'Head-turn challenge timed out. Try again with your full face visible.');
            completedActions.push(action);
            await pause(300);
        }
        if (cue) cue.classList.add('hidden');
        if (status) status.classList.add('hidden');
        loginBtn.innerText = 'Checking identity…';
        const finalDetection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
        if (!finalDetection) throw new Error('Face not detected after challenge.');
        const descriptor = Array.from(finalDetection.descriptor);
        const resp = await fetch('/api/login-face', {
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({descriptor,challengeId:challenge.challengeId,completedActions})
        });
        const result = await resp.json();
        if (!resp.ok || !result.success) throw new Error(result.message || 'Face authentication failed.');

            currentVoterId = result.memberId;
            
            // ROUTING LOGIC: Where to send the user based on their role
            // ROUTING LOGIC: Where to send the user based on their role
            if (result.role === 'member') {
                showModal('success', 'Identity Verified', `Biometric match successful.`, async () => {
                    document.getElementById('auth-section').classList.add('hidden');
                    document.getElementById('voter-camera-slot').classList.add('hidden');
                    if(video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());

                    document.getElementById('profile-welcome').innerText = `Welcome, ${result.firstName}`;
                    document.getElementById('profile-name').innerText = `${result.firstName} ${result.lastName}`;
                    document.getElementById('profile-id').innerText = `${result.memberId}`;
                    
                    // Display the actual User Photo
                    const avatarUrl = (result.photoUrl && result.photoUrl.length > 100) ? result.photoUrl : `https://ui-avatars.com/api/?name=${result.firstName}+${result.lastName}&background=1d7642&color=fff`;
                    document.getElementById('profile-avatar-img').src = avatarUrl;

                    // Voting eligibility is scoped to the current election, not historical votes.
                    memberHasVoted=!!result.hasVoted;
                    const readyBtn = document.getElementById('btn-proceed-ballot');
                    if (readyBtn) {
                        readyBtn.disabled = !!result.hasVoted;
                        readyBtn.innerText = result.hasVoted ? 'Vote Already Cast' : 'Ready to Vote!';
                        readyBtn.style.background = result.hasVoted ? 'var(--text-muted)' : '';
                    }
                    const voteHint = document.querySelector('.profile-dashboard .card p:nth-of-type(2)');
                    if (voteHint && result.hasVoted) voteHint.innerText = 'You have already voted in the current election. Thank you for participating!';

                    await fetchElectionInfo();
                    await loadMemberNotifications();
                    document.getElementById('voter-profile-section').classList.remove('hidden');
                });
            } else {
                // ADMIN & SUPERADMIN FLOW
                currentAdminRole = result.role; 
                currentAdminName = `${result.firstName} ${result.lastName}`;
                // Display the actual Admin Photo
                currentAdminPhoto = (result.photoUrl && result.photoUrl.length > 100) ? result.photoUrl : `https://ui-avatars.com/api/?name=${result.firstName}+${result.lastName}&background=1d7642&color=fff`;

                showModal('success', 'Admin Authenticated', `Welcome back, ${currentAdminName}.`, () => {
                    document.getElementById('auth-section').classList.add('hidden');
                    document.getElementById('voter-camera-slot').classList.add('hidden');
                    if(video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
                    
                    document.getElementById('admin-top-name').innerText = currentAdminName;
                    document.getElementById('admin-top-role').innerText = currentAdminRole === 'superadmin' ? 'Super Administrator' : 'Administrator';
                    document.getElementById('admin-top-avatar').src = currentAdminPhoto;
                    
                    switchToAdminView();
                });
            }


    } catch(err) {
        showModal('error','Face Login Failed',err.message || 'Unable to authenticate.');
    } finally {
        document.getElementById('face-direction-cue')?.classList.add('hidden');
        document.getElementById('face-action-status')?.classList.add('hidden');
        loginBtn.disabled = false;
        loginBtn.innerText = originalLabel;
    }
}

function toggleAdminPasswordVisibility() {
    const field = document.getElementById('admin-username');
    const toggle = document.getElementById('admin-password-toggle');
    const slash = document.getElementById('admin-password-eye-slash');
    if (!field || !toggle) return;
    const show = field.type === 'password';
    field.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    toggle.setAttribute('title', show ? 'Hide password' : 'Show password');
    toggle.setAttribute('aria-pressed', String(show));
    if (slash) slash.style.display = show ? 'block' : 'none';
}

let adminLoginSubmitting = false;
async function loginAdmin() {
    if (adminLoginSubmitting) return;
    const password = document.getElementById('admin-username').value;
    if (!password) return showModal('error', 'Required', 'Enter your admin password.');
    adminLoginSubmitting = true;
    const loginBtn = document.getElementById('btn-admin-login');
    if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = 'Checking...'; }

    try {
        const resp = await fetch('/api/admin/login-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await resp.json();

        if (data.success) {
            currentAdminRole = 'superadmin';
            currentAdminName = 'Super Admin';
            currentAdminPhoto = `https://ui-avatars.com/api/?name=Super+Admin&background=1d7642&color=fff`;

            showModal('success', 'Login Success', 'Welcome Super Administrator.', () => {
                switchToAdminView();
            });
        } else if (data.mfaRequired && data.challenge) {
            pendingMfaChallenge=data.challenge;
            document.getElementById('admin-mfa-panel').classList.remove('hidden');
            document.getElementById('admin-otp-input').value='';
            document.getElementById('admin-otp-input').focus();
        } else {
            showModal('error', 'Access Denied', data.message || 'Incorrect password.');
        }
    } catch (e) {
        showModal('error', 'Server Error', 'Failed to authenticate.');
    } finally {
        adminLoginSubmitting = false;
        if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Login as Admin'; }
    }
}

// Password reset: UI countdown is advisory; the database enforces the actual limit.
let resetRequestCooldownUntil = 0;
let resetRequestInProgress = false;
let resetCooldownTicker = null;
function updateResetCooldownUI() {
    const btn = document.getElementById('btn-send-code');
    const hint = document.getElementById('reset-cooldown-hint');
    if (!btn || !hint) return;
    const remaining = Math.max(0, Math.ceil((resetRequestCooldownUntil - Date.now()) / 1000));
    btn.disabled = resetRequestInProgress || remaining > 0;
    if (resetRequestInProgress) btn.textContent = 'Sending Code...';
    else if (remaining > 0) {
        const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
        const secs = String(remaining % 60).padStart(2, '0');
        btn.textContent = `Send Again in ${mins}:${secs}`;
    } else btn.textContent = 'Send Reset Code';
    hint.textContent = remaining > 0
        ? 'A code was recently requested. You may send another when the countdown ends. Check your inbox or spam folder.'
        : 'You may request one reset code every five minutes.';
}
function setResetCooldown(seconds) {
    resetRequestCooldownUntil = Date.now() + Math.max(0, Number(seconds) || 0) * 1000;
    updateResetCooldownUI();
    if (!resetCooldownTicker) resetCooldownTicker = setInterval(updateResetCooldownUI, 1000);
}
async function fetchResetCooldown() {
    try {
        const resp = await fetch('/api/superadmin/reset-status', {cache:'no-store'});
        if (!resp.ok) return;
        const data = await resp.json();
        if(data.success) setResetCooldown(data.retryAfterSeconds);
    } catch(err) { console.warn('Could not fetch reset cooldown',err); }
}
function updateResetPasswordGuide() {
    const password = document.getElementById('reset-new-password')?.value || '';
    const rules = {
        length:password.length >= 12 && password.length <= 128,
        upper:/[A-Z]/.test(password), lower:/[a-z]/.test(password),
        number:/[0-9]/.test(password), symbol:/[^A-Za-z0-9\s]/.test(password)
    };
    for (const [rule, passed] of Object.entries(rules)) {
        const node = document.getElementById('reset-rule-' + rule);
        if (!node) continue;
        node.classList.toggle('passed',passed);
        node.textContent = (passed ? '✓' : '○') + node.textContent.replace(/^[✓○]\s*/, ' ');
    }
    return Object.values(rules).every(Boolean);
}
function toggleResetPasswordVisibility() {
    const input = document.getElementById('reset-new-password');
    const button = document.getElementById('reset-password-eye');
    if(!input || !button) return;
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    button.setAttribute('aria-pressed',String(visible));
}
function openResetPasswordModal() {
    document.getElementById('reset-password-modal').classList.remove('hidden');
    // Keep the code-entry step available when an email was recently sent.
    // The server will still enforce the resend limit, but verification is immediate.
    document.getElementById('reset-step-2').classList.remove('hidden');
    document.getElementById('reset-code-input').value = '';
    document.getElementById('reset-new-password').value = '';
    document.getElementById('reset-new-password').type = 'password';
    updateResetPasswordGuide();
    updateResetCooldownUI();
    fetchResetCooldown();
}
function closeResetPasswordModal() {
    document.getElementById('reset-password-modal').classList.add('hidden');
}
async function sendResetCode() {
    if(resetRequestInProgress || Date.now() < resetRequestCooldownUntil) return;
    resetRequestInProgress = true;
    updateResetCooldownUI();
    try {
        const resp = await fetch('/api/superadmin/request-reset', {
            method:'POST',headers:{'Content-Type':'application/json'},body:'{}'
        });
        const data = await resp.json();
        if(Number(data.retryAfterSeconds) > 0) setResetCooldown(data.retryAfterSeconds);
        if (data.success) {
            showModal('success','Code Sent',data.message);
            document.getElementById('reset-step-2').classList.remove('hidden');
        } else {
            showModal('error','Reset Code',data.message || 'Unable to send reset code.');
        }
    } catch(e) {
        showModal('error','Error','Failed to request reset code.');
    } finally {
        resetRequestInProgress = false;
        updateResetCooldownUI();
    }
}
let resetVerificationInProgress = false;
async function confirmPasswordReset() {
    if (resetVerificationInProgress) return;
    const codeInput = document.getElementById('reset-code-input');
    const passwordInput = document.getElementById('reset-new-password');
    const button = document.getElementById('btn-confirm-reset');
    const code = codeInput.value.trim();
    const newPassword = passwordInput.value;

    if (!/^\d{6}$/.test(code)) {
        codeInput.focus();
        return showModal('error', 'Invalid Verification Code', 'Enter the six-digit code sent to the Super Admin recovery email.');
    }
    if (!updateResetPasswordGuide()) {
        passwordInput.focus();
        return showModal('error', 'Password Requirements Not Met', 'Please satisfy every password requirement shown in the checklist before saving.');
    }
    resetVerificationInProgress = true;
    button.disabled = true;
    button.textContent = 'Verifying & Saving...';
    try {
        const response = await fetch('/api/superadmin/verify-reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, newPassword }),
            cache: 'no-store'
        });
        let result;
        try { result = await response.json(); }
        catch { throw new Error('The server returned an unreadable response. Please check the Node.js terminal.'); }

        if (response.ok && result.success) {
            passwordInput.value = '';
            codeInput.value = '';
            updateResetPasswordGuide();
            return showModal('success', 'Password Updated Successfully',
                'Your Super Admin password has been changed. Previous sessions have been signed out. Log in using your new password.',
                closeResetPasswordModal);
        }
        const message = typeof result.message === 'string' ? result.message : 'Unable to update password.';
        if (response.status === 429) {
            return showModal('error', 'Too Many Attempts', message + ' Please wait before trying again.');
        }
        if (/expired|invalid|already used/i.test(message) && /code|verification/i.test(message)) {
            codeInput.focus();
            return showModal('error', 'Invalid or Expired Code',
                'The verification code is incorrect, expired, or has already been used. Check the latest email or request another code when the resend countdown ends.');
        }
        if (/password/i.test(message)) {
            passwordInput.focus();
            return showModal('error', 'Password Not Accepted', message);
        }
        return showModal('error', 'Password Reset Failed', message);
    } catch (error) {
        showModal('error', 'Connection Error', error.message || 'Unable to reach the server. Check that Node.js and MySQL are running, then try again.');
    } finally {
        resetVerificationInProgress = false;
        button.disabled = false;
        button.textContent = 'Confirm & Save Password';
    }
}

async function saveSuperAdminEmail() {
    const email = document.getElementById('superadmin-email-input').value.trim();
    if (!email) return showModal('error', 'Email Required', 'Please enter a valid email address.');

    try {
        const resp = await fetch('/api/superadmin/set-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await resp.json();
        if (data.success) {
            showModal('success', 'Email Saved', `Recovery email set to ${email}`);
        } else {
            showModal('error', 'Error', 'Could not save email.');
        }
    } catch (e) {
        showModal('error', 'Error', 'Server connection error.');
    }
}

// --- VOTING DASHBOARD ---
let currentElectionConfig = [];
let memberVotingOpen = false;
let memberHasVoted = false;

async function fetchElectionInfo() {
    try {
        const resp = await fetch('/api/election-info');
        const data = await resp.json();
        
        currentElectionConfig = [];
        memberVotingOpen = false;
        const readyBtn = document.getElementById('btn-proceed-ballot');
        if (readyBtn) { readyBtn.disabled=true; readyBtn.textContent='No Election Open'; }
        document.getElementById('voting-section')?.classList.add('hidden');
        document.getElementById('dynamic-voting-form').innerHTML='';
        document.getElementById('vote-submit-btn').style.display='none';
        if (data.active && Array.isArray(data.config) && data.config.length) {
            currentElectionConfig = data.config;
            const container = document.getElementById('dynamic-voting-form');
            const titleEl = document.getElementById('election-status-title');
            const subtitleEl = document.getElementById('election-status-subtitle');
            const submitBtn = document.getElementById('vote-submit-btn');
            
            container.innerHTML = "";
            
            const now = new Date();
            const startDate = new Date(data.startTime);
            const endDate = new Date(data.endTime);
            
            // 1. LOGIC: Election hasn't started yet
            if (now < startDate) {
                titleEl.innerText = "Voting Not Yet Open";
                subtitleEl.innerText = "Please return during the official election period.";
                submitBtn.style.display = 'none'; // Hide submit button
                
                // Show schedule card instead of candidates
                container.innerHTML = `
                    <div class="card" style="text-align: center; border-color: #cbd5e1; background: #f8fafc; padding: 3rem 2rem;">
                        <h3 style="color: var(--text-main); font-size: 1.5rem; margin-bottom: 10px;">The election has not started yet.</h3>
                        <p style="color: var(--text-muted); font-size: 1.1rem;">Voting for <strong>${data.title}</strong> will officially open on:</p>
                        <h2 style="color: var(--primary); margin-top: 20px; font-size: 2rem;">${startDate.toLocaleString()}</h2>
                    </div>
                `;
                return;
            }
            
            // 2. LOGIC: Election has officially ended
            if (now > endDate) {
                titleEl.innerText = "Voting Closed";
                subtitleEl.innerText = "The official election period has ended.";
                submitBtn.style.display = 'none'; // Hide submit button
                
                container.innerHTML = `
                    <div class="card" style="text-align: center; border-color: #cbd5e1; background: #fef2f2; padding: 3rem 2rem;">
                        <h3 style="color: var(--danger); font-size: 1.5rem; margin-bottom: 10px;">Election Ended</h3>
                        <p style="color: var(--text-muted); font-size: 1.1rem;">Voting for <strong>${data.title}</strong> officially closed on:</p>
                        <h2 style="color: var(--danger); margin-top: 20px; font-size: 2rem;">${endDate.toLocaleString()}</h2>
                    </div>
                `;
                return;
            }

            // 3. LOGIC: Election is currently Active! Show candidates.
            titleEl.innerText = "Select Your Candidates";
            subtitleEl.innerText = "Choose your preferred leaders from the groups below.";
            memberVotingOpen = true;
            if(readyBtn) {readyBtn.disabled=memberHasVoted;readyBtn.textContent=memberHasVoted?'Vote Already Cast':'Ready to Vote!';}
            submitBtn.style.display = 'inline-block'; // Show submit button

            data.config.forEach((pos, index) => {
                let html = `
                <div style="margin-bottom: 25px;">
                    <h3 style="margin-bottom: 15px; color: var(--text-main);">${pos.title} <span style="font-size:0.8rem; color:var(--text-muted); font-weight:normal;">(Select max ${pos.maxVotes})</span></h3>
                    <div class="candidate-grid" id="grid-${index}">`;
                
                pos.candidates.forEach(cand => {
                    const candName = typeof cand === 'string' ? cand : cand.name;
                    const candPhoto = typeof cand === 'string' ? `https://ui-avatars.com/api/?name=${candName}&background=1d7642&color=fff` : cand.photo;
                    const inputType = pos.maxVotes === 1 ? 'radio' : 'checkbox';
                    
                    html += `
                        <label class="candidate-choice-card" onchange="selectCandidateCard(this, ${pos.maxVotes}, 'grid-${index}')" style="display:flex; flex-direction:column; align-items:center; padding: 20px 10px;">
                            <input type="${inputType}" name="pos-${index}" value="${candName}">
                            <img src="${candPhoto}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 15px; border: 3px solid #f1f5f9; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                            <h4 style="margin-bottom: 5px; font-size: 1.05rem;">${candName}</h4>
                            <span style="font-size:0.8rem; color:var(--text-muted);">${pos.title}</span>
                        </label>`;
                });
                html += `</div></div>`;
                container.innerHTML += html;
            });
        }
        else {
            const readyBtn=document.getElementById('btn-proceed-ballot');
            if (readyBtn) {readyBtn.disabled=true;readyBtn.textContent='No Election Available';}
        }
    } catch (err) {
        currentElectionConfig=[];memberVotingOpen=false;
        const btn=document.getElementById('btn-proceed-ballot');
        if(btn){btn.disabled=true;btn.textContent='Election Unavailable';}
        console.error('Error fetching election info:',err);
    }
}

function selectCandidateCard(cardLabel, maxVotes, gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const input = cardLabel.querySelector('input');
    if (!input) return;
    const checkedCount = grid.querySelectorAll('input:checked').length;
    if (checkedCount > maxVotes) {
        input.checked = false;
        showModal('error', 'Limit Exceeded', 'You can only select up to ' + maxVotes + ' candidates for this position.');
    }
    grid.querySelectorAll('.candidate-choice-card').forEach(card => {
        card.classList.toggle('selected', Boolean(card.querySelector('input:checked')));
    });
}

function submitVote() {
    const choices = {};
    let isValid = true;

    currentElectionConfig.forEach((pos, index) => {
        const selected = Array.from(document.querySelectorAll(`input[name="pos-${index}"]:checked`)).map(el => el.value);
        if (selected.length > pos.maxVotes) {
            showModal('error', 'Invalid Selection', `Too many candidates selected for ${pos.title}.`);
            isValid = false;
        }
        choices[pos.title] = selected;
    });

    if (!isValid) return;

    showModal('confirm', 'Confirm', 'Submit vote? This action cannot be undone.', async () => {
        try {
            const resp = await fetch('/api/vote', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: currentVoterId, choices }) 
            });
            const result = await resp.json();
            
            if (result.success) {
                // Populate the Receipt Modal
                document.getElementById('receipt-voter-id').innerText = currentVoterId;
                document.getElementById('receipt-date').innerText = new Date().toLocaleString();
                document.getElementById('receipt-no').innerText = 'TXN-' + Math.random().toString(36).substr(2, 9).toUpperCase();

                // Secret ballot: a receipt must NOT expose voter choices.
                document.getElementById('receipt-choices').textContent = 'Your ballot was received. Candidate selections are not displayed to protect ballot secrecy.';

                // 1. Force the Receipt Modal to appear visually on top of everything
                const receiptModal = document.getElementById('receipt-modal-overlay');
                receiptModal.classList.remove('hidden');
                receiptModal.style.display = 'flex';
                
                // 2. Wait 1.5 seconds so the user can look at the receipt, then auto-download
                setTimeout(() => {
                    downloadReceipt();
                    
                    // 3. Update the button to show success instead of firing a blocking alert
                    setTimeout(() => {
                        const dlBtn = document.getElementById('btn-download-receipt');
                        if (dlBtn) {
                            dlBtn.innerText = "✓ Receipt Downloaded";
                            dlBtn.style.background = "#dcfce7";
                            dlBtn.style.color = "#166534";
                            dlBtn.style.border = "1px solid #22c55e";
                        }
                    }, 1000);
                }, 1500);

            } else {
                showModal('error', 'Vote Failed', result.message);
            }
        } catch (err) { console.error(err); }
    });
}

// --- RECEIPT PDF GENERATOR ---
function downloadReceipt() {
    const receiptElement = document.getElementById('receipt-content');
    
    // We already have html2pdf.js loaded in our index.html script tags
    html2pdf().set({
        margin: 0.5,
        filename: `Guimba_BHW_Receipt_${currentVoterId}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    }).from(receiptElement).save();
}

// --- ADMIN FUNCTIONS ---
// Diagnostic face match report (not a biometric accuracy/probability estimate).
async function testBiometrics() {
    const btn = document.querySelector('button[onclick="testBiometrics()"]');
    if (btn?.disabled) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Analyzing face...'; }
    try {
        const descriptor = await getFaceDescriptor();
        if (!descriptor) return showModal('error', 'Face Not Detected', 'Position one face in the frame and look toward the camera.');
        const response = await fetch('/api/test-face', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ descriptor })
        });
        const result = await response.json();
        if (!response.ok && (response.status === 401 || response.status === 403)) {
            return showModal('error', 'Access Denied', result.message || 'Sign in as an administrator to test biometrics.');
        }
        const panel = document.getElementById('test-result-box');
        if (!panel) return;
        panel.classList.remove('hidden');
        panel.replaceChildren();
        panel.style.textAlign = 'center';
        panel.style.padding = '30px';
        const add = (tag, value, css) => {
            const el = document.createElement(tag);
            el.textContent = value;
            if (css) el.style.cssText = css;
            panel.appendChild(el);
            return el;
        };
        add('h3', 'Biometric Recognition Test', 'font-size:1.25rem; margin-bottom:12px; color:#0f172a');
        const success = Boolean(response.ok && result.success);
        add('div', success ? '✓ PASS — Face matched' : '✕ NOT MATCHED',
            `font-size:1.1rem;font-weight:700;color:${success ? '#15803d' : '#b91c1c'};margin-bottom:12px`);
        if (success) {
            add('p', result.name || 'Registered identity', 'font-size:1.1rem;color:#1e293b;font-weight:600;margin-bottom:14px');
            // Completion percentage is a workflow indicator, NOT biometric accuracy.
            add('div', '100%', 'font-size:2.6rem;font-weight:750;line-height:1.2;color:#15803d');
            add('p', 'Verification Complete — Identity Matched', 'font-size:0.95rem;font-weight:600;color:#475569;margin-bottom:12px');
            if (result.memberId) add('p', 'Account ID: ' + result.memberId, 'font-size:0.85rem;color:#475569;margin-bottom:5px');
            if (result.biometricId) add('p', 'Biometric record ID: ' + result.biometricId, 'font-size:0.8rem;color:#64748b;margin-bottom:8px');
            add('p', 'Recognition threshold: passed', 'color:#15803d;font-size:0.9rem;font-weight:600;margin-bottom:12px');
        } else {
            add('p', result.message || 'No matching active biometric record found.',
                'color:#64748b;font-size:0.95rem;margin-bottom:12px');
        }
    } catch (err) {
        showModal('error', 'Test Unavailable', 'Unable to complete the biometric test. Check the server connection.');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Scan Face & Test Recognition'; }
    }
}

// Reuse the same browser-side head-turn and blink challenge used during login.
// It is NOT a presentation-attack detection system or a guarantee of liveness.
async function runMemberEnrollmentChallenge() {
        const startResp = await fetch('/api/face-challenge',{
            method:'POST',headers:{'Content-Type':'application/json'},body:'{}'
        });
        const challenge = await startResp.json();
        if (!startResp.ok || !challenge.success) throw new Error(challenge.message || 'Cannot start challenge.');
        const actions = challenge.actions;
        const completedActions = [];
        // A slow CPU can take >300ms per face-api.js frame; allow time for complete blinks.
        const deadline = Date.now() + Math.min(110_000, (challenge.expiresInSeconds || 120) * 1000 - 5_000);
        const cue = document.getElementById('enroll-direction-cue');
        const status = document.getElementById('enroll-action-status');
        let firstTurnSign = null;
        const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
        // Directions below reflect observed movement in the VIDEO FRAME, not "your left/right".
        // On mirrored cameras, the arrow still follows what the user sees moving in the preview.
        for (let step = 0; step < actions.length; step++) {
            const action = actions[step];
            const isBlink = action === 'blink';
            if (cue) cue.classList.remove('hidden');
            if (status) { status.classList.remove('hidden'); status.textContent = isBlink ? 'Look straight at the camera, then close and OPEN your eyes.' : step === 0 ? 'Turn your head to either side. The arrow follows your movement.' : 'Return to center, then turn to the OTHER side.'; }
            let neutralFrames = 0;
            let samples = [];
            let blinkClosed = false;
            let lowestEyeRatio = 1;
            let eyeBaseline = null;
            let framesInDirection = 0;
            let lastTurnSign = 0;
            let stageDone = false;
            while (Date.now() < deadline) {
                const detection = await faceapi.detectSingleFace(video).withFaceLandmarks();
                if (!detection) {
                    framesInDirection = 0;
                    if (status) status.textContent = 'Face lost. Move into the center of the camera.';
                    await pause(100);
                    continue;
                }
                const lm = detection.landmarks;
                const nose = lm.getNose()[3];
                const jaw = lm.getJawOutline();
                const center = (jaw[0].x + jaw[16].x) / 2;
                const halfWidth = Math.max(Math.abs(jaw[16].x - jaw[0].x) / 2, 1);
                const turn = (nose.x - center) / halfWidth;
                const ear = (calculateEAR(lm.getLeftEye()) + calculateEAR(lm.getRightEye())) / 2;
                const centered = Math.abs(turn) < 0.17;
                if (isBlink) {
                    // Calibrate with open eyes FIRST; do not continuously update the baseline
                    // while blinking, as that can make closure impossible to detect.
                    if (eyeBaseline === null && Number.isFinite(ear) && ear > 0.10 && Math.abs(turn) < 0.32) {
                        samples.push(ear);
                        if (samples.length >= 3) {
                            const sorted = samples.slice().sort((a,b) => a-b);
                            eyeBaseline = sorted[Math.floor(sorted.length / 2)];
                        }
                    }
                    if (eyeBaseline === null) {
                        if (cue) cue.textContent = '👁 KEEP EYES OPEN';
                        if (status) status.textContent = `Calibrating open eyes (${samples.length}/3)… face the camera.`;
                    } else if (!Number.isFinite(ear) || Math.abs(turn) > 0.32) {
                        if (status) status.textContent = 'Keep your face centered and visible.';
                    } else {
                        // Relative EAR thresholds tolerate different eye shapes and glasses.
                        // Require close -> reopen; a permanently closed eye cannot pass.
                        // Minimum strictness for this development demo. A small detectable dip
                        // followed by recovery passes; this is NOT liveness/PAD.
                        const closeLimit = eyeBaseline * 0.96;
                        const reopenLimit = eyeBaseline * 0.94;
                        const relative = Math.round(ear / eyeBaseline * 100);
                        lowestEyeRatio = Math.min(lowestEyeRatio, ear / eyeBaseline);
                        if (!blinkClosed) {
                            if (cue) cue.textContent = '👁 CLOSE THEN OPEN';
                            if (ear <= closeLimit) {
                                blinkClosed = true;
                                if (status) status.textContent = `Eyes closed detected (${relative}% of baseline). Now OPEN.`;
                            } else if (status) {
                                status.textContent = `Eye openness: ${relative}% — close both eyes slowly, then reopen.`;
                            }
                        } else {
                            if (cue) cue.textContent = '👁 OPEN YOUR EYES';
                            // Face-api can sample slowly, so one clearly reopened-eye
                            // frame after confirmed closure is sufficient for this UI step.
                            // Do not add a wall-clock minimum: the detection pass itself
                            // may already take hundreds of milliseconds on modest CPUs.
                            if (ear >= reopenLimit && ear / eyeBaseline >= lowestEyeRatio + 0.025) {
                                stageDone = true;
                                if (status) status.textContent = `Blink confirmed (${relative}% open) ✓`;
                                break;
                            }
                            if (status) status.textContent = `Eyes closed confirmed. Reopen eyes (${relative}% of baseline).`;
                        }
                    }
                } else {
                    if (centered) neutralFrames++;
                    // Center MUST be observed at the beginning of each turn step.
                    if (neutralFrames < 2) {
                        if (cue) cue.textContent = '↔ FACE FORWARD';
                        if (status) status.textContent = 'Look straight ahead first…';
                    } else {
                        const sign = turn < -0.19 ? -1 : turn > 0.19 ? 1 : 0;
                        if (cue) cue.textContent = sign < 0 ? '← MOVING LEFT' : sign > 0 ? 'MOVING RIGHT →' : '↔ TURN YOUR HEAD';
                        const validSign = step === 0 ? sign !== 0 : sign !== 0 && sign === -firstTurnSign;
                        if (validSign) {
                            framesInDirection = lastTurnSign === sign ? framesInDirection + 1 : 1;
                            lastTurnSign = sign;
                            if (framesInDirection >= 2) {
                                if (step === 0) firstTurnSign = sign;
                                stageDone = true;
                                if (status) status.textContent = 'Head turn confirmed ✓';
                                break;
                            }
                        } else {
                            framesInDirection = 0;
                            if (status) status.textContent = step === 0 ? 'Turn left or right until the arrow follows.' : sign === firstTurnSign ? 'That is the first direction. Turn the opposite way.' : 'Turn to the opposite side.';
                        }
                    }
                }
                await pause(90);
            }
            if (!stageDone) throw new Error(isBlink ? 'Blink was not confirmed before the challenge expired. Try a deliberate close-and-open blink in good light.' : 'Head-turn challenge timed out. Try again with your full face visible.');
            completedActions.push(action);
            await pause(300);
        }
        if (cue) cue.classList.add('hidden');
        if (status) status.classList.add('hidden');
        if (status) status.textContent = 'Capturing final biometric template…';
        const finalDetection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
        if (!finalDetection) throw new Error('Face not detected after challenge.');
        const descriptor = Array.from(finalDetection.descriptor);
        return {descriptor, challengeId:challenge.challengeId, completedActions};

}

async function registerNewMember() {
    const firstName = document.getElementById('reg-fname').value.trim();
    const middleName = document.getElementById('reg-mname').value.trim();
    const lastName = document.getElementById('reg-lname').value.trim();
    const address = getMemberAddress();
    const birthdate = document.getElementById('reg-bdate').value;
    const gender = document.getElementById('reg-gender').value;
    const area = document.getElementById('reg-area').value;

    if (!firstName || !lastName || !address || !birthdate || !gender || !area)
        return showModal('error', 'Required Fields', 'Complete all fields marked with a red asterisk. Middle Name is optional.');
    if ([firstName, middleName, lastName].filter(Boolean).join(' ').length > 100)
        return showModal('error', 'Name Too Long', 'Full name must be 100 characters or fewer.');

    const today = new Date(), dob = new Date(`${birthdate}T00:00:00`);
    if (Number.isNaN(dob.getTime()) || dob > today)
        return showModal('error', 'Invalid Birthdate', 'Enter a valid birthdate.');
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    if (age < 18) return showModal('error', 'Age Restriction', 'Member must be 18+.');

    if (!isModelsLoaded) return showModal('error', 'Camera Not Ready', 'Wait for the facial recognition models to finish loading.');
    const modal = document.getElementById('member-enrollment-modal');
    const cameraSlot = document.getElementById('member-enrollment-camera-slot');
    const container = document.getElementById('video-container');
    cameraSlot.appendChild(container);
    container.classList.remove('hidden');
    modal.classList.remove('hidden');
    document.getElementById('enroll-action-status').textContent = 'Position your face in the camera, then start verification.';
    document.getElementById('enroll-direction-cue').textContent = 'READY TO SCAN';
    document.getElementById('enroll-direction-cue').classList.remove('hidden');
    const beginBtn = document.getElementById('member-enrollment-start');
    beginBtn.disabled = false;
    beginBtn.textContent = 'Start Verification';
    beginBtn.onclick = async () => {
        beginBtn.disabled = true;
        beginBtn.textContent = 'Verifying Face…';
        document.getElementById('member-enrollment-cancel').disabled = true;
        try {
            if (!video.srcObject || video.readyState < 2) await startVideo();
            const verification = await runMemberEnrollmentChallenge();
            if (!video.videoWidth || !video.videoHeight) throw new Error('Camera image is not ready.');
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            const photoUrl = canvas.toDataURL('image/jpeg', 0.8);
            beginBtn.textContent = 'Saving Member…';
            const resp = await fetch('/api/admin/register-member', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({firstName,middleName,lastName,address,location:collectLocation(),birthdate,gender,area,photoUrl,...verification})
            });
            const result = await resp.json();
            if (!resp.ok || !result.success) throw new Error(result.message || 'Could not register member.');
            closeMemberEnrollmentModal();
            ['reg-fname','reg-mname','reg-lname','addr-street','reg-bdate','reg-gender'].forEach(id => { document.getElementById(id).value=''; });
            resetAddressSelectors();
            fetchMembers();
            showModal('success','Member Created',`Registration complete! ID: ${result.memberId}`);
        } catch (error) {
            document.getElementById('enroll-action-status').textContent = 'Verification was not completed. You may try again.';
            showModal('error','Registration Not Completed',error.message || 'Please try again.');
        } finally {
            const stillOpen = !modal.classList.contains('hidden');
            beginBtn.disabled = false;
            beginBtn.textContent = 'Try Verification Again';
            document.getElementById('member-enrollment-cancel').disabled = false;
            if(stillOpen) document.getElementById('enroll-direction-cue').textContent = 'READY TO RETRY';
        }
    };
}

function closeMemberEnrollmentModal() {
    document.getElementById('member-enrollment-modal').classList.add('hidden');
    const slot = document.getElementById('admin-camera-slot');
    const camera = document.getElementById('video-container');
    slot.appendChild(camera);
    camera.classList.remove('hidden');
    document.getElementById('enroll-direction-cue').classList.add('hidden');
}


let allMembers = [];
let filteredMembers = [];
let currentPage = 1;
const rowsPerPage = 10;

// 1. Fetch data and store it in our global arrays
async function fetchMembers() {
    try {
        const resp = await fetch('/api/admin/members');
        const data = await resp.json();
        if (data.success) {
            allMembers = data.members;
            filteredMembers = [...allMembers]; // Default view is all members
            currentPage = 1;
            renderTable();
        }
    } catch (err) { console.error("Could not fetch members:", err); }
}

// 2. Filter dynamically by ID, Name, OR Area
function filterMembers() {
    const query = document.getElementById('member-search').value.toLowerCase();
    filteredMembers = allMembers.filter(m => 
        (m.member_id && m.member_id.toLowerCase().includes(query)) || 
        (m.full_name && m.full_name.toLowerCase().includes(query)) || 
        (m.area && m.area.toLowerCase().includes(query))
    );
    currentPage = 1; // Reset to page 1 when searching
    renderTable();
}

// 3. Render the paginated data to the table matching the new DB structure
function renderTable() {
    const tbody = document.getElementById('members-tbody');
    if (!tbody) return;
    tbody.innerHTML = "";
    
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const paginatedItems = filteredMembers.slice(start, end);
    const totalPages = Math.ceil(filteredMembers.length / rowsPerPage) || 1;

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding: 15px; text-align: center; color: var(--text-muted);">No members found matching your search.</td></tr>`;
    } else {
        paginatedItems.forEach(m => {
            const voteStatus = m.has_voted 
                ? `<span style="color: var(--success); font-weight: bold;">Yes</span>` 
                : `<span style="color: var(--danger); font-weight: bold;">No</span>`;
            
            const accountStatus = m.is_active 
                ? `<span style="background: #dcfce7; color: #22c55e; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">Active</span>` 
                : `<span style="background: #fee2e2; color: #ef4444; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">Disabled</span>`;

            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid #e2e8f0; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 15px; font-size: 0.9rem; font-weight: bold;">${m.member_id}</td>
                    <td style="padding: 15px; font-weight: 500;">${m.full_name}</td>
                    <td style="padding: 15px; font-size: 0.9rem;">${m.area || 'N/A'}</td>
                    <td style="padding: 15px;">${accountStatus}</td>
                    <td style="padding: 15px;">${voteStatus}</td>
                    <td style="padding: 15px;">
                        <button class="btn-sm" style="background: var(--primary); color: white;" onclick="openEditMemberModal('${m.member_id}', '${m.full_name.replace(/'/g, "\\'")}', '${m.area}', ${m.is_active})">Edit</button>
                    </td>
                </tr>
            `;
        });
    }
    
    // Update pagination text
    const pageInfo = document.getElementById('page-info');
    if (pageInfo) pageInfo.innerText = `Page ${currentPage} of ${totalPages}`;
}

// 4. Handle pagination clicks
function changePage(direction) {
    const totalPages = Math.ceil(filteredMembers.length / rowsPerPage) || 1;
    if (currentPage + direction > 0 && currentPage + direction <= totalPages) {
        currentPage += direction;
        renderTable();
    }
}


let posCount = 0;
function getCandidateHTML() {
    return `<div class="candidate-entry" style="display:flex;gap:10px;margin-bottom:10px;align-items:center;flex-wrap:wrap">
        <input type="text" class="cand-name" placeholder="Candidate Name" style="margin:0;flex:2;min-width:220px">
        <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onchange="encodeCandidateImage(this)" style="margin:0;flex:1;min-width:150px;font-size:.8rem;background:white;padding:9px">
        <input type="hidden" class="cand-photo-base64"><button type="button" class="btn btn-danger" style="width:auto;padding:8px" onclick="this.closest('.candidate-entry').remove();updateBallotNextButton()">Remove Candidate</button></div>`;
}
function escapeReportText(v) {return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function addPositionBlock() {
    posCount++;
    const html = `
        <div class="card" id="pos-${posCount}" style="margin-bottom: 15px; background: #f8fafc; border: 1px solid #e2e8f0;">
            <div style="display:flex; gap: 15px; margin-bottom: 10px;">
                <input type="text" class="pos-title" placeholder="Position Title" style="width: 70%; font-weight: bold; margin:0;">
                <div style="width:30%;min-width:100px"><label style="display:block;font-weight:700;font-size:.85rem;margin-bottom:4px">Max Votes <span style="color:#b91c1c">*</span></label><input type="number" class="pos-max" aria-label="Max Votes required" placeholder="Required *" min="1" max="100" step="1" value="1" required oninput="updateBallotNextButton()" style="width:100%;margin:0"></div>
            </div>
            <div class="candidate-list" style="margin-left: 20px;">
                ${getCandidateHTML()}
                ${getCandidateHTML()}
            </div>
            <button class="btn" style="background:#e2e8f0; color:#475569; width:auto; padding: 8px 16px; margin-left: 20px;" onclick="addCandidateInput(this)">+ Add Candidate</button>
            
            <button class="btn btn-danger" onclick="this.parentElement.remove()" style="float: right; width: auto; padding: 8px 16px; background: #ef4444; color: white; border: none;">Remove</button>
            <div style="clear:both;"></div>
        </div>
    `;
    document.getElementById('position-container').insertAdjacentHTML('beforeend', html);
    updateBallotNextButton();
}

function addCandidateInput(btn) {
    btn.previousElementSibling.insertAdjacentHTML('beforeend', getCandidateHTML());
}

function formatElectionSchedulePH(value) {
    if (!value) return 'Not scheduled';
    // The backend serializes MySQL DATETIME as YYYY-MM-DDTHH:mm:ss.
    // Election schedule fields are entered as Philippine wall-clock time.
    const matched = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!matched) return 'Invalid date';
    const [, year, month, day, hour, minute, second] = matched;
    const date = new Date(Date.UTC(+year, +month - 1, +day, +hour - 8, +minute, +(second || 0)));
    if (Number.isNaN(date.getTime())) return 'Invalid date';
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short'
    }).format(date);
}

async function fetchTurnout() {
    try {
        const resp = await fetch('/api/admin/monitoring');
        const data = await resp.json();
        if (data.success) {
            const t = data.totalMembers; const v = data.totalVoted;
            const pct = t === 0 ? 0 : Math.round((v/t) * 100);
            
            // Update Landing Page Stats (if they exist)
            const lReg = document.getElementById('landing-registered');
            const lVot = document.getElementById('landing-voted');
            if (lReg) lReg.innerText = t;
            if (lVot) lVot.innerText = v;

            // Update New Dashboard 4-Card Elements
            const dashReg = document.getElementById('stat-total-reg');
            const dashVoted = document.getElementById('stat-total-voted');
            const dashPct = document.getElementById('stat-turnout-pct');
            
            if (dashReg) dashReg.innerText = t;
            if (dashVoted) dashVoted.innerText = v;
            if (dashPct) dashPct.innerText = `${pct}%`;
            
            // Update Election Status Headers
            const dt = document.getElementById('dash-elec-title');
            const dBadge = document.getElementById('dash-elec-status-badge');
            const aesStatus = document.getElementById('stat-aes-status');
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

            
            // --- NEW: Lock UI Elements ---
            const wizardContainer = document.getElementById('setup-wizard-container');
            const lockWarning = document.getElementById('active-election-warning');
            
            if (dt) {
                if (data.activeTitle) {
                    dt.innerText = data.activeTitle;
                    if(dBadge) { dBadge.innerText = '● Election Ongoing'; dBadge.style.color = "var(--success)"; }
                    if(aesStatus) aesStatus.innerText = 'Locked';
                    
                    // Lock the Setup Tab
                    if(wizardContainer && lockWarning) {
                        wizardContainer.classList.add('hidden');
                        lockWarning.classList.remove('hidden');
                    }
                } else {
                    dt.innerText = "No Active Election";
                    if(dBadge) { dBadge.innerText = '● Inactive'; dBadge.style.color = "var(--text-muted)"; }
                    if(aesStatus) aesStatus.innerText = 'Unlocked';
                    
                    // Unlock the Setup Tab
                    if(wizardContainer && lockWarning) {
                        wizardContainer.classList.remove('hidden');
                        lockWarning.classList.add('hidden');
                    }
                }
            }
            
            // Update the Admin's Name in the greeting based on the login data
            // Update the Admin's Name in the greeting based on the login data
            

            renderDashboardCharts();
        }
    } catch (err) {}
}

function updateSelectedElectionDetails(e) {
    const node=document.getElementById('selected-election-details');
    if(!node)return;
    if(!e){node.textContent='No saved election selected.';return;}
    const safeDate=v=>v?new Date(v).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'Not scheduled';
    node.innerHTML=`<div class="card" style="background:#f8fafc;padding:12px"><strong>${escapeReportText(e.title||'Untitled election')}</strong><p>Election ID: ${escapeReportText(e.id||'Not available')}</p><p>Status: ${e.finalized?'Verified final results':'Not finalized'} · Candidates: ${Number(e.candidate_count||0)} · Ballots: ${Number(e.ballot_count||0)}</p><p>Voting period: ${escapeReportText(safeDate(e.start_time))} – ${escapeReportText(safeDate(e.end_time))}</p></div>`;
}
async function fetchHistory() {
    const dd=document.getElementById('history-dropdown');
    if (!dd) return;
    try {
        const resp=await fetch('/api/admin/history',{cache:'no-store'}), data=await resp.json();
        if (!resp.ok || !data.success) throw Error(data.message||'Unable to load election records');
        const previous=dd.value;
        dd.replaceChildren();
        if (!data.history.length) {
            dd.add(new Option('No election records yet',''));
        } else {
            for(const e of data.history) {
                const name=String(e.title||'Untitled election');
                const state=e.finalized?'VERIFIED':e.status==='Active'?'UNVERIFIED / OPEN':'UNVERIFIED / ENDED';
                dd.add(new Option(`${name} — ${state} — ${Number(e.candidate_count||0)} candidate(s)`,String(e.id)));
            }
            if ([...dd.options].some(x=>x.value===previous)) dd.value=previous;
        }
        const selection=data.history.find(e=>String(e.id)===String(dd.value));
        dd.dataset.finalized=selection?.finalized?'1':'0';
        updateSelectedElectionDetails(selection);
        dd.onchange=()=>{const e=data.history.find(item=>String(item.id)===String(dd.value));dd.dataset.finalized=e?.finalized?'1':'0';updateSelectedElectionDetails(e);loadSelectedElectionReport();};
        await loadSelectedElectionReport();
    }catch(err){
        dd.replaceChildren(new Option('Unable to load election history',''));
        console.error('Election history:',err);
        showModal('error','History Error',err.message);
    }
}
async function loadSelectedElectionReport() {
    const dd=document.getElementById('history-dropdown');
    const id=dd?.value;
    verifiedElectionReport=null;
    document.getElementById('results-display')?.classList.add('hidden');
    document.getElementById('btn-pdf')?.classList.add('hidden');
    document.querySelector('.report-export-controls')?.classList.add('hidden');
    const status=document.getElementById('report-verification-status');
    if (!id) {if(status)status.textContent='No election record is available.';return;}
    if (dd.dataset.finalized!=='1') {
        if(status)status.textContent='This election is not finalized. Enter all custodian tokens and click Verify & Unlock after the election ends.';
        return;
    }
    if(status)status.textContent='Loading the verified and saved election report…';
    try {
        const resp=await fetch('/api/admin/final-report/'+encodeURIComponent(id),{cache:'no-store'});
        const data=await resp.json();
        if(!resp.ok||!data.success)throw Error(data.message||'Report unavailable');
        verifiedElectionReport=data.report;
        renderVerifiedReport(data.report);
        if(status)status.textContent='Verified final report — safely retrieved from the saved database snapshot.';
    }catch(err){if(status)status.textContent='Could not load the saved final report: '+err.message;}
}

async function discloseResults() {
    const electionId=document.getElementById('history-dropdown').value;
    const providedTokens=[...document.querySelectorAll('.unlock-token')].map(el=>el.value.trim()).filter(Boolean);
    if(!providedTokens.length)return showModal('error','Missing Keys','Provide all key-custodian tokens before finalization.');
    try {
        const response=await fetch('/api/admin/disclose-results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({electionId,providedTokens})});
        const data=await response.json();
        if(!response.ok||!data.success)throw Error(data.message||'Verification failed');
        verifiedElectionReport=data.report;
        renderVerifiedReport(data.report);
        showModal('success','Finalized Results',data.message);
        fetchHistory();
    }catch(e){showModal('error','Finalization Failed',e.message);}
}
function renderVerifiedReport(report) {
    if (!report || !Array.isArray(report.positions) || !report.areas) {showModal('error','Invalid Report','The saved report format is incomplete.');return;}
    document.getElementById('results-display').classList.remove('hidden');
    document.getElementById('btn-pdf').classList.remove('hidden');
    document.getElementById('report-title').textContent='Verified Election Report: '+String(report.title||'Election');
    const summary=`<p><strong>Ballots:</strong> ${report.ballots} &nbsp; <strong>Registered members:</strong> ${report.registered} &nbsp; <strong>Turnout:</strong> ${report.registered?(report.ballots/report.registered*100).toFixed(1):'0.0'}%</p>`;
    document.getElementById('dynamic-results').innerHTML=summary+report.positions.map(pos=>`<h3 style="margin:16px 0 8px">${escapeReportText(pos.position)} — ${pos.seats} seat(s)</h3>${pos.tieUnresolved?'<p style="color:#b45309">Tie across the seat cutoff — affected seats are unresolved.</p>':''}<div class="table-responsive-wrapper"><table><thead><tr><th>Candidate</th><th>Votes</th><th>Decision</th></tr></thead><tbody>${pos.candidates.map(c=>`<tr><td>${escapeReportText(c.name)}</td><td>${c.votes}</td><td>${escapeReportText(c.outcome)}</td></tr>`).join('')}</tbody></table></div>`).join('');
    const dropdown=document.getElementById('report-area-select');
    dropdown.replaceChildren(new Option('Overall election results','overall'));
    Object.keys(report.areas).sort().forEach(area=>dropdown.add(new Option(area,area)));
    dropdown.closest('.report-export-controls').classList.remove('hidden');
}
// The PDF renderer is bundled locally; neither internet access nor jsPDF is required.
function downloadPDF() {
    const report = verifiedElectionReport;
    if (!report || !Array.isArray(report.positions) || !report.areas) {
        return showModal('error', 'No Verified Results', 'Load a verified report before exporting.');
    }
    const scope = document.getElementById('report-area-select')?.value || 'overall';
    if (scope !== 'overall' && !Object.prototype.hasOwnProperty.call(report.areas, scope)) {
        return showModal('error', 'Invalid Area', 'Choose a valid area from the report selector.');
    }
    if (typeof window.ElectionPDF?.download !== 'function') {
        return showModal('error', 'PDF Generator Missing', 'The local PDF report script is missing. Verify that /js/report-pdf.js is installed.');
    }
    try {
        window.ElectionPDF.download(report, scope);
    } catch (err) {
        console.error('PDF export failed:', err);
        showModal('error', 'PDF Export Failed', String(err.message || err));
    }
}

let memberNoticeItems=[];
function toggleMemberNotifications(force) {
    const panel=document.getElementById('member-notifications'),button=document.getElementById('member-notifications-toggle');
    if(!panel||!button)return;
    const open=typeof force==='boolean'?force:panel.hidden;
    panel.hidden=!open;panel.classList.toggle('hidden',!open);
    button.setAttribute('aria-expanded',String(open));
    const chevron=document.getElementById('member-notifications-chevron');if(chevron)chevron.textContent=open?'▴':'▾';
}
function renderMemberNotificationInbox(){
    const host=document.getElementById('member-notifications');if(!host)return;
    const notes=memberNoticeItems;
    const unread=notes.filter(n=>!n.read_at).length;
    const counter=document.getElementById('member-notification-count');
    if(counter){counter.textContent=unread>99?'99+':String(unread);counter.classList.toggle('hidden',!unread);}
    host.innerHTML='<h3 style="margin-bottom:10px">My Notifications'+(unread?' ('+unread+' unread)':'')+'</h3>'+(notes.length?notes.map(n=>`<div class="member-notice ${n.read_at?'':'unread'}"><strong>${escapeReportText(n.title)}</strong><p>${escapeReportText(n.message)}</p><small>${escapeReportText(new Date(n.created_at).toLocaleString('en-PH'))}</small>${n.read_at?'':`<button type="button" class="btn-sm confirm-btn" onclick="markMemberNoticeRead(${Number(n.id)})">Mark as read</button>`}</div>`).join(''):'<p class="member-inbox-empty">No messages yet. Verified election results will be delivered to your account here.</p>');
}
async function loadMemberNotifications() {
    const host=document.getElementById('member-notifications');if(!host)return;
    try{
        const resp=await fetch('/api/member/notifications',{cache:'no-store'});
        if(!resp.ok)throw new Error('HTTP '+resp.status);
        const data=await resp.json();
        memberNoticeItems=Array.isArray(data.notifications)?data.notifications:[];
        renderMemberNotificationInbox();
    }catch(e){console.error('Notification inbox unavailable',e);host.innerHTML='<p>Unable to load messages. Please sign in again.</p>';}
}
async function markMemberNoticeRead(id) {
    try{
        const response=await fetch('/api/member/notifications/'+encodeURIComponent(id)+'/read',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
        if(!response.ok)throw Error('Could not mark notification as read');
        await loadMemberNotifications();
    }catch(e){showModal('error','Notification Error',e.message);}
}

function addEmailInput() {
    document.getElementById('email-container').insertAdjacentHTML('beforeend', `<input type="email" class="custodian-email" placeholder="Custodian Email">`);
}
function addTokenInput() {
    document.getElementById('token-container').insertAdjacentHTML('beforeend', `<input type="password" class="unlock-token" style="font-family: monospace;" placeholder="Paste Token Here">`);
}

// --- DYNAMIC AREAS ---
async function fetchAreas() {
    try {
        const resp = await fetch('/api/areas');
        const data = await resp.json();
        const areaSelect = document.getElementById('reg-area');
        if (areaSelect && data.success) {
            areaSelect.innerHTML = data.areas.length === 0 ? '<option value="">No Areas Found</option>' : '';
            data.areas.forEach(a => {
                areaSelect.innerHTML += `<option value="${a.name}">${a.name}</option>`;
            });
        }
    } catch (err) { console.error("Could not load areas"); }
}

async function addNewArea() {
    const overlay = document.getElementById('input-modal-overlay');
    const title = document.getElementById('input-modal-title');
    const inputField = document.getElementById('input-modal-field');
    const confirmBtn = document.getElementById('input-modal-confirm');
    
    title.innerText = "Create New Area";
    inputField.value = "";
    inputField.placeholder = "e.g., Area 1 or Purok 5";
    overlay.classList.remove('hidden');

    confirmBtn.onclick = async () => {
        const areaName = inputField.value.trim();
        if (!areaName) return;
        
        // Hide modal and show loading state
        overlay.classList.add('hidden');
        
        try {
            const resp = await fetch('/api/admin/areas', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: areaName })
            });
            const data = await resp.json();
            
            if (data.success) {
                showModal('success', 'Area Added', `${areaName} has been successfully created.`);
                fetchAreas(); // Refresh dropdown
            } else {
                showModal('error', 'Action Failed', data.message);
            }
        } catch (err) { 
            showModal('error', 'Server Error', 'Could not add area due to a network error.'); 
        }
    };
}


// --- AUDIT LOGS ---
async function fetchLogs() {
    try {
        const resp = await fetch('/api/admin/logs');
        const data = await resp.json();
        const tbody = document.getElementById('logs-tbody');
        if (tbody && data.success) {
            tbody.innerHTML = '';
            if (data.logs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="padding: 15px; text-align: center; color: var(--text-muted);">No activity recorded yet.</td></tr>`;
                return;
            }
            data.logs.forEach(log => {
                const isSystem = log.user_id === 'SUPERADMIN' || log.user_id === 'SYSTEM';
                // Show Name and ID together
                let displayName = log.user_id;
                if (log.first_name && log.last_name) {
                    displayName = `${log.first_name} ${log.last_name} (${log.user_id})`;
                } else if (log.user_id === 'SUPERADMIN') {
                    displayName = 'Super Admin (System)';
                }

                tbody.innerHTML += `
                    <tr style="border-bottom: 1px solid #e2e8f0; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 15px; font-size: 0.85rem; color: var(--text-muted);">${new Date(log.timestamp).toLocaleString()}</td>
                        <td style="padding: 15px; font-weight: bold; color: ${isSystem ? 'var(--primary)' : 'var(--text-main)'};">
                            ${isSystem ? '🛡️ ' : '👤 '}${displayName}
                        </td>
                        <td style="padding: 15px; font-size: 0.95rem;">${log.action}</td>
                        
                    </tr>
                `;
            });
        }
    } catch (err) { console.error("Could not fetch logs:", err); }
}

// --- DASHBOARD CHARTS ---
// --- DASHBOARD CHARTS (LINE & PIE) ---
async function renderDashboardCharts() {
    if (currentAdminRole === '') return; // Only render if admin is logged in

    try {
        // 1. FETCH DATA
        const [timeResp, areaResp] = await Promise.all([
            fetch('/api/admin/timeline-stats'),
            fetch('/api/admin/area-stats')
        ]);
        const timeData = await timeResp.json();
        const areaData = await areaResp.json();

        // 2. RENDER TIMELINE LINE CHART
        if (timeData.success) {
            const hourlyCounts = {};
            // Group votes by Date and Hour
            timeData.logs.forEach(log => {
                const date = new Date(log.timestamp);
                const hour = date.getHours();
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const h = hour % 12 || 12;
                const label = `${date.getMonth() + 1}/${date.getDate()} - ${h} ${ampm}`;
                hourlyCounts[label] = (hourlyCounts[label] || 0) + 1;
            });

            let cumulative = 0;
            const labels = [];
            const chartData = [];
            
            for (const [label, count] of Object.entries(hourlyCounts)) {
                labels.push(label);
                cumulative += count;
                chartData.push(cumulative); // Line chart climbs upward
            }

            const lineCtx = document.getElementById('timelineChart').getContext('2d');
            if (timelineChartInstance) timelineChartInstance.destroy();

            timelineChartInstance = new Chart(lineCtx, {
                type: 'line',
                data: {
                    labels: labels.length > 0 ? labels : ['No Votes Yet'],
                    datasets: [{
                        label: 'Total Votes Cast',
                        data: chartData.length > 0 ? chartData : [0],
                        borderColor: '#1d7642',
                        backgroundColor: 'rgba(29, 118, 66, 0.1)',
                        fill: true,
                        tension: 0.4, // Smooth curved line
                        pointBackgroundColor: '#1d7642'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            });
        }

        // 3. RENDER AREA PIE/DOUGHNUT CHARTS
        if (areaData.success) {
            const container = document.getElementById('area-pie-charts');
            container.innerHTML = '';
            
            // Destroy old pie chart instances to prevent memory leaks
            Object.values(areaPieInstances).forEach(chart => chart.destroy());
            areaPieInstances = {};

            if (areaData.stats.length === 0) {
                container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No areas configured.</p>';
            }

            areaData.stats.forEach((stat, index) => {
                const areaName = stat.area || 'Unassigned';
                const voted = Number(stat.voted) || 0;
                const notVoted = Number(stat.total) - voted;
                const pct = stat.total > 0 ? Math.round((voted / stat.total) * 100) : 0;

                // Create the HTML structure for each Area
                const wrapper = document.createElement('div');
                wrapper.style = "display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9;";
                wrapper.innerHTML = `
                    <div style="flex: 1;">
                        <h4 style="margin: 0; color: var(--admin-dark); font-size: 0.95rem;">${areaName}</h4>
                        <p style="margin: 3px 0 0 0; font-size: 0.75rem; color: var(--text-muted);">${voted} voted out of ${stat.total}</p>
                        <span style="font-size: 0.7rem; font-weight: bold; color: ${pct === 100 ? 'var(--success)' : 'var(--primary)'};">${pct}% Turnout</span>
                    </div>
                    <div style="width: 65px; height: 65px; position: relative;">
                        <canvas id="pie-${index}"></canvas>
                    </div>
                `;
                container.appendChild(wrapper);

                // Render the Doughnut Chart for this specific Area
                const pieCtx = document.getElementById(`pie-${index}`).getContext('2d');
                areaPieInstances[index] = new Chart(pieCtx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Voted', 'Not Voted'],
                        datasets: [{
                            data: [voted, notVoted],
                            backgroundColor: ['#1d7642', '#e2e8f0'],
                            borderWidth: 0
                        }]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        plugins: { legend: { display: false }, tooltip: { enabled: false } }, 
                        cutout: '65%' // Makes it a sleek ring shape
                    }
                });
            });
        }
    } catch (err) { console.error("Error rendering charts:", err); }
}

// --- ADMIN MANAGEMENT ---
async function registerNewAdmin() {
    const firstName = document.getElementById('admin-fname').value.trim();
    const middleName = document.getElementById('admin-mname').value.trim();
    const lastName = document.getElementById('admin-lname').value.trim();

    if (!firstName || !lastName) return showModal('error', 'Required Fields', 'First Name and Last Name are required.');

    showModal('confirm', 'Capture Admin Biometrics', 'Ask the new admin to look directly at the camera. Ready?', async () => {
        const descriptor = await getFaceDescriptor();
        if (!descriptor) return showModal('error', 'Capture Failed', "Face scan failed.");

        // Capture profile photo
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const photoUrl = canvas.toDataURL('image/jpeg', 0.8);

        try {
            const resp = await fetch('/api/superadmin/register-admin', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName, middleName, lastName, photoUrl, descriptor })
            });
            const result = await resp.json();
            if (result.success) {
                showModal('success', 'Admin Created', `Success! ID: ${result.adminId}. They can now log in via Face ID.`);
                document.getElementById('admin-fname').value = '';
                document.getElementById('admin-mname').value = '';
                document.getElementById('admin-lname').value = '';
            } else showModal('error', 'Database Error', result.message);
        } catch (err) { showModal('error', 'Server Error', 'Could not register admin.'); }
    });
}

// --- SUPER ADMIN ACCOUNT MANAGEMENT ---
async function fetchSystemUsers() {
    if (currentAdminRole !== 'superadmin') return;
    try {
        const resp = await fetch('/api/superadmin/users');
        const data = await resp.json();
        const tbody = document.getElementById('system-users-tbody');
        if (tbody && data.success) {
            tbody.innerHTML = '';
            data.users.forEach(u => {
                const badgeColor = u.role === 'superadmin' ? '#8b5cf6' : (u.role === 'admin' ? '#3b82f6' : '#64748b');
                const statusColor = u.is_active ? 'var(--success)' : 'var(--danger)';
                const actionBtn = u.member_id === 'SUPERADMIN' ? '' : 
                    `<button class="btn-sm" style="background: ${u.is_active ? '#fee2e2' : '#dcfce7'}; color: ${u.is_active ? '#ef4444' : '#22c55e'}; padding: 4px 10px; font-size: 0.75rem;" onclick="toggleUserStatus('${u.member_id}', ${u.is_active})">
                        ${u.is_active ? 'Disable' : 'Enable'}
                    </button>`;

                tbody.innerHTML += `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 12px; font-weight: 600;">${u.member_id}</td>
                        <td style="padding: 12px;">${u.first_name} ${u.last_name}</td>
                        <td style="padding: 12px;"><span style="background: ${badgeColor}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; text-transform: capitalize;">${u.role}</span></td>
                        <td style="padding: 12px; font-weight: bold; color: ${statusColor};">${u.is_active ? 'Active' : 'Disabled'}</td>
                        <td style="padding: 12px;">${actionBtn}</td>
                    </tr>
                `;
            });
        }
    } catch (err) { console.error("Error fetching users"); }
}

async function toggleUserStatus(targetId, currentStatus) {
    let reason = null;
    if (currentStatus === 1) {
        reason = prompt(`Please enter the official reason for disabling ${targetId}:`);
        if (reason === null) return; // User cancelled
        if (reason.trim() === '') {
            return showModal('error', 'Reason Required', 'You must provide a reason to disable an account for accountability.');
        }
    }

    const action = currentStatus === 1 ? 'Disable' : 'Enable';
    showModal('confirm', `${action} Account`, `Are you sure you want to ${action.toLowerCase()} ${targetId}?`, async () => {
        try {
            const resp = await fetch('/api/superadmin/toggle-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetId, currentStatus, reason: reason ? reason.trim() : null })
            });
            const data = await resp.json();
            if (data.success) fetchSystemUsers();
            else showModal('error', 'Action Failed', data.message || 'Could not update status.');
        } catch (err) { console.error(err); }
    });
}


// ==========================================
// ELECTION WIZARD NAVIGATION & SUBMISSION
// ==========================================

function goToStep1() {
    document.getElementById('setup-step-1').classList.remove('hidden');
    document.getElementById('setup-step-2').classList.add('hidden');
    document.getElementById('setup-step-3').classList.add('hidden');
}

function goToStep2() {
    const title = document.getElementById('elec-title').value.trim();
    if (!title) return showModal('error', 'Missing Title', 'Please provide an Election Title to continue.');
    
    document.getElementById('setup-step-1').classList.add('hidden');
    document.getElementById('setup-step-2').classList.remove('hidden');
    document.getElementById('setup-step-3').classList.add('hidden');
}

function updateBallotNextButton() {
    const cards=[...document.querySelectorAll('#position-container .card')];
    const invalid=cards.some(card=>{const field=card.querySelector('.pos-max');return !field || !field.value.trim() || !field.checkValidity() || !Number.isInteger(Number(field.value));});
    const button=document.getElementById('ballot-next-button');
    if(button){button.disabled=invalid;button.title=invalid?'Max Votes * is required for every position':'';}
    const error=document.getElementById('ballot-validation-error');
    if(error){error.classList.toggle('hidden',!invalid);error.textContent=invalid?'Max Votes * is required. Enter a whole number (1–100) for every position.':'';}
}
function validateAllMaxVotes() {
    updateBallotNextButton();
    const cards=[...document.querySelectorAll('#position-container .card')];
    if(!cards.length){showModal('error','Empty Ballot','Add at least one ballot position.');return false;}
    const names=new Set();
    for (const card of cards) {
        const title=card.querySelector('.pos-title');
        if(!title?.value.trim()) {title?.focus();showModal('error','Position Required','Every ballot position requires a title.');return false;}
        const key=title.value.trim().toLowerCase();
        if(names.has(key)){title.focus();showModal('error','Duplicate Position','Position titles must be unique.');return false;}
        names.add(key);
        const field=card.querySelector('.pos-max');
        const raw=field?.value.trim()||'', value=Number(raw);
        if(!raw || !Number.isInteger(value) || value<1 || value>100 || !field.checkValidity()) {
            field?.focus();field?.reportValidity();
            showModal('error','Max Votes Required','Set Max Votes to a whole number from 1 to 100 for every position.');return false;
        }
        const candidates=[...card.querySelectorAll('.cand-name')];
        const present=candidates.filter(x=>x.value.trim());
        if(!present.length){candidates[0]?.focus();showModal('error','Candidate Required','Add at least one candidate for '+title.value+'.');return false;}
        if(value>present.length){field.focus();showModal('error','Invalid Max Votes','Max Votes cannot exceed the number of named candidates.');return false;}
        const candNames=new Set();
        for(const input of present){const n=input.value.trim().toLowerCase();if(candNames.has(n)){input.focus();showModal('error','Duplicate Candidate','Duplicate candidate in '+title.value+'.');return false;}candNames.add(n);}
        if(candidates.some(x=>!x.value.trim())){const blank=candidates.find(x=>!x.value.trim());blank.focus();showModal('error','Incomplete Candidate','Fill in or remove blank candidate rows for '+title.value+'.');return false;}
    }
    return true;
}

function goToStep3() {
    const positions = document.querySelectorAll('.candidate-entry').length;
    if (!validateAllMaxVotes()) return;
    if (positions === 0) return showModal('error', 'Empty Ballot', 'Please add at least one position and candidate.');
    
    document.getElementById('setup-step-1').classList.add('hidden');
    document.getElementById('setup-step-2').classList.add('hidden');
    document.getElementById('setup-step-3').classList.remove('hidden');
}

// Ensure the old `initializeElection` function is replaced by this updated one:
async function initializeElection() {
    const title = document.getElementById('elec-title').value;
    const description = document.getElementById('elec-desc').value;
    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;
    const tokenExpiry = document.getElementById('token-expiry').value;
    
    const rawEmails = [];
    document.querySelectorAll('.custodian-email').forEach(inp => { if (inp.value.trim()) rawEmails.push(inp.value.trim()); });
    
    const emails = [...new Set(rawEmails)]; 
    if (emails.length !== rawEmails.length) return showModal('error', 'Duplicate Emails', "Each custodian must have a unique email address.");

    if (!validateAllMaxVotes()) return;
    const config = [];
    document.querySelectorAll('#position-container .card').forEach(card => {
        const posTitle = card.querySelector('.pos-title').value;
        const maxVotes = Number(card.querySelector('.pos-max').value);
        const cands = [];
        card.querySelectorAll('.candidate-entry').forEach(entry => {
            const name = entry.querySelector('.cand-name').value.trim();
            const photo = entry.querySelector('.cand-photo-base64').value || `https://ui-avatars.com/api/?name=${name}&background=1d7642&color=fff`;
            if (name) cands.push({ name: name, photo: photo });
        });
        if (posTitle && cands.length > 0) config.push({ title: posTitle, maxVotes: maxVotes, candidates: cands });
    });

    if (!title.trim() || !startTime || !endTime || !tokenExpiry || emails.length === 0 || !config.length) {
        return showModal('error', 'Incomplete Configuration', "Please fill out all dates and provide at least one custodian email.");
    }

    if (startTime >= endTime || tokenExpiry < endTime) return showModal('error','Invalid Schedule','End must follow Start, and token expiry must not be earlier than election end.');
    showModal('confirm', 'Deploy Election?', 'This will finalize the ballot, lock the previous election, and email the cryptographic keys to the board.', async () => {
        try {
            const resp = await fetch('/api/admin/initialize-election', { 
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description, config, startTime, endTime, tokenExpiry, emails })
            });
            const data = await resp.json();
            
            if (data.success) {
                showModal(data.emailFailures?.length?'error':'success', 'Election Saved',
                    `Election ${data.electionId} saved with ${data.candidatesSaved} candidates. ${data.message}`);
                
                // Reset Wizard
                document.getElementById('elec-title').value = '';
                document.getElementById('elec-desc').value = '';
                document.getElementById('position-container').innerHTML = ''; 
                goToStep1();
                
                fetchTurnout(); fetchHistory();
            } else {
                showModal('error', 'Deployment Failed', data.message); 
            }
        } catch (err) { 
            showModal('error', 'Server Error', "Failed to connect to the server."); 
        }
    });
}

// --- MOBILE RESPONSIVE SIDEBAR TOGGLE ---
function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.toggle('mobile-open');
    }
}


// ==========================================
// EDIT MEMBER INFORMATION & BIOMETRICS
// ==========================================

function openEditMemberModal(id, fullName, area, isActive) {
    document.getElementById('edit-member-id').value = id;
    document.getElementById('edit-fullname').value = fullName;
    
    // Copy area options dynamically from the registration dropdown
    const areaSelect = document.getElementById('edit-area');
    areaSelect.innerHTML = document.getElementById('reg-area').innerHTML; 
    areaSelect.value = area;
    
    document.getElementById('edit-status').value = isActive === 1 ? 'Active' : 'Disabled';
    
    // Reset camera section
    document.getElementById('edit-camera-slot').classList.add('hidden');
    const btn = document.getElementById('btn-edit-scan');
    btn.innerText = "Turn On Camera & Scan Face";
    btn.onclick = startEditFaceScan;
    
    document.getElementById('edit-member-modal').classList.remove('hidden');
}

function closeEditMemberModal() {
    document.getElementById('edit-member-modal').classList.add('hidden');
    // Safely move the webcam back to the body so it doesn't break other tabs
    const vidContainer = document.getElementById('video-container');
    vidContainer.classList.add('hidden');
    document.body.appendChild(vidContainer); 
}

async function saveMemberUpdate() {
    const memberId = document.getElementById('edit-member-id').value;
    const fullName = document.getElementById('edit-fullname').value;
    const area = document.getElementById('edit-area').value;
    const status = document.getElementById('edit-status').value;
    
    try {
        const res = await fetch('/api/admin/update-member', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId, fullName, area, status })
        });
        const data = await res.json();
        if(data.success) {
            showModal('success', 'Updated', 'Member information has been updated.');
            fetchMembers();
            closeEditMemberModal();
        } else {
            showModal('error', 'Error', data.message);
        }
    } catch (err) { showModal('error', 'Server Error', 'Failed to update member.'); }
}

async function startEditFaceScan() {
    const vidContainer = document.getElementById('video-container');
    document.getElementById('edit-camera-slot').appendChild(vidContainer);
    vidContainer.classList.remove('hidden');
    document.getElementById('edit-camera-slot').classList.remove('hidden');
    
    const btn = document.getElementById('btn-edit-scan');
    btn.innerText = "Capture New Face Now";
    btn.onclick = captureNewFace;
}

async function captureNewFace() {
    const memberId = document.getElementById('edit-member-id').value;
    const descriptor = await getFaceDescriptor();
    if (!descriptor) return showModal('error', 'Capture Failed', 'No face detected in camera.');
    
    // Capture photo snapshot
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const photoUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    try {
        const res = await fetch('/api/admin/update-member-face', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId, descriptor, photoUrl })
        });
        const data = await res.json();
        if(data.success) {
            showModal('success', 'Biometrics Updated', 'New face scan saved successfully.');
            closeEditMemberModal();
        } else {
            showModal('error', 'Database Error', data.message);
        }
    } catch (err) { showModal('error', 'Server Error', 'Failed to save biometrics.'); }
}



// Cascading Philippine Standard Geographic Code location picker.
function geoSelect(id) { return document.getElementById(id); }
function chooseGeo(id, placeholder, entries, disabled=false) {
    const el = geoSelect(id);
    el.replaceChildren(new Option(placeholder,''));
    entries.forEach(item=>el.add(new Option(item.name,item.code)));
    el.disabled = disabled;
}
async function loadGeo(level, code) {
    const response = await fetch(`/api/geo/${level}${code ? '/'+encodeURIComponent(code) : ''}`);
    if (!response.ok) throw new Error('Could not load Philippine locations.');
    const result = await response.json();
    if (!Array.isArray(result)) throw new Error('Invalid location response.');
    return result.sort((a,b)=>a.name.localeCompare(b.name));
}
function collectLocation() {
    const ids=['addr-region','addr-province','addr-city','addr-barangay'];
    const obj={country:'Philippines'};
    ['region','province','city','barangay'].forEach((key,i)=>{
        const el=geoSelect(ids[i]);
        obj[key]=el.selectedOptions[0]?.textContent || '';
        obj[key+'Code']=el.value;
    });
    obj.street=geoSelect('addr-street').value.trim();
    return obj;
}
function getMemberAddress() {
    const l=collectLocation();
    if (!l.regionCode || !l.provinceCode || !l.cityCode || !l.barangayCode) return '';
    return [l.street,l.barangay,l.city,l.province==='Not Applicable (NCR)'?'':l.province,l.region,l.country].filter(Boolean).join(', ');
}
async function resetAddressSelectors() {
    chooseGeo('addr-province','Select region first',[],true);
    chooseGeo('addr-city','Select province first',[],true);
    chooseGeo('addr-barangay','Select city first',[],true);
    chooseGeo('addr-region','Loading regions...',[],true);
    try {chooseGeo('addr-region','Select Region',await loadGeo('regions'));geoSelect('address-status').textContent='Select a region to continue.';}
    catch(e){chooseGeo('addr-region','Unable to load regions',[],true);geoSelect('address-status').textContent='Location service unavailable. Reload to retry.';}
}
document.addEventListener('DOMContentLoaded',()=>{
    resetAddressSelectors();
    geoSelect('addr-region').addEventListener('change',async function(){
        const code=this.value;
        chooseGeo('addr-province','Loading provinces...',[],true);
        chooseGeo('addr-city','Select province first',[],true);chooseGeo('addr-barangay','Select city first',[],true);
        if (!code) return;
        try {
            let provinces=await loadGeo('provinces',code);
            if (!provinces.length) provinces=[{code:'NCR-'+code,name:'Not Applicable (NCR)'}];
            chooseGeo('addr-province','Select Province',provinces);
        } catch(e) {chooseGeo('addr-province','Location service unavailable',[],true);}
    });
    geoSelect('addr-province').addEventListener('change',async function(){
        const code=this.value;
        chooseGeo('addr-city','Loading cities...',[],true);chooseGeo('addr-barangay','Select city first',[],true);
        if (!code) return;
        try { chooseGeo('addr-city','Select City / Municipality',await loadGeo(code.startsWith('NCR-')?'regioncities':'cities',code.startsWith('NCR-')?code.slice(4):code)); }
        catch(e) {chooseGeo('addr-city','Location service unavailable',[],true);}
    });
    geoSelect('addr-city').addEventListener('change',async function(){
        chooseGeo('addr-barangay','Loading barangays...',[],true);
        if (!this.value) return;
        try{chooseGeo('addr-barangay','Select Barangay',await loadGeo('barangays',this.value));}
        catch(e){chooseGeo('addr-barangay','Location service unavailable',[],true);}
    });
});
