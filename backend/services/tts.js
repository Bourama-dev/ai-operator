const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function synthesizeSpeech(text) {
  const outputPath = path.join('/tmp', `tts-${randomUUID()}.mp3`);

  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'onyx', // Deep, professional voice
    input: text,
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);

  return outputPath;
}

// ElevenLabs alternative — uncomment if preferred
// const ELEVENLABS_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam
// async function synthesizeSpeechElevenLabs(text) {
//   const response = await fetch(
//     `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
//     {
//       method: 'POST',
//       headers: {
//         'xi-api-key': process.env.ELEVENLABS_API_KEY,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
//     }
//   );
//   const buffer = Buffer.from(await response.arrayBuffer());
//   const outputPath = path.join('/tmp', `tts-${randomUUID()}.mp3`);
//   fs.writeFileSync(outputPath, buffer);
//   return outputPath;
// }

module.exports = { synthesizeSpeech };
