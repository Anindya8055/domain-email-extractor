// server/index.js
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// APP_CONFIG_PATH is only set by Electron — skip on web server
const appConfigPath = process.env.APP_CONFIG_PATH;
if (appConfigPath) {
  const { setConfigPath } = await import('./configStore.js');
  setConfigPath(path.resolve(appConfigPath));
  console.log('[server] Config path set to:', path.resolve(appConfigPath));
} else {
  console.warn('[server] Running in web mode — using .env for config.');
}

import 'dotenv/config';
import app from './app.js';
import { logger } from './utils/logger.js';

const PORT = process.env.PORT || 4001;

const server = app.listen(PORT, () => {
  logger.info(`Domain Email Extractor API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

const shutdown = (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});