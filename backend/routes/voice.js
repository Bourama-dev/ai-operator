const express  = require('express');
const multer   = require('multer');
const fs       = require('fs');
const path     = require('path');

const { transcribeAudio }                    = require('../services/whisper');
const { chat, streamChat }                   = require('../services/claude');
const { callLevcoBrain, isConfigured: brainConfigured } = require('../services/levco');
const { synthesizeSpeech }                   = require('../services/tts');
const memory                                 = require('../services/memory');
const push                                   = require('../services/push');

const router = express.Router();
const upload = multer({ dest: '/tmp/uploads/' });

// Actions qui ne nécessitent pas de confirmation (lecture seule)
const AUTO_CONFIRM_ACTIONS = new Set(['get_pipeline', 'get_next_meeting', 'prepare_meeting']);

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function normalizeResult(result) {
  return {
    response:    result.response   ?? '',
    isAction:    result.isAction   ?? false,
    actionData:  result.actionData ?? null,
    showCard:    result.showCard   ?? false,
    tasks:       result.tasks      ?? null,
    autoConfirm: result.autoConfirm ?? false,
  };
}

async function runBrain(transcript, sessionId) {
  const history = memory.getHistory(sessionId);

  if (brainConfigured()) {
    console.log(`[brain] → n8n Levco Brain (session: ${sessionId})`);
    const result = await callLevcoBrain(transcript, sessionId, history);
    const normalized = normalizeResult(result);
    memory.addExchange(sessionId, transcript, normalized.response);
    return normalized;
  }

  console.log(`[brain] → Claude direct (session: ${sessionId})`);
  const claudeResult = await chat(transcript, history);
  const response = claudeResult.isAction
    ? (claudeResult.parsed.confirmation_message || claudeResult.raw)
    : claudeResult.raw;
  memory.addExchange(sessionId, transcript, response);

  return normalizeResult({
    response,
    isAction:    claudeResult.isAction,
    actionData:  claudeResult.isAction ? claudeResult.parsed : null,
    autoConfirm: claudeResult.parsed?.autoConfirm ?? false,
  });
}

function buildConfirmationText(action) {
  const messages = {
    create_contact:  'Contact créé. Y a-t-il autre chose ?',
    update_deal:     'Deal mis à jour. Y a-t-il autre chose ?',
    send_email:      'Email envoyé. Y a-t-il autre chose ?',
    prepare_meeting: 'Voici le brief de ton rendez-vous.',
    get_pipeline:    'Voici ta pipeline.',
    get_next_meeting:'Voici ton prochain rendez-vous.',
  };
  return messages[action] ?? "C'est fait. Y a-t-il autre chose ?";
}

async function triggerN8nAction(actionData) {
  const { action, data } = actionData;

  if (brainConfigured()) {
    const res = await fetch(process.env.N8N_BRAIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_API_KEY && { Authorization: `Bearer ${process.env.N8N_API_KEY}` }),
      },
      body: JSON.stringify({ action, data, confirmed: true }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`n8n Brain action failed: ${res.status}`);
    return res.json();
  }

  // Fallback webhook dédié
  const webhookPath = action === 'prepare_meeting' ? 'levco-preparation-rdv' : action;
  const res = await fetch(`${process.env.N8N_WEBHOOK_URL}/${webhookPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.N8N_API_KEY && { Authorization: `Bearer ${process.env.N8N_API_KEY}` }),
    },
    body: JSON.stringify(data || {}),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`n8n webhook failed: ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────
// POST /voice/stream  — SSE : texte streamé, audio URL à la fin
// ─────────────────────────────────────────────────────────────────────
router.post('/stream', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

  const sessionId = req.headers['x-session-id'] || 'default';
  const audioPath = req.file.path;

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (type, data) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  try {
    // 1. Transcription (bloquant, ~1-2s)
    const transcript = await transcribeAudio(audioPath, req.file.mimetype);
    console.log(`[stream] "${transcript}" (session: ${sessionId})`);
    send('transcript', { text: transcript });

    // 2. Historique de session
    const history = memory.getHistory(sessionId);

    // 3. Stream Claude token par token
    let isJsonMode = false;
    let accumulated = '';
    const { raw, isAction, parsed } = await streamChat(transcript, history, (token) => {
      accumulated += token;
      if (!isJsonMode) {
        isJsonMode = accumulated.trimStart().startsWith('{');
      }
      if (!isJsonMode) send('token', { text: token });
    });

    // 4. Enregistre l'échange en mémoire
    const displayText = isAction
      ? (parsed?.confirmation_message || buildConfirmationText(parsed?.action))
      : raw;
    memory.addExchange(sessionId, transcript, displayText);

    // 5. Notifie action ou texte final
    if (isAction && parsed) {
      const autoConfirm = parsed.autoConfirm === true || AUTO_CONFIRM_ACTIONS.has(parsed.action);
      send('action', { data: parsed, autoConfirm });
    }

    // 6. TTS du texte à lire
    const ttsText = isAction
      ? (parsed?.confirmation_message || buildConfirmationText(parsed?.action))
      : raw;
    const audioFilePath = await synthesizeSpeech(ttsText);
    send('audio', { url: `/audio/${path.basename(audioFilePath)}` });

    send('done', {});
  } catch (err) {
    console.error('[/stream]', err);
    send('error', { message: err.message });
  } finally {
    fs.unlink(audioPath, () => {});
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /voice/transcribe  — ancien endpoint (conservé comme fallback)
// ─────────────────────────────────────────────────────────────────────
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

  const sessionId = req.headers['x-session-id'] || 'default';
  const audioPath = req.file.path;

  try {
    const transcript = await transcribeAudio(audioPath, req.file.mimetype);
    console.log(`[transcribe] "${transcript}" (session: ${sessionId})`);

    const brain = await runBrain(transcript, sessionId);
    const audioFilePath = await synthesizeSpeech(brain.response);

    res.json({
      transcript,
      response:    brain.response,
      audioUrl:    `/audio/${path.basename(audioFilePath)}`,
      isAction:    brain.isAction,
      actionData:  brain.actionData,
      autoConfirm: brain.autoConfirm,
      showCard:    brain.showCard,
      tasks:       brain.tasks,
    });
  } catch (err) {
    console.error('[/transcribe]', err);
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(audioPath, () => {});
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /voice/chat  — test texte sans audio
// ─────────────────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    const brain = await runBrain(message, sessionId);
    const audioFilePath = await synthesizeSpeech(brain.response);

    res.json({
      transcript:  message,
      response:    brain.response,
      audioUrl:    `/audio/${path.basename(audioFilePath)}`,
      isAction:    brain.isAction,
      actionData:  brain.actionData,
      autoConfirm: brain.autoConfirm,
      showCard:    brain.showCard,
      tasks:       brain.tasks,
    });
  } catch (err) {
    console.error('[/chat]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /voice/confirm  — exécute l'action CRM confirmée
// ─────────────────────────────────────────────────────────────────────
router.post('/confirm', async (req, res) => {
  const { actionData, sessionId = 'default' } = req.body;
  if (!actionData) return res.status(400).json({ error: 'actionData is required' });

  try {
    const n8nResult = await triggerN8nAction(actionData);

    // Utilise la réponse de n8n si elle fournit du texte (ex: pipeline, brief)
    const responseText = n8nResult?.response ?? n8nResult?.brief ?? buildConfirmationText(actionData.action);
    const audioFilePath = await synthesizeSpeech(responseText);

    memory.addExchange(sessionId, `[action:${actionData.action}]`, responseText);

    res.json({
      success:  true,
      response: responseText,
      audioUrl: `/audio/${path.basename(audioFilePath)}`,
      n8nResult,
    });
  } catch (err) {
    console.error('[/confirm]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET  /voice/push/vapid-key  — clé publique VAPID pour le client
// POST /voice/push/subscribe  — enregistre une subscription push
// POST /voice/push/notify     — test d'envoi (debug)
// ─────────────────────────────────────────────────────────────────────
router.get('/push/vapid-key', (req, res) => {
  const key = push.getPublicKey();
  if (!key) return res.status(503).json({ error: 'Push notifications not configured' });
  res.json({ publicKey: key });
});

router.post('/push/subscribe', express.json(), (req, res) => {
  const { subscription, sessionId = 'global' } = req.body;
  if (!subscription) return res.status(400).json({ error: 'subscription required' });
  push.saveSubscription(sessionId, subscription);
  res.json({ ok: true });
});

// Endpoint appelable depuis n8n pour envoyer une alerte proactive
router.post('/push/notify', express.json(), async (req, res) => {
  const { title, body, sessionId, url = '/' } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    if (sessionId) {
      await push.sendNotification(sessionId, { title, body, url });
    } else {
      await push.broadcast({ title, body, url });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
