// server/controllers/uploadController.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { parseDomainsFromFile } from '../services/excelService.js';
import { startScrapingJob } from '../services/scraperOrchestrator.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function handleUpload(req, res) {
  const filePath = req.file?.path;

  if (!filePath) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  let rawDomains;

  try {
    rawDomains = parseDomainsFromFile(filePath);
  } catch (err) {
    logger.error(`File parse failed: ${err.message}`);
    // Clean up temp file
    fs.unlink(filePath, () => {});
    return res.status(400).json({ error: err.message || 'Failed to parse file.' });
  }

  // Clean up temp file after parsing — no longer needed
  fs.unlink(filePath, (unlinkErr) => {
    if (unlinkErr) logger.warn(`Could not delete temp upload file: ${filePath}`);
  });

  if (!rawDomains?.length) {
    return res.status(400).json({ error: 'No domains found in uploaded file.' });
  }

  const jobId = uuidv4();

  try {
    const { domains, skipped } = await startScrapingJob(jobId, rawDomains);

    logger.info(`Upload accepted: jobId=${jobId}, domains=${domains.length}, skipped=${skipped}`);

    return res.status(202).json({
      jobId,
      totalDomains: domains.length,
      skipped,
      message: `Job started with ${domains.length} domains.`,
    });
  } catch (err) {
    logger.error(`Job start failed: ${err.message}`);
    return res.status(500).json({ error: err.message || 'Failed to start job.' });
  }
}