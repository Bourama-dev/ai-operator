# AI Operator — Assistant Commercial Vocal

Application mobile + backend permettant à un commercial B2B de gérer son activité entièrement par commandes vocales, entre deux rendez-vous.

## Architecture

```
Voix → Whisper (transcription) → Claude (intention) → TTS (réponse audio)
                                        ↓ si action
                               Confirmation utilisateur
                                        ↓ si "oui"
                               n8n Webhook → CRM / Email / Calendrier
```

## Stack

| Couche | Techno |
|--------|--------|
| Mobile | React Native + Expo |
| Backend | Node.js + Express |
| Transcription | OpenAI Whisper |
| IA | Anthropic Claude (claude-sonnet-4-6) |
| TTS | OpenAI TTS (ou ElevenLabs) |
| Automatisation | n8n |

---

## Installation

### 1. Cloner le repo

```bash
git clone <repo-url>
cd ai-operator
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Remplir les clés API dans .env
npm install
npm run dev
```

Le serveur démarre sur `http://localhost:3000`.

**Endpoints principaux :**

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/voice/transcribe` | Audio → transcript → réponse Claude + audio |
| POST | `/voice/chat` | Texte → réponse Claude + audio (tests) |
| POST | `/voice/confirm` | Confirmer une action → déclenche n8n |
| GET | `/webhooks/dashboard` | Données dashboard (alimenté par n8n) |
| GET | `/health` | Vérification du serveur |

### 3. Mobile

```bash
cd mobile
npm install
# Éditer mobile/config.js avec l'IP de votre backend
npm start
```

Scanner le QR code avec Expo Go (iOS/Android).

> **Device physique :** remplacer `localhost` par l'IP locale de votre machine dans `mobile/config.js`.

### 4. n8n

Voir `n8n-workflows/README.md` pour créer les 5 webhooks d'action + le workflow dashboard quotidien.

---

## Variables d'environnement (backend/.env)

```env
ANTHROPIC_API_KEY=sk-ant-...        # claude.ai → API Keys
OPENAI_API_KEY=sk-...               # platform.openai.com → API Keys
ELEVENLABS_API_KEY=...              # elevenlabs.io (optionnel, TTS alternatif)
N8N_WEBHOOK_URL=https://...         # URL de base n8n (sans le /webhook/path)
N8N_API_KEY=...                     # Token n8n pour sécuriser les appels
PORT=3000
```

---

## Flux complet d'une commande vocale

1. L'utilisateur maintient le bouton micro
2. L'audio est enregistré (expo-av)
3. À relâchement : envoi en `multipart/form-data` à `POST /voice/transcribe`
4. Whisper transcrit l'audio en texte
5. Claude analyse l'intention et répond :
   - **Information simple** → texte naturel, converti en audio TTS
   - **Action** → JSON `{ action, data, confirmation_message }`, message de confirmation lu à voix haute
6. Si action : modal de confirmation affiché
7. L'utilisateur confirme → `POST /voice/confirm` → n8n déclenche l'action CRM/Email

---

## Actions supportées

| Action | Description |
|--------|-------------|
| `create_contact` | Créer un prospect dans le CRM |
| `update_deal` | Modifier statut/montant d'un deal |
| `get_pipeline` | Résumé de la pipeline commerciale |
| `get_next_meeting` | Prochain rendez-vous du calendrier |
| `send_email` | Envoyer un email de suivi |

---

## Exemples de commandes vocales

- *"Crée un contact : Marc Leblanc de la société TechPro, mail marc@techpro.fr"*
- *"Le deal avec Acme Corp est gagné, montant 25 000 euros"*
- *"C'est quoi mon prochain rendez-vous ?"*
- *"Résume-moi ma pipeline"*
- *"Envoie un mail de suivi à Jean Dupont"*

---

## Déploiement production

**Backend (Railway ou Render) :**
```bash
# Render : connecter le repo GitHub, root directory = backend
# Variables d'env à configurer dans le dashboard Render
```

**Mobile :**
```bash
cd mobile
npx eas build --platform all  # Expo Application Services
```
