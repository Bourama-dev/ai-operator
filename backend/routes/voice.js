const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { transcribeAudio } = require('../services/whisper');
const { chat } = require('../services/claude');
const { callLevcoBrain, isConfigured: brainConfigured } = require('../services/levco');
const { synthesizeSpeech } = require('../services/tts');

const router = express.Router();
const upload = multer({ dest: '/tmp/uploads/' });

// Fallback session store for direct-Claude mode
const sessions = new Map();

// ─────────────────────────────────────────────────────────────
// Shared helper: take a raw AI result (n8n or Claude) and
// return a normalized shape for the mobile client.
// ─────────────────────────────────────────────────────────────
function normalizeResult(result) {
  return {
    response:    result.response  ?? '',
    isAction:    result.isAction  ?? false,
    actionData:  result.actionData ?? null,
    showCard:    result.showCard  ?? false,
    tasks:       result.tasks     ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
// Route brain: n8n Levco Brain si configuré, sinon Claude direct
// ─────────────────────────────────────────────────────────────
async function runBrain(transcript, sessionId) {
  if (brainConfigured()) {
    console.log(`[brain] → n8n Levco Brain (session: ${sessionId})`);
    const result = await callLevcoBrain(transcript, sessionId);
    return normalizeResult(result);
  }

  // Fallback: Claude direct
  console.log(`[brain] → Claude direct (session: ${sessionId})`);
  const history = sessions.get(sessionId) || [];
  const claudeResult = await chat(transcript, history);
  sessions.set(sessionId, claudeResult.updatedHistory.slice(-20));

  return normalizeResult({
    response:   claudeResult.isAction ? claudeResult.parsed.confirmation_message : claudeResult.raw,
    isAction:   claudeResult.isAction,
    actionData: claudeResult.isAction ? claudeResult.parsed : null,
  });
}

// ─────────────────────────────────────────────────────────────
// POST /voice/transcribe
// Accepts : multipart/form-data, field "audio" (m4a/wav/webm)
// Returns : { transcript, response, audioUrl, isAction, actionData, showCard, tasks }
// ─────────────────────────────────────────────────────────────
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

  const sessionId = req.headers['x-session-id'] || 'default';
  const audioPath = req.file.path;

  try {
    const transcript = await transcribeAudio(audioPath);
    console.log(`[transcribe] "${transcript}" (session: ${sessionId})`);

    const brain = await runBrain(transcript, sessionId);

    const audioFilePath = await synthesizeSpeech(brain.response);

    res.json({
      transcript,
      response:   brain.response,
      audioUrl:   `/audio/${path.basename(audioFilePath)}`,
      isAction:   brain.isAction,
      actionData: brain.actionData,
      showCard:   brain.showCard,
      tasks:      brain.tasks,
    });
  } catch (err) {
    console.error('[/transcribe]', err);
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(audioPath, () => {});
  }
});

// ─────────────────────────────────────────────────────────────
// POST /voice/chat  (tests texte, sans audio)
// Accepts : { message: string, sessionId?: string }
// ─────────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    const brain = await runBrain(message, sessionId);
    const audioFilePath = await synthesizeSpeech(brain.response);

    res.json({
      transcript: message,
      response:   brain.response,
      audioUrl:   `/audio/${path.basename(audioFilePath)}`,
      isAction:   brain.isAction,
      actionData: brain.actionData,
      showCard:   brain.showCard,
      tasks:      brain.tasks,
    });
  } catch (err) {
    console.error('[/chat]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /voice/confirm
// Déclenche l'action CRM validée par l'utilisateur
// Accepts : { actionData: object, sessionId?: string }
// ─────────────────────────────────────────────────────────────
router.post('/confirm', async (req, res) => {
  const { actionData, sessionId = 'default' } = req.body;
  if (!actionData) return res.status(400).json({ error: 'actionData is required' });

  try {
    const n8nResult = await triggerN8nAction(actionData);

    const confirmationText = buildConfirmationText(actionData.action);
    const audioFilePath = await synthesizeSpeech(confirmationText);

    res.json({
      success:  true,
      response: confirmationText,
      audioUrl: `/audio/${path.basename(audioFilePath)}`,
      n8nResult,
    });
  } catch (err) {
    console.error('[/confirm]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function buildConfirmationText(action) {
  const messages = {
    create_contact: 'Contact créé. Y a-t-il autre chose ?',
    update_deal:    'Deal mis à jour. Y a-t-il autre chose ?',
    send_email:     'Email envoyé. Y a-t-il autre chose ?',
  };
  return messages[action] ?? "C'est fait. Y a-t-il autre chose ?";
}

async function triggerN8nAction(actionData) {
  const { action, data } = actionData;

  // Utilise le Brain si configuré (il gère toutes les actions)
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

  // Fallback: webhook d'action dédié
  const webhookUrl = `${process.env.N8N_WEBHOOK_URL}/${action}`;
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.N8N_API_KEY && { Authorization: `Bearer ${process.env.N8N_API_KEY}` }),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`n8n webhook failed: ${res.status}`);
  return res.json();
}

module.exports = router;
