const crypto = require('crypto');
const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const path = require('path');

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function loadOrCreateSecret(dataDir) {
  const secretPath = path.join(dataDir, 'session-secret');
  try {
    return readFileSync(secretPath, 'utf8').trim();
  } catch {
    mkdirSync(dataDir, { recursive: true });
    const secret = crypto.randomBytes(32).toString('base64url');
    try {
      writeFileSync(secretPath, secret, { flag: 'wx', mode: 0o600 });
    } catch {
      return readFileSync(secretPath, 'utf8').trim();
    }
    return secret;
  }
}

function createSessionToken(secret) {
  const now = Date.now();
  const payload = {
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifySessionToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

module.exports = { loadOrCreateSecret, createSessionToken, verifySessionToken };
