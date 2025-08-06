const express = require('express');
const passport = require('passport');
const router = express.Router();


const {
  handleGoogleCallback,
  logout,
  refreshAccessToken,
} = require('../controllers/authController');

router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/failure' }),
  handleGoogleCallback //calling the controller function directly
);

router.post('/refresh', refreshAccessToken);
router.post('/logout', logout);


module.exports = router;