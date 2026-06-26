// server/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import uploadRoutes from './routes/upload.js';
import jobRoutes from './routes/jobs.js';
import settingsRoutes from './routes/settings.js';
import { logger } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Allow inline scripts/styles for React in production
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? false : undefined,
  })
);

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, mobile apps, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // In production, allow same-server origin (port 4001)
      if (process.env.NODE_ENV === 'production') return callback(null, true);
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '50mb' }));  // Increased for large Excel uploads
app.use('/results', express.static(path.join(__dirname, 'results')));

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
    if (req.method === 'GET' && /^\/jobs\/[^/]+$/.test(req.path)) return true;
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
    environment: process.env.NODE_ENV || 'development',
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

// ── Serve React frontend in production ──────────────────────────────────────
// Must be AFTER all /api routes
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled route error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

export default app;