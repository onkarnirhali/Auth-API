'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  rephrase,
  listSuggestions,
  refreshSuggestions,
  acceptSuggestion,
  dismissSuggestion,
  dismissSuggestionsBulk,
} = require('../controllers/aiController');

const router = express.Router();

// AI helpers: rephrase and suggestion lifecycle (auth required)
router.post('/rephrase', requireAuth, rephrase);
router.get('/suggestions', requireAuth, listSuggestions);
router.post('/suggestions/refresh', requireAuth, refreshSuggestions);
router.post('/suggestions/:id/accept', requireAuth, acceptSuggestion);
router.post('/suggestions/:id/dismiss', requireAuth, dismissSuggestion);
router.post('/suggestions/dismiss', requireAuth, dismissSuggestionsBulk);

router.use((req, res) => {
  res.status(404).json({ error: 'AI route not found', path: req.originalUrl });
});

module.exports = router;
