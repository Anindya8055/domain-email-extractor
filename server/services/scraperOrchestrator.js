/**
 * Orchestrator: validates domains, deduplicates, and fires the queue job.
 * Separates domain prep logic from queue processing.
 */
import { normalizeDomain, deduplicateDomains } from '../utils/domainNormalizer.js';
import { createJob } from './jobStore.js';
import { processJob } from '../queues/scrapeQueue.js';
import { logger } from '../utils/logger.js';

const MAX_DOMAINS = parseInt(process.env.MAX_DOMAINS_PER_JOB || '2000', 10);

/**
 * Starts a scraping job.
 * @param {string} jobId
 * @param {string[]} rawDomains
 * @returns {{ jobId: string, domains: string[], skipped: number }}
 */
export async function startScrapingJob(jobId, rawDomains) {
  // Normalize
  const normalized = rawDomains
    .map(d => normalizeDomain(d))
    .filter(Boolean);

  // Deduplicate
  const unique = deduplicateDomains(normalized);

  // Enforce limit
  const domains = unique.slice(0, MAX_DOMAINS);
  const skipped = rawDomains.length - domains.length;

  if (domains.length === 0) {
    throw new Error('No valid domains found in the uploaded file.');
  }

  // Create job record
  createJob(jobId, domains);
  logger.info(`Job ${jobId} created with ${domains.length} domains (${skipped} skipped).`);

  // Fire and forget — job runs asynchronously
  setImmediate(() => {
    processJob(jobId, domains).catch(err => {
      logger.error(`Orchestrator: unhandled job error ${jobId}: ${err.message}`);
    });
  });

  return { jobId, domains, skipped };
}