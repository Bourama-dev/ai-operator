const express = require('express');
const router = express.Router();

// POST /webhooks/dashboard
// Called by n8n to push dashboard data to the app
// n8n sends: { emails, meetings, lateActions }
router.post('/dashboard', (req, res) => {
  const { emails = [], meetings = [], lateActions = [] } = req.body;

  // Store in memory (use Redis or DB for production)
  global.dashboardCache = {
    emails,
    meetings,
    lateActions,
    updatedAt: new Date().toISOString(),
  };

  res.json({ success: true });
});

// GET /webhooks/dashboard
// Mobile app polls this endpoint on load
router.get('/dashboard', (req, res) => {
  res.json(global.dashboardCache || {
    emails: [],
    meetings: [],
    lateActions: [],
    updatedAt: null,
  });
});

// POST /webhooks/n8n/result
// n8n calls this after completing an action to notify the app
router.post('/n8n/result', (req, res) => {
  const { action, success, message, data } = req.body;
  console.log(`[n8n result] ${action}: ${success ? 'OK' : 'FAILED'} — ${message}`);
  // TODO: push to connected WebSocket clients if real-time needed
  res.json({ received: true });
});

module.exports = router;
