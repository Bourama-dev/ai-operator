// ── Config ─────────────────────────────────────────────────────────
const SESSION_ID = `session-${Date.now()}`;

// VAD tunables
const SILENCE_MS           = 1200;  // silence avant envoi
const SPEECH_THRESHOLD     = 18;    // plancher minimum (environnement silencieux)
const MIN_SPEECH_MS        = 600;   // durée minimale pour valider la parole
const NOISE_FLOOR_SAMPLES  = 30;    // échantillons de calibration (~1.5s)
const NOISE_FLOOR_RATIO    = 2.8;   // seuil = bruit * ratio (plus élevé = moins sensible)

let dynamicThreshold = SPEECH_THRESHOLD; // recalibré à chaque session

// ── DOM refs ────────────────────────────────────────────────────────
const orb            = document.getElementById('orb');
const orbWrap        = document.getElementById('orb-wrap');
const statusLabel    = document.getElementById('status-label');
const chatHistoryEl  = document.getElementById('chat-history');
const contextCard    = document.getElementById('context-card');
const taskList       = document.getElementById('task-list');
const tapBtn         = document.getElementById('tap-btn');
const endBtn         = document.getElementById('end-btn');
const greeting       = document.getElementById('greeting');
const waveWrap       = document.getElementById('wave-wrap');
const canvas         = document.getElementById('wave-canvas');
const ctx            = canvas.getContext('2d');
const toast          = document.getElementById('toast');
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmMsg     = document.getElementById('confirm-msg');
const confirmBtnEl   = document.getElementById('confirm-btn');

// ── State ────────────────────────────────────────────────────────────
let appState       = 'idle';
let sessionStarted = false;
let sessionSeconds = 0;
let sessionInterval= null;
let waveAnimId     = null;
let wavePhase      = 0;
let pendingAction  = null;

// VAD / recording
let micStream     = null;
let audioCtx      = null;
let analyser      = null;
let mediaRecorder = null;
let audioChunks   = [];
let vadRunning    = false;
let speechStartAt = null;

// ── Session timer ─────────────────────────────────────────────────────
function startTimer() {
  sessionInterval = setInterval(() => {
    sessionSeconds++;
    const m = String(Math.floor(sessionSeconds / 60)).padStart(2, '0');
    const s = String(sessionSeconds % 60).padStart(2, '0');
    document.getElementById('session-time').textContent = `Session · ${m}:${s}`;
  }, 1000);
}

// ── State machine ─────────────────────────────────────────────────────
function setState(s) {
  appState = s;
  orb.className = 'orb';

  const map = {
    idle:       ['APPUYER POUR COMMENCER', false],
    standby:    ['EN ATTENTE…',            true ],
    listening:  ['EN ÉCOUTE…',             true ],
    processing: ['ANALYSE…',               true ],
    speaking:   ['LEVCO PARLE',            true ],
  };
  const [label, active] = map[s] ?? ['', false];
  statusLabel.textContent = label;
  statusLabel.className = 'status-label' + (active ? ' active' : '');

  if      (s === 'standby')  { orb.classList.add('standby');   stopWave(); }
  else if (s === 'listening'){ orb.classList.add('listening');  startWave(0.45); }
  else if (s === 'speaking') { orb.classList.add('speaking');   startWave(1.0);  }
  else stopWave();
}

// ── Activate session ─────────────────────────────────────────────────
function activateSession() {
  if (sessionStarted) return;
  sessionStarted = true;
  stopWakeWord();
  greeting.classList.add('hidden');
  tapBtn.classList.add('hidden');
  endBtn.classList.remove('hidden');
  chatHistoryEl.classList.add('visible');
  startTimer();
  setupPushNotifications();
}

// ── Chat history ──────────────────────────────────────────────────────
function addUserMessage(text) {
  const el = document.createElement('div');
  el.className = 'chat-msg user';
  el.textContent = `"${text}"`;
  chatHistoryEl.appendChild(el);
  scrollChat();
  return el;
}

function addAiMessageBubble(text = '') {
  const el = document.createElement('div');
  el.className = 'chat-msg ai';
  el.textContent = text;
  chatHistoryEl.appendChild(el);
  scrollChat();
  return el;
}

function scrollChat() {
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

function clearChat() {
  chatHistoryEl.innerHTML = '';
  chatHistoryEl.classList.remove('visible');
}

// ── VAD — start ───────────────────────────────────────────────────────
async function startVAD() {
  if (vadRunning || appState === 'processing' || appState === 'speaking') return;

  activateSession();

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl:  true,
      },
      video: false,
    });
  } catch {
    showToast('Accès au microphone refusé');
    return;
  }

  audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
  analyser  = audioCtx.createAnalyser();
  analyser.fftSize = 1024;              // meilleure résolution fréquentielle
  analyser.smoothingTimeConstant = 0.6; // plus lisse = moins réactif aux transitoires
  audioCtx.createMediaStreamSource(micStream).connect(analyser);

  vadRunning = true;
  setState('standby');
  contextCard.classList.remove('visible');

  // Calibration du bruit ambiant avant de démarrer le VAD
  statusLabel.textContent = 'CALIBRATION…';
  await calibrateNoiseFloor();
  runVAD();
}

// ── VAD — calibration bruit ambiant ──────────────────────────────────
function calibrateNoiseFloor() {
  return new Promise(resolve => {
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const samples  = [];

    function sample() {
      analyser.getByteFrequencyData(freqData);
      const speechBins = freqData.slice(3, 36);
      const avg = speechBins.reduce((a, b) => a + b, 0) / speechBins.length;
      samples.push(avg);

      if (samples.length < NOISE_FLOOR_SAMPLES) {
        setTimeout(sample, 50);
      } else {
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        dynamicThreshold = Math.max(SPEECH_THRESHOLD, mean * NOISE_FLOOR_RATIO);
        console.log(`[VAD] bruit ambiant: ${mean.toFixed(1)} → seuil: ${dynamicThreshold.toFixed(1)}`);
        resolve();
      }
    }
    sample();
  });
}

// ── VAD — main loop ───────────────────────────────────────────────────
function runVAD() {
  if (!vadRunning || !analyser) return;

  if (appState === 'processing' || appState === 'speaking') {
    setTimeout(runVAD, 200);
    return;
  }

  const freqData   = new Uint8Array(analyser.frequencyBinCount);
  let   isSpeaking = false;
  let   silenceAt  = null;

  function tick() {
    if (!vadRunning || !analyser) return;
    if (appState === 'processing' || appState === 'speaking') {
      isSpeaking = false;
      silenceAt  = null;
      setTimeout(tick, 300);
      return;
    }

    analyser.getByteFrequencyData(freqData);
    const speechBins = freqData.slice(3, 36); // ~300 Hz–3 kHz
    const avg = speechBins.reduce((a, b) => a + b, 0) / speechBins.length;
    const hasSpeech = avg > dynamicThreshold;

    if (hasSpeech) {
      silenceAt = null;
      if (!isSpeaking && appState === 'standby') {
        isSpeaking    = true;
        speechStartAt = Date.now();
        beginRecording();
      }
    } else if (isSpeaking) {
      if (!silenceAt) silenceAt = Date.now();
      const silenceDuration = Date.now() - silenceAt;
      const speechDuration  = Date.now() - speechStartAt;

      if (silenceDuration >= SILENCE_MS) {
        isSpeaking = false;
        silenceAt  = null;
        if (speechDuration >= MIN_SPEECH_MS) {
          endRecording();
          return;
        }
        cancelRecording();
      }
    }

    requestAnimationFrame(tick);
  }

  tick();
}

// ── VAD — stop (fin de session) ───────────────────────────────────────
function stopVAD() {
  vadRunning = false;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  micStream?.getTracks().forEach(t => t.stop());
  audioCtx?.close();
  micStream = null;
  audioCtx  = null;
  analyser  = null;
  mediaRecorder = null;
  audioChunks   = [];
}

// ── Recording helpers ─────────────────────────────────────────────────
function getBestMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function beginRecording() {
  if (!micStream) return;
  const mimeType = getBestMimeType();
  mediaRecorder  = new MediaRecorder(micStream, mimeType ? { mimeType } : undefined);
  audioChunks    = [];
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.start(100);
  setState('listening');
}

function endRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  setState('processing');
  mediaRecorder.onstop = () => processAudio();
  mediaRecorder.stop();
}

function cancelRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  mediaRecorder.stop();
  mediaRecorder = null;
  audioChunks   = [];
  setState('standby');
  runVAD();
}

// ── Process audio → SSE streaming ─────────────────────────────────────
async function processAudio() {
  const mimeType = mediaRecorder?.mimeType || 'audio/webm';
  const ext  = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const blob = new Blob(audioChunks, { type: mimeType });

  const formData = new FormData();
  formData.append('audio', blob, `voice.${ext}`);

  let aiEl       = null;
  let aiText     = '';
  let audioUrl   = null;
  let gotAction  = false;
  let actionData = null;

  try {
    const res = await fetch('/voice/stream', {
      method:  'POST',
      headers: { 'x-session-id': SESSION_ID },
      body:    formData,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // garde la ligne incomplète

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let evt;
        try { evt = JSON.parse(line.slice(6)); } catch { continue; }

        switch (evt.type) {
          case 'transcript':
            addUserMessage(evt.text);
            aiEl   = addAiMessageBubble();
            aiText = '';
            break;

          case 'token':
            if (aiEl) {
              aiText += evt.text;
              aiEl.textContent = aiText;
              scrollChat();
            }
            break;

          case 'action':
            gotAction  = true;
            actionData = evt.data;
            if (aiEl && evt.data?.confirmation_message) {
              aiEl.textContent = evt.data.confirmation_message;
            }
            if (evt.autoConfirm) {
              // Lecture seule : auto-confirm sans overlay
              autoConfirmAction(evt.data);
            } else {
              showConfirm(evt.data);
            }
            break;

          case 'audio':
            audioUrl = evt.url;
            break;

          case 'error':
            showToast('Erreur : ' + evt.message);
            break;
        }
      }
    }

    if (audioUrl) {
      setState('speaking');
      await playAudio(audioUrl);
    }
  } catch (err) {
    console.error('[processAudio]', err);
    showToast('Erreur : ' + err.message);
  }

  // Redémarre le VAD sauf si on attend une confirmation manuelle
  const waitingForConfirm = gotAction && actionData && !actionData?.autoConfirm;
  if (!waitingForConfirm) {
    if (vadRunning) { setState('standby'); runVAD(); }
    else setState('idle');
  }
}

// ── Auto-confirm (actions lecture seule) ─────────────────────────────
async function autoConfirmAction(actionData) {
  try {
    const res  = await fetch('/voice/confirm', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ actionData, sessionId: SESSION_ID }),
    });
    const data = await res.json();
    const el = addAiMessageBubble(data.response);
    scrollChat();
    setState('speaking');
    await playAudio(data.audioUrl);
  } catch {
    showToast('Erreur lors de la récupération des données');
  }
  if (vadRunning) { setState('standby'); runVAD(); } else setState('idle');
}

// ── TTS playback ──────────────────────────────────────────────────────
function playAudio(url) {
  return new Promise(resolve => {
    const audio = new Audio(url);
    audio.onended = resolve;
    audio.onerror = () => { console.warn('TTS error'); resolve(); };
    audio.play().catch(resolve);
  });
}

// ── Context card ──────────────────────────────────────────────────────
const DEFAULT_TASKS = [
  { icon:'✏️', name:'Signer la facture fournisseur', sub:'Fournitures Delta · 1 240 €',      tag:'Demain',       tagStyle:'red'    },
  { icon:'📞', name:'Rappeler Marc',                 sub:'Attend ta réponse depuis 2 jours',  tag:'Avant midi',   tagStyle:'orange' },
  { icon:'📄', name:'Valider le devis de Francine',  sub:'En attente de ton accord',          tag:"Aujourd'hui",  tagStyle:'yellow' },
  { icon:'🔥', name:"Relancer l'Atelier Verso",      sub:'Prospect chaud, momentum à garder', tag:'Cette semaine',tagStyle:'green'  },
];

function renderContextCard(tasks) {
  const list = tasks || DEFAULT_TASKS;
  taskList.innerHTML = list.map(t => `
    <div class="task-row">
      <div class="task-info">
        <span class="task-icon">${escHtml(t.icon)}</span>
        <div>
          <div class="task-name">${escHtml(t.name)}</div>
          <div class="task-sub">${escHtml(t.sub)}</div>
        </div>
      </div>
      <span class="tag ${escHtml(t.tagStyle)}">${escHtml(t.tag)}</span>
    </div>
  `).join('');
  contextCard.classList.add('visible');
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Confirm overlay ────────────────────────────────────────────────────
function showConfirm(action) {
  pendingAction = action;
  confirmMsg.textContent = action.confirmation_message || 'Confirmes-tu cette action ?';
  confirmOverlay.classList.add('visible');
}

async function confirmAction() {
  if (!pendingAction) return;
  confirmBtnEl.disabled  = true;
  confirmBtnEl.textContent = '…';
  try {
    const res  = await fetch('/voice/confirm', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ actionData: pendingAction, sessionId: SESSION_ID }),
    });
    const data = await res.json();
    confirmOverlay.classList.remove('visible');
    pendingAction = null;
    addAiMessageBubble(data.response);
    scrollChat();
    setState('speaking');
    await playAudio(data.audioUrl);
  } catch {
    showToast('Erreur lors de la confirmation');
  } finally {
    confirmBtnEl.disabled  = false;
    confirmBtnEl.textContent = 'Confirmer';
  }
  if (vadRunning) { setState('standby'); runVAD(); } else setState('idle');
}

function cancelAction() {
  pendingAction = null;
  confirmOverlay.classList.remove('visible');
  if (vadRunning) { setState('standby'); runVAD(); } else setState('idle');
}

// ── End session ────────────────────────────────────────────────────────
function endSession() {
  stopVAD();
  clearInterval(sessionInterval);
  stopWave();
  setState('idle');
  clearChat();
  contextCard.classList.remove('visible');
  sessionStarted  = false;
  sessionSeconds  = 0;
  document.getElementById('session-time').textContent = 'Session · 00:00';
  greeting.classList.remove('hidden');
  tapBtn.classList.remove('hidden');
  endBtn.classList.add('hidden');
  startWakeWord();
}

// ── Toast ─────────────────────────────────────────────────────────────
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3500);
}

// ── Wave visualizer ────────────────────────────────────────────────────
function startWave(intensity) {
  waveWrap.classList.add('visible');
  if (waveAnimId) cancelAnimationFrame(waveAnimId);
  function draw() {
    canvas.width  = canvas.offsetWidth  * devicePixelRatio;
    canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const W = canvas.width, H = canvas.height;
    wavePhase += 0.04;
    const baseY = H * 0.55, amp = H * 0.28 * intensity;
    [
      [0,   'rgba(124,92,252,0.35)'],
      [0.8, 'rgba(180,140,255,0.2)'],
      [1.6, 'rgba(90,55,200,0.15)'],
    ].forEach(([offset, color]) => {
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= W; x += 2) {
        const y = baseY
          + Math.sin((x / W) * Math.PI * 4 + wavePhase + offset) * amp * 0.6
          + Math.sin((x / W) * Math.PI * 7 + wavePhase * 1.3 + offset) * amp * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    });
    waveAnimId = requestAnimationFrame(draw);
  }
  draw();
}

function stopWave() {
  if (waveAnimId) cancelAnimationFrame(waveAnimId);
  waveAnimId = null;
  waveWrap.classList.remove('visible');
}

// ── Wake word — "Levco" (Web Speech API) ──────────────────────────────
let wakeRecognition = null;

function startWakeWord() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return;

  wakeRecognition = new SpeechRec();
  wakeRecognition.lang = 'fr-FR';
  wakeRecognition.continuous = true;
  wakeRecognition.interimResults = true;

  wakeRecognition.onresult = e => {
    const text = Array.from(e.results)
      .map(r => r[0].transcript)
      .join(' ')
      .toLowerCase();
    if ((text.includes('levco') || text.includes('lev co')) && appState === 'idle') {
      wakeRecognition.stop();
      startVAD();
    }
  };

  wakeRecognition.onerror = () => {};

  // Redémarre automatiquement tant qu'en veille
  wakeRecognition.onend = () => {
    if (appState === 'idle' && !sessionStarted) {
      setTimeout(() => { try { wakeRecognition.start(); } catch {} }, 1000);
    }
  };

  try { wakeRecognition.start(); } catch {}
}

function stopWakeWord() {
  if (wakeRecognition) {
    try { wakeRecognition.stop(); } catch {}
    wakeRecognition = null;
  }
}

// ── Push notifications ────────────────────────────────────────────────
function urlBase64ToUint8Array(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function setupPushNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission === 'denied') return;

  try {
    const keyRes = await fetch('/voice/push/vapid-key');
    if (!keyRes.ok) return; // push non configuré
    const { publicKey } = await keyRes.json();

    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await fetch('/voice/push/subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ subscription: sub.toJSON(), sessionId: SESSION_ID }),
    });
    console.log('[push] subscribed');
  } catch (err) {
    console.warn('[push] setup failed:', err.message);
  }
}

// ── Keyboard shortcut — Space ─────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.target !== document.body) return;
  e.preventDefault();
  if (!sessionStarted) startVAD();
});

// ── Click / tap — activate ─────────────────────────────────────────────
function handleActivate() { if (!sessionStarted) startVAD(); }

orbWrap.addEventListener('click',      handleActivate);
tapBtn.addEventListener('click',       handleActivate);
orbWrap.addEventListener('touchstart', e => { e.preventDefault(); handleActivate(); }, { passive: false });
tapBtn.addEventListener('touchstart',  e => { e.preventDefault(); handleActivate(); }, { passive: false });
orbWrap.addEventListener('contextmenu', e => e.preventDefault());
tapBtn.addEventListener('contextmenu',  e => e.preventDefault());

// ── PWA service worker ────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// ── Init ───────────────────────────────────────────────────────────────
setState('idle');
startWakeWord();
