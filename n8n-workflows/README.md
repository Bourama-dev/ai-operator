# Workflows n8n — AI Operator

Ce dossier décrit les webhooks n8n à créer pour connecter le backend AI Operator à votre CRM et vos outils.

---

## Prérequis

- n8n installé (self-hosted ou cloud n8n.cloud)
- Votre instance n8n accessible depuis le backend (même réseau local ou URL publique)
- Clés API CRM (HubSpot, Pipedrive, etc.)

---

## 1. Webhook : `create_contact`

**URL du webhook :** `POST {N8N_WEBHOOK_URL}/create_contact`

**Payload reçu du backend :**
```json
{
  "name": "Jean Dupont",
  "company": "Acme Corp",
  "email": "jean@acme.com",
  "phone": "+33 6 12 34 56 78",
  "notes": "Intéressé par le produit X"
}
```

**Workflow n8n à créer :**
1. Trigger → Webhook (méthode POST, path `create_contact`)
2. Node CRM (ex: HubSpot → Create Contact) avec les champs mappés
3. Node HTTP Request → POST `{BACKEND_URL}/webhooks/n8n/result` avec `{ action: "create_contact", success: true, message: "Contact créé" }`

---

## 2. Webhook : `update_deal`

**URL :** `POST {N8N_WEBHOOK_URL}/update_deal`

**Payload :**
```json
{
  "company": "Acme Corp",
  "status": "gagné",
  "amount": 15000,
  "notes": "Contrat signé le 27/06"
}
```

**Workflow :**
1. Webhook trigger
2. CRM → Search Deal by company name
3. CRM → Update Deal (status + amount + notes)
4. HTTP Request → notify backend

---

## 3. Webhook : `get_pipeline`

**URL :** `GET {N8N_WEBHOOK_URL}/get_pipeline`

**Workflow :**
1. Webhook trigger
2. CRM → List Deals (filtre : actifs, triés par montant)
3. Code node → formatter les données :
```js
const deals = $input.all();
return [{
  json: {
    total: deals.length,
    summary: deals.map(d => `${d.json.company}: ${d.json.status}`).join(', ')
  }
}];
```
4. Respond to Webhook avec les données formatées

---

## 4. Webhook : `get_next_meeting`

**URL :** `GET {N8N_WEBHOOK_URL}/get_next_meeting`

**Workflow :**
1. Webhook trigger
2. Google Calendar → Get Events (today, max 1 prochain)
3. Formatter : titre, heure, lieu
4. Respond to Webhook

---

## 5. Webhook : `send_email`

**URL :** `POST {N8N_WEBHOOK_URL}/send_email`

**Payload :**
```json
{
  "to": "jean@acme.com",
  "subject": "Suivi de notre échange",
  "body": "Bonjour Jean, suite à notre discussion..."
}
```

**Workflow :**
1. Webhook trigger
2. Gmail / SendGrid / SMTP → Send Email
3. HTTP Request → notify backend

---

## 6. Workflow Dashboard (push quotidien)

Ce workflow s'exécute chaque matin (ex: 7h30) pour alimenter le dashboard de l'app.

**Nodes :**
1. Schedule Trigger (cron: `30 7 * * 1-5`)
2. Gmail → Search emails (query: `is:unread label:prospect`)
3. Google Calendar → List events (today)
4. CRM → List overdue tasks
5. Code node → assembler :
```js
return [{
  json: {
    emails: $('Gmail').all().map(e => ({ subject: e.json.subject, from: e.json.from })),
    meetings: $('Calendar').all().map(m => ({ title: m.json.summary, time: m.json.start.dateTime })),
    lateActions: $('CRM').all().map(t => ({ title: t.json.title, dueDate: t.json.dueDate }))
  }
}];
```
6. HTTP Request → POST `{BACKEND_URL}/webhooks/dashboard`

---

## Configuration des variables dans n8n

Dans **Settings → Variables**, définir :

| Nom | Valeur |
|-----|--------|
| `BACKEND_URL` | `http://votre-ip:3000` |
| `CRM_API_KEY` | votre clé API CRM |

---

## Sécurité

- Activer l'authentification sur les webhooks n8n (header `Authorization: Bearer {N8N_API_KEY}`)
- Utiliser HTTPS en production
- Restreindre les IP sources si possible
