'use strict';

const { hashPassword, verifyPassword } = require('../src/utils/notePassword');

describe('note password helper', () => {
  it('hashes and verifies password', async () => {
    const hashed = await hashPassword('secret-123');
    expect(hashed.hash).toBeTruthy();
    expect(hashed.salt).toBeTruthy();
    await expect(verifyPassword('secret-123', hashed.hash, hashed.salt)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hashed.hash, hashed.salt)).resolves.toBe(false);
  });

  it('enforces min password length', async () => {
    await expect(hashPassword('short')).rejects.toMatchObject({ code: 'NOTE_PASSWORD_INVALID' });
  });
});

