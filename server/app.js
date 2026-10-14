// server/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import uploadRoutes from './routes/upload.js';
import jobRoutes from './routes/jobs.js';
import settingsRoutes from './routes/settings.js';
import { logger } from './utils/logger.js';
import { RESULTS_DIR } from './utils/paths.js';

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use('/results', express.static(RESULTS_DIR));

const createLimiter = ({ windowMs, max, message, skip }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    skip,
  });

const generalApiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many requests. Please wait before trying again.',
  skip: (req) => {
    if (req.path === '/health') return true;

    if (req.method === 'GET' && /^\/jobs\/[^/]+$/.test(req.path)) {
      return true;
    }

    return false;
  },
});

const jobStatusLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many job status requests. Please wait a moment.',
});

app.use('/api', generalApiLimiter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    configPath: process.env.APP_CONFIG_PATH || 'fallback',
  });
});

app.use('/api/upload', uploadRoutes);
app.use('/api/settings', settingsRoutes);

app.use(
  '/api/jobs/:jobId',
  (req, res, next) => {
    if (req.method === 'GET' && req.path === '/') {
      return jobStatusLimiter(req, res, next);
    }
    return next();
  }
);

app.use('/api/jobs', jobRoutes);

app.use((err, req, res, next) => {
  logger.error('Unhandled route error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

export default app;