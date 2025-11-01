// src/config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const users = require('../models/userModel');

passport.use(
    new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.NODE_ENV === 'production'
      ? (process.env.GOOGLE_CALLBACK_URL_PROD || process.env.GOOGLE_CALLBACK_URL)
      : (process.env.GOOGLE_CALLBACK_URL || process.env.GOOGLE_CALLBACK_URL_PROD)
    }, 
    async (accessToken, refreshToken, profile, done) => {
    try {
        const primaryEmail = Array.isArray(profile.emails) && profile.emails[0] ? profile.emails[0].value : null;
        if (!primaryEmail) return done(new Error('No email from Google profile'));
        const email = String(primaryEmail).toLowerCase();

        let user = await users.findByEmail(email);
        if (!user) {
          user = await users.create({
            email,
            name: profile.displayName || null,
            providerId: profile.id,
            providerName: 'google',
          });
        }

        done(null, user);
    } 
    catch (err) {
        done(err, null);
    }
    })
);
