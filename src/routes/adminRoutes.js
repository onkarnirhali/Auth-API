'use strict';

const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const { getSummary, listUsers, listEvents, listIntegrations } = require('../controllers/adminController');

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/summary', getSummary);
router.get('/users', listUsers);
router.get('/events', listEvents);
router.get('/integrations', listIntegrations);

router.use((req, res) => {
  res.status(404).json({ error: 'Admin route not found', path: req.originalUrl });
});

module.exports = router;
