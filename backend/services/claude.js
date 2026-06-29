const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages,
  });

  const assistantMessage = response.content[0].text;

  let parsed = null;
  try { parsed = JSON.parse(assistantMessage); } catch {}

  return {
    raw: assistantMessage,
    parsed,
    isAction: parsed !== null && parsed.action !== undefined,
    updatedHistory: [
      ...messages,
      { role: 'assistant', content: assistantMessage },
    ],
  };
}

async function streamChat(userMessage, conversationHistory = [], onToken) {
  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  let fullText = '';

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      const token = event.delta.text;
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
      ...messages,
      { role: 'assistant', content: fullText },
    ],
  };
}

module.exports = { chat, streamChat };
