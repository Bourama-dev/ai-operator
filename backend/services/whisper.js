const { OpenAI, toFile } = require('openai');
const fs = require('fs');

let _client = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

const MIME_TO_EXT = {
  'audio/webm': 'webm',
  'audio/ogg':  'ogg',
  'audio/mp4':  'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav':  'wav',
  'audio/flac': 'flac',
};

async function transcribeAudio(audioFilePath, mimeType = 'audio/webm') {
  const base = mimeType.split(';')[0].trim();
  const ext  = MIME_TO_EXT[base] || 'webm';
  const file = await toFile(fs.createReadStream(audioFilePath), `audio.${ext}`, { type: base });
  const transcription = await getClient().audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'fr',
  });
  return transcription.text;
}

module.exports = { transcribeAudio };
