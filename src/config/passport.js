// src/config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const users = require('../models/userModel');
const gmailTokens = require('../models/gmailTokenModel');
const { connectProviderPolicy } = require('../services/providerConnection/providerConnectionService');
const { getGoogleScopes } = require('../utils/googleScopes');

const callbackURL = process.env.NODE_ENV === 'production'
  ? (process.env.GOOGLE_CALLBACK_URL_PROD || process.env.GOOGLE_CALLBACK_URL)
  : (process.env.GOOGLE_CALLBACK_URL || process.env.GOOGLE_CALLBACK_URL_PROD);

// Passport Google strategy: ensures user exists, persists tokens (access + refresh) for Gmail access
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL,
      scope: getGoogleScopes(),
      accessType: 'offline',
      prompt: 'consent',
      includeGrantedScopes: true,
    },
    async (accessToken, refreshToken, params, profile, done) => {
      try {
        const primaryEmail = Array.isArray(profile.emails) && profile.emails[0] ? profile.emails[0].value : null;
        if (!primaryEmail) return done(new Error('No email from Google profile'));
        const email = String(primaryEmail).toLowerCase();

        let user = await users.findByEmail(email);
        if (user && user.isEnabled === false) {
          return done(null, false, { message: 'User disabled' });
        }
        if (!user) {
          user = await users.create({
            email,
            name: profile.displayName || null,
            providerId: profile.id,
            providerName: 'google',
          });
        }

        const expiresInSec = params?.expires_in ? Number(params.expires_in) : null;
        const expiresAt = expiresInSec ? new Date(Date.now() + expiresInSec * 1000) : null;
        const tokenScope = params?.scope || getGoogleScopes().join(' ');
        const tokenType = params?.token_type || 'Bearer';

        try {
          await gmailTokens.upsertToken({
            userId: user.id,
            accessToken,
            refreshToken: refreshToken || null,
            tokenType,
            scope: tokenScope,
            expiresAt,
          });
        } catch (tokenErr) {
          console.error('Failed to persist Gmail tokens', tokenErr);
        }

        try {
          await connectProviderPolicy(user.id, 'gmail', {
            lastLinkedAt: new Date(),
            metadata: { scope: tokenScope || null },
          });
        } catch (linkErr) {
          console.error('Failed to persist Gmail provider link', linkErr);
        }

        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);
