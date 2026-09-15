// server/index.js
import path from 'path';
import { setConfigPath } from './configStore.js';

// Read APP_CONFIG_PATH as early as possible
const appConfigPath = process.env.APP_CONFIG_PATH;
if (appConfigPath) {
  setConfigPath(path.resolve(appConfigPath));
  console.log('[server] Config path set to:', path.resolve(appConfigPath));
} else {
  console.warn(
    '[server] APP_CONFIG_PATH not set. Falling back to ~/.domain-extractor-config.json'
  );
}

import 'dotenv/config';
import app from './app.js';
import { logger } from './utils/logger.js';

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  logger.info(`Domain Email Extractor API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Config path: ${appConfigPath || '(fallback)'}`);
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