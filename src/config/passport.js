// src/config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');

passport.use(
    new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
    }, 
    async (accessToken, refreshToken, profile, done) => {
    try {
        console.log("Using callback URL:", process.env.GOOGLE_CALLBACK_URL);
        // Find or insert user
        const email = profile.emails[0].value;
        const res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        let user = res.rows[0];

        if (!user) { 
        const insert = await pool.query(
            'INSERT INTO users (email, name, provider_id) VALUES ($1, $2, $3) RETURNING *',
            [email, profile.displayName, profile.id]
        );
        user = insert.rows[0];
        }

        done(null, user);
    } 
    catch (err) {
        done(err, null);
    }
    })
);