// ── Config ─────────────────────────────────────────────────────────
const SESSION_ID = `session-${Date.now()}`;

// ── DOM refs ────────────────────────────────────────────────────────
const orb         = document.getElementById('orb');
const orbWrap     = document.getElementById('orb-wrap');
const statusLabel = document.getElementById('status-label');
const userText    = document.getElementById('user-text');
const aiText      = document.getElementById('ai-text');
const contextCard = document.getElementById('context-card');
const taskList    = document.getElementById('task-list');
const tapBtn      = document.getElementById('tap-btn');
const endBtn      = document.getElementById('end-btn');
const greeting    = document.getElementById('greeting');
const waveWrap    = document.getElementById('wave-wrap');
const canvas      = document.getElementById('wave-canvas');
const ctx         = canvas.getContext('2d');
const toast       = document.getElementById('toast');
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmMsg     = document.getElementById('confirm-msg');
const confirmBtnEl   = document.getElementById('confirm-btn');

// ── State ────────────────────────────────────────────────────────────
let appState        = 'idle';   // idle | listening | processing | speaking
let sessionStarted  = false;
let sessionSeconds  = 0;
let sessionInterval = null;
let waveAnimId      = null;
let wavePhase       = 0;
let mediaRecorder   = null;
let audioChunks     = [];
let micStream       = null;
let pendingAction   = null;     // actionData awaiting confirmation
let isHolding       = false;    // debounce double-fire on mobile

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
function setState(newState) {
  appState = newState;
  orb.className = 'orb';

  const labels = {
    idle:       ['EN ÉCOUTE…',  false],
    listening:  ['EN ÉCOUTE…',  true],
    processing: ['ANALYSE…',    true],
    speaking:   ['LEVCO PARLE', true],
  };

  const [label, active] = labels[newState] ?? ['', false];
  statusLabel.textContent = label;
  statusLabel.className = 'status-label' + (active ? ' active' : '');

  if (newState === 'listening') {
    orb.classList.add('listening');
    startWave(0.45);
  } else if (newState === 'speaking') {
    orb.classList.add('speaking');
    startWave(1.0);
  } else {
    stopWave();
  }
}

// ── Activate session (first interaction) ──────────────────────────────
function activateSession() {
  if (sessionStarted) return;
  sessionStarted = true;
  greeting.classList.add('hidden');
  tapBtn.classList.add('hidden');
  endBtn.classList.remove('hidden');
  startTimer();
}

// ── Audio recording ───────────────────────────────────────────────────
function getBestMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

async function startRecording() {
  if (isHolding) return;
  if (appState === 'processing' || appState === 'speaking') return;
  isHolding = true;

  activateSession();

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    showToast('Accès au microphone refusé');
    isHolding = false;
    return;
  }

  const mimeType = getBestMimeType();
  mediaRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : undefined);
  audioChunks = [];
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.start(100); // collect chunks every 100ms

  setState('listening');
  clearTranscript();
  contextCard.classList.remove('visible');
  tapBtn.classList.add('holding');
}

async function stopRecording() {
  if (!isHolding) return;
  isHolding = false;
  tapBtn.classList.remove('holding');

  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  mediaRecorder.onstop = () => processAudio();
  mediaRecorder.stop();
  micStream?.getTracks().forEach(t => t.stop());
}

async function processAudio() {
  setState('processing');

  const mimeType = mediaRecorder.mimeType || 'audio/webm';
  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const blob = new Blob(audioChunks, { type: mimeType });

  const formData = new FormData();
  formData.append('audio', blob, `voice.${ext}`);

  try {
    const res = await fetch('/voice/transcribe', {
      method: 'POST',
      headers: { 'x-session-id': SESSION_ID },
      body: formData,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    showUserText(data.transcript);
    showAiText(data.response);

    if (data.showCard || data.tasks) renderContextCard(data.tasks);
    if (data.isAction && data.actionData) showConfirm(data.actionData);

    setState('speaking');
    await playAudio(data.audioUrl);
    setState('idle');

  } catch (err) {
    console.error('[processAudio]', err);
    showToast('Erreur : ' + err.message);
    setState('idle');
  }
}

// ── TTS playback ──────────────────────────────────────────────────────
function playAudio(url) {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.onended = resolve;
    audio.onerror = () => { console.warn('TTS playback error'); resolve(); };
    audio.play().catch(resolve);
  });
}

// ── Transcript display ─────────────────────────────────────────────────
function showUserText(text) {
  userText.textContent = `"${text}"`;
  userText.classList.add('visible');
  aiText.classList.remove('visible');
  aiText.textContent = '';
}

function showAiText(text) {
  aiText.textContent = text;
  aiText.classList.add('visible');
}

function clearTranscript() {
  userText.classList.remove('visible');
  aiText.classList.remove('visible');
  userText.textContent = '';
  aiText.textContent = '';
}

// ── Context card ──────────────────────────────────────────────────────
const DEFAULT_TASKS = [
  { icon:'✏️', name:'Signer la facture fournisseur', sub:'Fournitures Delta · 1 240 €',           tag:'Demain',       tagStyle:'red'    },
  { icon:'📞', name:'Rappeler Marc',                 sub:'Attend ta réponse depuis 2 jours',       tag:'Avant midi',   tagStyle:'orange' },
  { icon:'📄', name:'Valider le devis de Francine',  sub:'En attente de ton accord',               tag:"Aujourd'hui",  tagStyle:'yellow' },
  { icon:'🔥', name:"Relancer l'Atelier Verso",      sub:'Prospect chaud, momentum à garder',      tag:'Cette semaine',tagStyle:'green'  },
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
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Confirm overlay ────────────────────────────────────────────────────
function showConfirm(actionData) {
  pendingAction = actionData;
  confirmMsg.textContent = actionData.confirmation_message || 'Confirmes-tu cette action ?';
  confirmOverlay.classList.add('visible');
}

async function confirmAction() {
  if (!pendingAction) return;
  confirmBtnEl.disabled = true;
  confirmBtnEl.textContent = '…';

  try {
    const res = await fetch('/voice/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionData: pendingAction, sessionId: SESSION_ID }),
    });
    const data = await res.json();
    confirmOverlay.classList.remove('visible');
    pendingAction = null;

    showAiText(data.response);
    setState('speaking');
    await playAudio(data.audioUrl);
    setState('idle');
  } catch (err) {
    showToast('Erreur lors de la confirmation');
  } finally {
    confirmBtnEl.disabled = false;
    confirmBtnEl.textContent = 'Confirmer';
  }
}

function cancelAction() {
  pendingAction = null;
  confirmOverlay.classList.remove('visible');
}

// ── End session ────────────────────────────────────────────────────────
function endSession() {
  clearInterval(sessionInterval);
  stopWave();
  setState('idle');
  clearTranscript();
  contextCard.classList.remove('visible');
  sessionStarted = false;
  sessionSeconds = 0;
  document.getElementById('session-time').textContent = 'Session · 00:00';
  greeting.classList.remove('hidden');
  tapBtn.classList.remove('hidden');
  tapBtn.classList.remove('holding');
  endBtn.classList.add('hidden');
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
    const baseY = H * 0.55;
    const amp   = H * 0.28 * intensity;

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
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
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

// ── Press-to-talk bindings ─────────────────────────────────────────────
// Desktop: mousedown / mouseup
orbWrap.addEventListener('mousedown', startRecording);
tapBtn.addEventListener('mousedown',  startRecording);
document.addEventListener('mouseup',  stopRecording);

// Mobile: touchstart / touchend (prevent ghost click)
orbWrap.addEventListener('touchstart', e => { e.preventDefault(); startRecording(); }, { passive: false });
tapBtn.addEventListener('touchstart',  e => { e.preventDefault(); startRecording(); }, { passive: false });
document.addEventListener('touchend',  stopRecording);

// Prevent context menu on long-press
orbWrap.addEventListener('contextmenu', e => e.preventDefault());
tapBtn.addEventListener('contextmenu',  e => e.preventDefault());

// ── Init ───────────────────────────────────────────────────────────────
setState('idle');
