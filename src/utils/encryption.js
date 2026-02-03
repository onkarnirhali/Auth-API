'use strict';

// Symmetric encryption helper (AES-256-GCM) for storing sensitive tokens at rest
// Requires MS_TOKEN_ENC_KEY env: 32-byte key, base64 or hex

const crypto = require('crypto');

function getKey() {
  const raw = process.env.MS_TOKEN_ENC_KEY;
  if (!raw) throw new Error('MS_TOKEN_ENC_KEY is required for Outlook token encryption');

  // Accept base64 or hex; normalize to Buffer length 32
  let key = null;
  if (/^[A-Fa-f0-9]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    // base64 decode; ignore padding variance
    key = Buffer.from(raw, 'base64');
  }
  if (key.length !== 32) {
    throw new Error('MS_TOKEN_ENC_KEY must decode to 32 bytes (256 bits)');
  }
  return key;
}

function encrypt(plain) {
  if (plain === undefined || plain === null) return null;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: v1:<iv>:<ciphertext>:<tag> (all base64)
  return `v1:${iv.toString('base64')}:${ciphertext.toString('base64')}:${tag.toString('base64')}`;
}

function decrypt(payload) {
  if (!payload) return null;
  if (!payload.startsWith('v1:')) throw new Error('Unsupported cipher payload');
  const parts = payload.split(':');
  if (parts.length !== 4) throw new Error('Malformed cipher payload');
  const [, ivB64, dataB64, tagB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  return plain;
}

module.exports = {
  encrypt,
  decrypt,
};
