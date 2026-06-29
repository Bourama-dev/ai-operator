const { OpenAI } = require('openai');

let _client = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

const SYSTEM_PROMPT = `Tu es un assistant commercial vocal.
Tu aides un commercial B2B à gérer son activité depuis sa voiture.

RÈGLES IMPORTANTES :
- Réponds toujours de manière concise (max 3 phrases)
- Adapte ta réponse pour être lue à voix haute : pas de listes, pas de markdown, phrases naturelles
- Avant toute action de modification (création, envoi), demande une confirmation explicite
- Pour les actions de lecture (pipeline, RDV, brief RDV), exécute sans confirmation
- Si tu dois faire une action, réponds UNIQUEMENT en JSON :
  { "action": "create_contact", "data": {...}, "confirmation_message": "...", "autoConfirm": false }
- Si c'est une question ou une commande de lecture, utilise autoConfirm: true
- Si c'est une simple question d'information sans action, réponds en texte naturel

ACTIONS DISPONIBLES :
- create_contact    : créer un prospect (champs : name, company, email, phone, notes)
- update_deal       : modifier un deal CRM (champs : deal_id ou company, status, amount, notes)
- get_pipeline      : récupérer la pipeline commerciale [autoConfirm: true]
- get_next_meeting  : prochain rendez-vous [autoConfirm: true]
- send_email        : envoyer un email (champs : to, subject, body)
- prepare_meeting   : brief avant un RDV (champs : contact_name, meeting_time) [autoConfirm: true]`;

async function chat(userMessage, conversationHistory = []) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages,
  });

  const assistantMessage = response.choices[0].message.content;

  let parsed = null;
  try { parsed = JSON.parse(assistantMessage); } catch {}

  return {
    raw: assistantMessage,
    parsed,
    isAction: parsed !== null && parsed.action !== undefined,
    updatedHistory: [
      ...conversationHistory,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: assistantMessage },
    ],
  };
}

async function streamChat(userMessage, conversationHistory = [], onToken) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  let fullText = '';

  const stream = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages,
    stream: true,
  });

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content || '';
    if (token) {
      fullText += token;
      if (onToken) onToken(token);
    }
  }

  let parsed = null;
  try { parsed = JSON.parse(fullText.trim()); } catch {}

  return {
    raw: fullText,
    parsed,
    isAction: parsed !== null && parsed.action !== undefined,
    updatedHistory: [
      ...conversationHistory,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: fullText },
    ],
  };
}

module.exports = { chat, streamChat };
