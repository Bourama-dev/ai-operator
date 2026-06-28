/**
 * Levco Brain — proxy vers le workflow n8n central.
 *
 * Le workflow n8n reçoit { transcript, sessionId } et renvoie :
 * {
 *   response: string,             // texte à lire à voix haute
 *   isAction?: boolean,           // true si une action CRM est demandée
 *   actionData?: {                // présent seulement si isAction = true
 *     action: string,
 *     data: object,
 *     confirmation_message: string
 *   },
 *   showCard?: boolean,           // afficher la ContextCard dans l'app
 *   tasks?: Array<{               // données pour la ContextCard
 *     icon, name, sub, tag, tagStyle
 *   }>
 * }
 *
 * Si N8N_BRAIN_URL n'est pas défini, la fonction lance une erreur
 * et le route handler se rabat sur Claude directement.
 */

const fetch = require('node-fetch'); // node 18+ : fetch natif disponible

const BRAIN_URL = process.env.N8N_BRAIN_URL; // ex: https://n8n.srv1011354.hstgr.cloud/webhook/levco-operator

async function callLevcoBrain(transcript, sessionId = 'default') {
  if (!BRAIN_URL) throw new Error('N8N_BRAIN_URL non configuré');

  const res = await fetch(BRAIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.N8N_API_KEY && { Authorization: `Bearer ${process.env.N8N_API_KEY}` }),
    },
    body: JSON.stringify({ transcript, sessionId }),
    // n8n peut être lent (appels CRM + Claude) — timeout généreux
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Levco Brain HTTP ${res.status}: ${body}`);
  }

  const data = await res.json();

  // Normalise la réponse n8n quelle que soit sa forme exacte
  return {
    response:         data.response ?? data.output ?? data.text ?? '',
    isAction:         Boolean(data.isAction ?? data.is_action ?? false),
    actionData:       data.actionData ?? data.action_data ?? null,
    showCard:         Boolean(data.showCard ?? data.show_card ?? false),
    tasks:            data.tasks ?? null,
  };
}

const isConfigured = () => Boolean(BRAIN_URL);

module.exports = { callLevcoBrain, isConfigured };
