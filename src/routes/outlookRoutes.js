'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { getInbox, getCalendar } = require('../controllers/outlookController');

const router = express.Router();

router.get('/emails', requireAuth, getInbox);
router.get('/calendar', requireAuth, getCalendar);

router.use((req, res) => {
  res.status(404).json({ error: 'Outlook route not found', path: req.originalUrl });
});

module.exports = router;
