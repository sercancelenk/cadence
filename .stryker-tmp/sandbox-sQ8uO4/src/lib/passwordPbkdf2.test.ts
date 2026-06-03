// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { pbkdf2HashPassword, pbkdf2VerifyPassword } from './passwordPbkdf2';

describe('pbkdf2HashPassword', () => {
  it('returns base64 salt and hash strings', async () => {
    const { saltB64, hashB64 } = await pbkdf2HashPassword('secret');
    expect(saltB64.length).toBeGreaterThan(0);
    expect(hashB64.length).toBeGreaterThan(0);
    expect(() => atob(saltB64)).not.toThrow();
    expect(() => atob(hashB64)).not.toThrow();
  });

  it('uses a fresh salt on each call', async () => {
    const a = await pbkdf2HashPassword('same-password');
    const b = await pbkdf2HashPassword('same-password');
    expect(a.saltB64).not.toBe(b.saltB64);
    expect(a.hashB64).not.toBe(b.hashB64);
  });
});

describe('pbkdf2VerifyPassword', () => {
  it('accepts the correct password', async () => {
    const password = 'correct horse battery staple';
    const { saltB64, hashB64 } = await pbkdf2HashPassword(password);
    expect(await pbkdf2VerifyPassword(password, saltB64, hashB64)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const { saltB64, hashB64 } = await pbkdf2HashPassword('right');
    expect(await pbkdf2VerifyPassword('wrong', saltB64, hashB64)).toBe(false);
  });

  it('rejects when hash length does not match', async () => {
    const { saltB64 } = await pbkdf2HashPassword('pw');
    const shortHash = btoa('tooshort');
    expect(await pbkdf2VerifyPassword('pw', saltB64, shortHash)).toBe(false);
  });
});
