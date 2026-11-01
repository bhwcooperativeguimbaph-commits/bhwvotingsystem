'use strict';
// Reused verbatim from public/js/app.js existing facial challenge detection.
// Browser-reported gestures are not certified liveness or anti-spoofing.
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


async function runBHWFaceChallenge(video){
 const startResp=await fetch('/api/face-challenge',{method:'POST',
  headers:{'Content-Type':'application/json'},body:'{}',credentials:'same-origin'});
 const challenge=await startResp.json();
 if(!startResp.ok||!challenge.success)throw new Error(challenge.message||'Cannot start facial challenge');
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
        
 return {challengeId:challenge.challengeId,completedActions};
}
window.runBHWFaceChallenge=runBHWFaceChallenge;
