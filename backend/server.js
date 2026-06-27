require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const voiceRoutes = require('./routes/voice');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve generated TTS audio files
const TMP_DIR = '/tmp';
app.use('/audio', (req, res, next) => {
  const filePath = path.join(TMP_DIR, path.basename(req.path));
  if (!filePath.startsWith(TMP_DIR)) {
    return res.status(400).end();
  }
  res.sendFile(filePath, (err) => {
    if (err) next(err);
    // Clean up after serving
    else fs.unlink(filePath, () => {});
  });
});

app.use('/voice', voiceRoutes);
app.use('/webhooks', webhookRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`AI Operator backend running on port ${PORT}`);
});
