import { randomBytes } from 'node:crypto';

// Development sessions expire on restart instead of sharing a public fallback key.
const developmentSecret = randomBytes(32).toString('hex');
const isPlaceholder = (value) => /^(replace_with|your_|example|change_me)/i.test(value);

export function sessionSecret() {
  const value = String(process.env.ADMIN_SESSION_SECRET || '').trim();
  if (value.length >= 32 && !isPlaceholder(value)) return value;
  if (String(process.env.NODE_ENV).toLowerCase() === 'production') {
    throw new Error('Production requires a unique ADMIN_SESSION_SECRET of at least 32 characters.');
  }
  return developmentSecret;
}

export function assertProductionConfiguration() {
  if (String(process.env.NODE_ENV).toLowerCase() !== 'production') return;
  sessionSecret();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!process.env.ADMIN_USERNAME || password.length < 12 || isPlaceholder(password)) {
    throw new Error('Production requires configured admin credentials and a password of at least 12 characters.');
  }
  let base;
  try { base = new URL(process.env.PUBLIC_BASE_URL); } catch {}
  if (!base || base.protocol !== 'https:' || base.username || base.password || /(^|\.)example\.(com|org|net)$/.test(base.hostname)) {
    throw new Error('Production requires your own HTTPS PUBLIC_BASE_URL.');
  }
}
