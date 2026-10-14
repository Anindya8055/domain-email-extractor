// server/queues/scrapeQueue.js
import pLimit from 'p-limit';
import { chromium } from 'playwright';
import fs from 'fs';
import { scrapeDomain } from '../scrapers/domainScraper.js';
import {
  updateDomainResult,
  updateJob,
  addJobLog,
  JobStatus,
  DomainStatus,
  getJob,
} from '../services/jobStore.js';
import { generateResultsExcel } from '../services/excelService.js';
import { logger } from '../utils/logger.js';
import { RESULTS_DIR } from '../utils/paths.js';

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_JOBS || '4', 10);

function isPlaywrightBrowserAvailable() {
  try {
    const exePath = chromium.executablePath();
    return Boolean(exePath && fs.existsSync(exePath));
  } catch {
    return false;
  }
}

async function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--disable-extensions',
    ],
  });
}

export async function processJob(jobId, domains) {
  updateJob(jobId, { status: JobStatus.PROCESSING });
  addJobLog(jobId, `Job started. Processing ${domains.length} domains...`, 'info');

  let browser = null;

  try {
    if (isPlaywrightBrowserAvailable()) {
      try {
        browser = await launchBrowser();
        addJobLog(jobId, 'Playwright browser initialized.', 'info');
      } catch (err) {
        addJobLog(
          jobId,
          `Playwright launch failed — continuing without Playwright. ${err.message}`,
          'warn'
        );
        logger.warn(`Job ${jobId}: Playwright launch failed: ${err.message}`);
        browser = null;
      }
    } else {
      addJobLog(
        jobId,
        'Playwright browser not installed — continuing without Playwright.',
        'warn'
      );
      logger.warn(`Job ${jobId}: Playwright browser executable not found.`);
    }

    const limit = pLimit(MAX_CONCURRENT);

    const tasks = domains.map((domain) =>
      limit(async () => {
        updateDomainResult(jobId, domain, { status: DomainStatus.PROCESSING });

        const result = await scrapeDomain(domain, browser, (msg) => {
          addJobLog(jobId, msg, 'debug');
        });

        updateDomainResult(jobId, domain, {
          status: result.status,
          emails: result.emails,
          method: result.method,
          error: result.error,
        });

        const emoji =
          result.status === 'SUCCESS'   ? '✅' :
          result.status === 'BLOCKED'   ? '🚫' :
          result.status === 'NO_EMAILS' ? '📭' : '❌';

        addJobLog(
          jobId,
          `${emoji} ${domain} → ${result.status} | ${result.emails.length} emails | ${result.method}`,
          result.status === 'ERROR' ? 'error' : 'info'
        );
      })
    );

    await Promise.allSettled(tasks);

    addJobLog(jobId, 'Generating result Excel file...', 'info');
    const job = getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} missing from store before Excel generation.`);
    }

    const filename = generateResultsExcel(jobId, job.domains, RESULTS_DIR);

    updateJob(jobId, {
      status: JobStatus.COMPLETED,
      resultFile: filename,
    });

    addJobLog(jobId, `✅ Job completed. Result file: ${filename}`, 'info');
    logger.info(`Job ${jobId} completed successfully.`);
  } catch (err) {
    logger.error(`Job ${jobId} failed: ${err.message}`);
    addJobLog(jobId, `❌ Job failed: ${err.message}`, 'error');
    updateJob(jobId, { status: JobStatus.FAILED });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore close errors
      }
    }
  }
}