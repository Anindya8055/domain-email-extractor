/**
 * In-memory job store.
 * Future-ready: replace with Redis/MongoDB for distributed workers.
 */

const jobs = new Map();

export const JobStatus = {
  PENDING:    'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED:  'COMPLETED',
  FAILED:     'FAILED'
};

export const DomainStatus = {
  PENDING:    'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCESS:    'SUCCESS',
  BLOCKED:    'BLOCKED',
  ERROR:      'ERROR',
  NO_EMAILS:  'NO_EMAILS'
};

/**
 * Creates a new job entry.
 */
export function createJob(jobId, domains) {
  const job = {
    id: jobId,
    status: JobStatus.PENDING,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalDomains: domains.length,
    processedCount: 0,
    successCount: 0,
    blockedCount: 0,
    errorCount: 0,
    emailsFound: 0,
    resultFile: null,
    logs: [],
    domains: domains.map(domain => ({
      domain,
      status: DomainStatus.PENDING,
      emails: [],
      method: null,
      error: null
    }))
  };

  jobs.set(jobId, job);
  return job;
}

/**
 * Retrieves a job by ID.
 */
export function getJob(jobId) {
  return jobs.get(jobId) || null;
}

/**
 * Returns all jobs — metadata only, no domain list for performance.
 */
export function getAllJobs() {
  return Array.from(jobs.values()).map(j => ({
    id: j.id,
    status: j.status,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    totalDomains: j.totalDomains,
    processedCount: j.processedCount,
    successCount: j.successCount,
    blockedCount: j.blockedCount,
    errorCount: j.errorCount,
    emailsFound: j.emailsFound,
    resultFile: j.resultFile
  }));
}

/**
 * Updates a specific domain result inside a job.
 */
export function updateDomainResult(jobId, domain, update) {
  const job = jobs.get(jobId);
  if (!job) return;

  const domainEntry = job.domains.find(d => d.domain === domain);
  if (domainEntry) {
    Object.assign(domainEntry, update);
  }

  // Recalculate counters
  job.processedCount = job.domains.filter(d =>
    d.status !== DomainStatus.PENDING && d.status !== DomainStatus.PROCESSING
  ).length;
  job.successCount = job.domains.filter(d => d.status === DomainStatus.SUCCESS).length;
  job.blockedCount = job.domains.filter(d => d.status === DomainStatus.BLOCKED).length;
  job.errorCount   = job.domains.filter(d =>
    d.status === DomainStatus.ERROR || d.status === DomainStatus.NO_EMAILS
  ).length;
  job.emailsFound  = job.domains.reduce((sum, d) => sum + (d.emails?.length || 0), 0);
  job.updatedAt    = new Date().toISOString();
}

/**
 * Updates top-level job fields.
 */
export function updateJob(jobId, update) {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, update, { updatedAt: new Date().toISOString() });
}

/**
 * Appends a log entry to the job. Caps at 500 entries.
 */
export function addJobLog(jobId, message, level = 'info') {
  const job = jobs.get(jobId);
  if (!job) return;
  if (job.logs.length > 500) job.logs.shift();
  job.logs.push({ timestamp: new Date().toISOString(), level, message });
}

/**
 * Deletes a job from memory.
 */
export function deleteJob(jobId) {
  jobs.delete(jobId);
}