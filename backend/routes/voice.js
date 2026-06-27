const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { transcribeAudio } = require('../services/whisper');
const { chat } = require('../services/claude');
const { synthesizeSpeech } = require('../services/tts');

const router = express.Router();
const upload = multer({ dest: '/tmp/uploads/' });

// In-memory session store (replace with Redis for production)
const sessions = new Map();

// POST /voice/transcribe
// Accepts: multipart/form-data with field "audio" (m4a/wav/webm)
// Returns: { transcript, response, audioUrl, isAction, actionData }
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }

  const sessionId = req.headers['x-session-id'] || 'default';
  const audioPath = req.file.path;

  try {
    // 1. Transcribe audio
    const transcript = await transcribeAudio(audioPath);

    // 2. Get conversation history for this session
    const history = sessions.get(sessionId) || [];

    // 3. Send to Claude
    const claudeResult = await chat(transcript, history);

    // 4. Update session history
    sessions.set(sessionId, claudeResult.updatedHistory.slice(-20)); // Keep last 20 messages

    // 5. Determine TTS text
    const ttsText = claudeResult.isAction
      ? claudeResult.parsed.confirmation_message
      : claudeResult.raw;

    // 6. Generate audio response
    const audioFilePath = await synthesizeSpeech(ttsText);
    const audioFileName = path.basename(audioFilePath);

    res.json({
      transcript,
      response: ttsText,
      audioUrl: `/audio/${audioFileName}`,
      isAction: claudeResult.isAction,
      actionData: claudeResult.isAction ? claudeResult.parsed : null,
    });
  } catch (err) {
    console.error('[/transcribe]', err);
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(audioPath, () => {});
  }
});

// POST /voice/chat
// Accepts: { message: string, sessionId?: string }
// For text-based testing without audio
router.post('/chat', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    const history = sessions.get(sessionId) || [];
    const claudeResult = await chat(message, history);
    sessions.set(sessionId, claudeResult.updatedHistory.slice(-20));

    const ttsText = claudeResult.isAction
      ? claudeResult.parsed.confirmation_message
      : claudeResult.raw;

    const audioFilePath = await synthesizeSpeech(ttsText);
    const audioFileName = path.basename(audioFilePath);

    res.json({
      transcript: message,
      response: ttsText,
      audioUrl: `/audio/${audioFileName}`,
      isAction: claudeResult.isAction,
      actionData: claudeResult.isAction ? claudeResult.parsed : null,
    });
  } catch (err) {
    console.error('[/chat]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /voice/confirm
// Called after user confirms an action
// Accepts: { actionData: object, sessionId?: string }
router.post('/confirm', async (req, res) => {
  const { actionData, sessionId = 'default' } = req.body;
  if (!actionData) return res.status(400).json({ error: 'actionData is required' });

  try {
    // Trigger n8n webhook for the action
    const n8nResult = await triggerN8nAction(actionData);

    const confirmationText = `C'est fait. ${actionData.action === 'create_contact' ? 'Le contact a été créé.' : 'L\'action a été effectuée.'} Y a-t-il autre chose ?`;
    const audioFilePath = await synthesizeSpeech(confirmationText);

    res.json({
      success: true,
      response: confirmationText,
      audioUrl: `/audio/${path.basename(audioFilePath)}`,
      n8nResult,
    });
  } catch (err) {
    console.error('[/confirm]', err);
    res.status(500).json({ error: err.message });
  }
});

async function triggerN8nAction(actionData) {
  const { action, data } = actionData;
  const webhookUrl = `${process.env.N8N_WEBHOOK_URL}/${action}`;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.N8N_API_KEY}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`n8n webhook failed: ${response.status}`);
  }

  return response.json();
}

module.exports = router;
