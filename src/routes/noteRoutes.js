'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { validationMiddleware } = require('../middleware/validate');
const { rateLimit } = require('../middleware/rateLimit');
const ctrl = require('../controllers/noteController');
const {
  validateCreate,
  validateUpdate,
  validateOpen,
  validateListQuery,
  validatePreferences,
} = require('../validation/noteSchemas');

const router = express.Router();

router.use(requireAuth);

const openLimiter = rateLimit({
  windowMs: Number(process.env.RL_NOTE_OPEN_WINDOW_MS || 60_000),
  max: Number(process.env.RL_NOTE_OPEN_MAX || 10),
  keyGenerator: (req) => String(req.user?.id || req.ip),
  message: 'Too many note unlock attempts, please slow down',
});

router.get('/', validationMiddleware(validateListQuery), ctrl.list);
router.patch('/preferences', validationMiddleware(validatePreferences), ctrl.updatePreferences);
router.post('/', validationMiddleware((req) => validateCreate(req)), ctrl.create);
router.get('/:id', ctrl.getById);
router.post('/:id/open', openLimiter, validationMiddleware((req) => validateOpen(req)), ctrl.openProtected);
router.patch('/:id', validationMiddleware((req) => validateUpdate(req)), ctrl.update);
router.delete('/:id', ctrl.destroy);

module.exports = router;

