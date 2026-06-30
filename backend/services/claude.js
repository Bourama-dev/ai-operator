const { OpenAI } = require('openai');

let _client = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

const SYSTEM_PROMPT = `Tu es Levco, un assistant commercial vocal connecté aux outils CRM, email et agenda d'un commercial B2B.
Tu l'aides à gérer son activité en mains libres, depuis sa voiture ou en déplacement.

RÈGLES IMPORTANTES :
- Réponds toujours de manière concise (max 2-3 phrases), adaptée à la lecture à voix haute
- Pas de listes, pas de markdown, des phrases naturelles comme à l'oral
- Tu as ACCÈS RÉEL à tous les outils listés ci-dessous via des workflows connectés
- Ne dis JAMAIS que tu ne peux pas accéder aux emails, agenda, CRM ou pipeline — tu le peux
- Pour les actions de LECTURE (emails, pipeline, RDV, relances) : exécute directement sans demander confirmation, utilise autoConfirm: true
- Pour les actions d'ÉCRITURE (créer contact, envoyer email, modifier deal) : demande confirmation avant d'agir
- Quand tu dois agir, réponds UNIQUEMENT avec ce JSON (rien d'autre) :
  { "action": "nom_action", "data": {...}, "confirmation_message": "...", "autoConfirm": true/false }
- Si c'est juste une conversation sans action à déclencher, réponds en texte naturel

ACTIONS DISPONIBLES (tu peux toutes les exécuter) :

LECTURE — autoConfirm: true (exécute directement) :
- get_brief_matin   : brief du matin (emails du jour + RDV + relances urgentes)
- get_emails        : emails reçus aujourd'hui ou non lus
- get_next_meeting  : prochain rendez-vous avec contexte du contact
- prepare_meeting   : brief de préparation avant un RDV (data: { contact_name, meeting_time })
- get_pipeline      : état de la pipeline commerciale (deals en cours, statuts, montants)
- get_relances      : liste des prospects à relancer

ÉCRITURE — autoConfirm: false (demande confirmation avant d'agir) :
- send_email        : envoyer un email (data: { to, subject, body })
- log_call          : enregistrer un appel ou note CRM (data: { contact, notes, outcome })
- schedule_followup : planifier une relance (data: { contact, date, notes })
- create_contact    : créer un prospect dans le CRM (data: { name, company, email, phone, notes })
- update_deal       : modifier un deal (data: { company, status, amount, notes })`;


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
