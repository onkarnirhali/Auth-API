'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  listProviders,
  connectProvider,
  disconnectProvider,
  toggleIngest,
} = require('../controllers/providerController');

const router = express.Router();

router.get('/providers', requireAuth, listProviders);
router.post('/providers/:provider/connect', requireAuth, connectProvider);
router.post('/providers/:provider/disconnect', requireAuth, disconnectProvider);
router.post('/providers/:provider/toggle', requireAuth, toggleIngest);

router.use((req, res) => {
  res.status(404).json({ error: 'Me route not found', path: req.originalUrl });
});

module.exports = router;
