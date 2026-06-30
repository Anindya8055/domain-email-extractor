import fs from 'fs';
import path from 'path';
import os from 'os';

let _configPathOverride = '';

const MANAGED_KEYS = [
  'SERPER_API_KEY',
  'SNOV_CLIENT_ID',
  'SNOV_CLIENT_SECRET',
  'MINELEAD_API_KEY',
  'SCRAPER_API_KEY',
  'SEARXNG_URL',
  'APOLLO_API_KEY',
  'WEBSHARE_PROXY_URL',
];

export function setConfigPath(configPath) {
  _configPathOverride = configPath ? path.resolve(configPath) : '';
  console.log('[configStore] Config path set to:', _configPathOverride || '(cleared)');
}

function resolveConfigPath() {
  if (_configPathOverride) return _configPathOverride;
  if (process.env.APP_CONFIG_PATH) return path.resolve(process.env.APP_CONFIG_PATH);
  const fallback = path.join(os.homedir(), '.domain-extractor-config.json');
  console.warn('[configStore] ⚠️ Using fallback path:', fallback);
  return fallback;
}

function ensureConfigReady() {
  const configPath = resolveConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({}, null, 2), 'utf-8');
  }
  return configPath;
}

function writeConfig(config) {
  const configPath = ensureConfigReady();
  console.log('[configStore] Saving config to:', configPath);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return config;
}

export function loadConfig() {
  try {
    const configPath = ensureConfigReady();
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return {};
  } catch (err) {
    console.error('[configStore] Failed to load config:', err?.message || err);
    return {};
  }
}

export function updateConfig(updates = {}) {
  const current = loadConfig();
  const next = { ...current };

  for (const [key, value] of Object.entries(updates || {})) {
    if (value === undefined) continue;
    if (value === null) { delete next[key]; continue; }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') { delete next[key]; } else { next[key] = trimmed; }
      continue;
    }
    next[key] = value;
  }

  next.updatedAt = new Date().toISOString();
  return writeConfig(next);
}

export function removeConfigKeys(keys = []) {
  const current = loadConfig();
  const next = { ...current };
  for (const key of keys) delete next[key];
  next.updatedAt = new Date().toISOString();
  return writeConfig(next);
}

export function clearManagedSecrets() {
  return removeConfigKeys(MANAGED_KEYS);
}

export function getConfig(key, fallback = '') {
  const fileConfig = loadConfig();
  const val = fileConfig[key] ?? process.env[key] ?? fallback;
  if (!val) console.warn(`[configStore] ⚠️ Key "${key}" is not set`);
  return val;
}

function maskValue(value) {
  if (!value) return '';
  const str = String(value);
  if (str.length <= 4) return '*'.repeat(str.length);
  return `${'*'.repeat(str.length - 4)}${str.slice(-4)}`;
}

export function getMaskedSettings() {
  const cfg = loadConfig();
  const masked = {};
  for (const key of MANAGED_KEYS) {
    const value = cfg[key] ?? process.env[key] ?? '';
    masked[key] = maskValue(value);
    masked[`${key}_SET`] = Boolean(value);
  }
  masked.updatedAt = cfg.updatedAt || '';
  return masked;
}