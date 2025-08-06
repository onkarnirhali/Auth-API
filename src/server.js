// src/server.js
require('dotenv').config();
const express = require('express');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/authRoutes');
require('./config/db');
require('./config/passport');


const app = express();
app.use(express.json());
app.use(cookieParser());

// Initialize passport
app.use(passport.initialize());

// Routes
// app.use('/auth', authRoutes);
app.use('/auth', require('./routes/authRoutes'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));