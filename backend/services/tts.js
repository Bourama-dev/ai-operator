const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

let _client = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

async function synthesizeSpeech(text) {
  const outputPath = path.join('/tmp', `tts-${randomUUID()}.mp3`);
  const response = await getClient().audio.speech.create({
    model: 'tts-1',
    voice: 'onyx',
    input: text,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

module.exports = { synthesizeSpeech };
