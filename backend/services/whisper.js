const { OpenAI } = require('openai');
const fs = require('fs');

// Lazy init — évite le crash au chargement si OPENAI_API_KEY manque
let _client = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

async function transcribeAudio(audioFilePath) {
  const fileStream = fs.createReadStream(audioFilePath);
  const transcription = await getClient().audio.transcriptions.create({
    file: fileStream,
    model: 'whisper-1',
    language: 'fr',
  });
  return transcription.text;
}

module.exports = { transcribeAudio };
