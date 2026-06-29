const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Tu es un assistant commercial vocal.
Tu aides un commercial B2B à gérer son activité depuis sa voiture.

RÈGLES IMPORTANTES :
- Réponds toujours de manière concise (max 3 phrases)
- Adapte ta réponse pour être lue à voix haute : pas de listes, pas de markdown, phrases naturelles
- Avant toute action (création, modification, envoi), demande toujours une confirmation explicite
- Si tu dois faire une action, extrais les données clés et réponds UNIQUEMENT en JSON structuré avec ce format :
  { "action": "create_contact", "data": {...}, "confirmation_message": "..." }
- Si c'est une simple question d'information, réponds en texte naturel

ACTIONS DISPONIBLES :
- create_contact : créer un prospect (champs : name, company, email, phone, notes)
- update_deal : modifier un deal CRM (champs : deal_id ou company, status, amount, notes)
- get_pipeline : récupérer la pipeline commerciale
- get_next_meeting : prochain rendez-vous
- send_email : envoyer un email (champs : to, subject, body)`;

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

  // Try to parse as JSON (action request)
  let parsed = null;
  try {
    parsed = JSON.parse(assistantMessage);
  } catch {
    // Plain text response, not an action
  }

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

module.exports = { chat };
