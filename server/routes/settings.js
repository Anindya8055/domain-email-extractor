// server/routes/settings.js
import express from 'express';
import path from 'path';
import os from 'os';
import { getMaskedSettings, updateConfig, loadConfig } from '../configStore.js';

const router = express.Router();

const ALLOWED_KEYS = [
  'SERPER_API_KEY',
  'SNOV_CLIENT_ID',
  'SNOV_CLIENT_SECRET',
  'MINELEAD_API_KEY',
  'SCRAPER_API_KEY',
  'SEARXNG_URL',
  'APOLLO_API_KEY',
];

router.get('/', (req, res) => {
  res.json({ success: true, settings: getMaskedSettings() });
});

router.get('/debug', (req, res) => {
  const rawConfig = loadConfig();

  res.json({
    APP_CONFIG_PATH_ENV: process.env.APP_CONFIG_PATH || '(not set)',
    fallbackPath: path.join(os.homedir(), '.domain-extractor-config.json'),
    keysInFile: Object.keys(rawConfig).filter((k) => ALLOWED_KEYS.includes(k)),
    settings: getMaskedSettings(),
  });
});

router.post('/', express.json(), (req, res) => {
  try {
    const updates = {};

    for (const key of ALLOWED_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, key)) continue;

      const value = req.body[key];
      if (typeof value !== 'string') continue;

      updates[key] = value;
    }

    updateConfig(updates);

    res.json({
      success: true,
      message: 'Settings saved successfully',
      settings: getMaskedSettings(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save settings',
    });
  }
});

export default router;