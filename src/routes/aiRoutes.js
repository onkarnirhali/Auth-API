'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { rephrase } = require('../controllers/aiController');

const router = express.Router();

router.post('/rephrase', requireAuth, rephrase);

router.use((req, res) => {
  res.status(404).json({ error: 'AI route not found', path: req.originalUrl });
});

module.exports = router;
