'use strict';

const path = require('path');
// temporarily set env before requiring util
process.env.MS_TOKEN_ENC_KEY = Buffer.alloc(32, 1).toString('base64');

const { encrypt, decrypt } = require('../src/utils/encryption');

describe('encryption util', () => {
  it('encrypts and decrypts a value', () => {
    const plain = 'secret-token';
    const cipher = encrypt(plain);
    expect(cipher).toMatch(/^v1:/);
    const out = decrypt(cipher);
    expect(out).toBe(plain);
  });
});
