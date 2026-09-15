// server/controllers/jobController.js
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  getJob,
  getAllJobs,
  deleteJob,
  DomainStatus,
} from '../services/jobStore.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, '../results');

/**
 * GET /api/jobs/:jobId
 * Returns job metadata + last 200 logs.
 */
export function getJobStatus(req, res) {
  const job = getJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  const {
    id,
    status,
    createdAt,
    updatedAt,
    totalDomains,
    processedCount,
    successCount,
    blockedCount,
    errorCount,
    emailsFound,
    resultFile,
    logs,
  } = job;

  // Send last 200 logs to the frontend as recentLogs
  const recentLogs = (logs || []).slice(-200);

  return res.json({
    id,
    status,
    createdAt,
    updatedAt,
    totalDomains,
    processedCount,
    successCount,
    blockedCount,
    errorCount,
    emailsFound,
    resultFile,
    recentLogs,
  });
}

/**
 * GET /api/jobs/:jobId/domains
 * Paginated domain results.
 * Query params: page (default 1), limit (default 50, max 200)
 */
export function getJobDomains(req, res) {
  const job = getJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  const page  = Math.max(1, parseInt(req.query.page  || '1',   10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
  const offset = (page - 1) * limit;

  const total = job.domains.length;
  const data  = job.domains.slice(offset, offset + limit);

  return res.json({ total, page, limit, data });
}

/**
 * GET /api/jobs/:jobId/download
 * Streams the result Excel file.
 */
export function downloadResult(req, res) {
  const job = getJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  if (!job.resultFile) {
    return res.status(400).json({ error: 'Result file is not ready yet.' });
  }

  const filePath = path.join(RESULTS_DIR, job.resultFile);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Result file not found on disk.' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${job.resultFile}"`);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  const stream = fs.createReadStream(filePath);

  stream.on('error', (err) => {
    logger.error(`Download stream error for job ${job.id}: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream result file.' });
    }
  });

  stream.pipe(res);
}

/**
 * GET /api/jobs
 * Returns all jobs (metadata only, no domain arrays).
 */
export function listJobs(req, res) {
  return res.json(getAllJobs());
}

/**
 * DELETE /api/jobs/:jobId
 * Removes the job from memory and optionally deletes the result file.
 */
export function removeJob(req, res) {
  const job = getJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  // Delete result file if it exists
  if (job.resultFile) {
    const filePath = path.join(RESULTS_DIR, job.resultFile);
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        logger.warn(`Could not delete result file ${filePath}: ${err.message}`);
      }
    });
  }

  deleteJob(req.params.jobId);
  logger.info(`Job ${req.params.jobId} deleted.`);

  return res.json({ success: true, message: 'Job deleted.' });
}