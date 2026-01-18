const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { validationMiddleware } = require('../middleware/validate');
const { validateCreate, validateUpdate, validateListQuery } = require('../validation/todoSchemas');
const ctrl = require('../controllers/todoController');

const router = express.Router();

// Todos API: all routes require auth; validation is request-shape aware
router.use(requireAuth);
router.get('/', validationMiddleware(validateListQuery), ctrl.list);
router.post('/', validationMiddleware((req)=>validateCreate(req)), ctrl.create);
router.patch('/:id', validationMiddleware((req)=>validateUpdate(req)), ctrl.update);
router.delete('/:id', ctrl.destroy);

module.exports = router;
