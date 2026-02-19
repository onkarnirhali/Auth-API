'use strict';

const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);
const KEY_LEN = 64;
const SALT_LEN = 16;

async function deriveHash(password, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  const out = await scryptAsync(String(password), salt, KEY_LEN);
  return Buffer.from(out).toString('hex');
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 6) {
    const err = new Error('Password must be at least 6 characters');
    err.status = 400;
    err.code = 'NOTE_PASSWORD_INVALID';
    err.expose = true;
    throw err;
  }
}

async function hashPassword(password) {
  assertPassword(password);
  const salt = crypto.randomBytes(SALT_LEN).toString('hex');
  const hash = await deriveHash(password, salt);
  return { hash, salt };
}

async function verifyPassword(password, hashHex, saltHex) {
  if (!hashHex || !saltHex) return false;
  if (typeof password !== 'string') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actualHex = await deriveHash(password, saltHex);
  const actual = Buffer.from(actualHex, 'hex');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

module.exports = {
  hashPassword,
  verifyPassword,
  assertPassword,
};

