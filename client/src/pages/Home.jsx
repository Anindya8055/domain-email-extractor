import React, { useEffect, useRef, useState } from 'react';
import { Download, RotateCcw, Trash2, Activity } from 'lucide-react';
import DropZone from '../components/DropZone.jsx';
import StatsBar from '../components/StatsBar.jsx';
import LogFeed from '../components/LogFeed.jsx';
import ResultsTable from '../components/ResultsTable.jsx';
import JobProgress from '../components/JobProgress.jsx';
import {
  uploadFile,
  getJobStatus,
  getDownloadUrl,
  deleteJob,
} from '../services/api.js';

const POLL_INTERVAL_MS = 2500;
const POLL_BACKOFF_MS = 6000;
const POLL_ERROR_MS = 4000;

export default function Home() {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;

    const clearPoll = () => {
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };

    const scheduleNext = (delay) => {
      clearPoll();
      if (cancelled) return;
      pollRef.current = setTimeout(runPoll, delay);
    };

    const runPoll = async () => {
      if (cancelled) return;

      try {
        const res = await getJobStatus(jobId);
        if (cancelled) return;

        const nextJob = res?.data || null;
        setJob(nextJob);

        if (nextJob && ['COMPLETED', 'FAILED'].includes(nextJob.status)) {
          clearPoll();
          setPolling(false);
          return;
        }

        setPolling(true);
        scheduleNext(POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;

        console.error(err);

        const status = err?.response?.status;

        if (status === 429) {
          setPolling(true);
          scheduleNext(POLL_BACKOFF_MS);
          return;
        }

        setPolling(true);
        scheduleNext(POLL_ERROR_MS);
      }
    };

    setPolling(true);
    runPoll();

    return () => {
      cancelled = true;
      clearPoll();
      setPolling(false);
    };
  }, [jobId]);

  const handleFile = async (file) => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadError('');
    setJob(null);
    setJobId(null);
    setPolling(false);

    try {
      const res = await uploadFile(file, setUploadProgress);
      setJobId(res?.data?.jobId || null);
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!jobId) return;

    try {
      await deleteJob(jobId);
    } catch {
      //
    }

    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }

    setJobId(null);
    setJob(null);
    setPolling(false);
    setUploadProgress(0);
    setUploadError('');
  };

  const handleReset = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }

    setJobId(null);
    setJob(null);
    setPolling(false);
    setUploading(false);
    setUploadProgress(0);
    setUploadError('');
  };

  const isFinished = job?.status === 'COMPLETED' || job?.status === 'FAILED';
  const hasPreviewData = job && (job.processedCount || 0) > 0;

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
      <div className="space-y-6">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_20px_60px_rgba(2,8,23,0.35)] backdrop-blur-xl">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Upload & Start</h2>
              <p className="mt-1 text-sm text-slate-400">
                Drop your file and launch a new extraction job.
              </p>
            </div>

            <div className="hidden rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-300 md:block">
              XLSX · XLS · CSV
            </div>
          </div>

          {!jobId ? (
            <DropZone
              onFile={handleFile}
              uploading={uploading}
              uploadProgress={uploadProgress}
              error={uploadError}
            />
          ) : (
            <div className="rounded-3xl border border-cyan-400/10 bg-slate-950/50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-3">
                    <h3 className="text-base font-semibold text-white">Current Job</h3>
                    <JobProgress status={job?.status} />
                  </div>
                  <p className="break-all text-xs font-mono text-slate-500">{jobId}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {isFinished && job?.resultFile && (
                    <a
                      href={getDownloadUrl(jobId)}
                      download
                      className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                    >
                      <Download size={15} />
                      Download
                    </a>
                  )}

                  {isFinished && (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                    >
                      <RotateCcw size={15} />
                      New Job
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleDelete}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20"
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                </div>
              </div>

              {polling && !isFinished && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-200">
                  <Activity size={13} className="animate-pulse" />
                  Live polling is active
                </div>
              )}
            </div>
          )}
        </div>

        {job && (
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_20px_60px_rgba(2,8,23,0.35)] backdrop-blur-xl">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Job Metrics</h2>
              <p className="mt-1 text-sm text-slate-400">
                Track progress, successful rows, found emails, and blocked or failed domains.
              </p>
            </div>
            <StatsBar job={job} />
          </div>
        )}

        {job && (
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_20px_60px_rgba(2,8,23,0.35)] backdrop-blur-xl">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Live Crawl Feed</h2>
              <p className="mt-1 text-sm text-slate-400">
                Watch the extraction engine process domains in near real time.
              </p>
            </div>
            <LogFeed logs={job?.recentLogs || []} />
          </div>
        )}

        {job && (
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_20px_60px_rgba(2,8,23,0.35)] backdrop-blur-xl">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Results Preview</h2>
              <p className="mt-1 text-sm text-slate-400">
                Preview processed rows before exporting the final workbook.
              </p>
            </div>

            {hasPreviewData ? (
              <ResultsTable jobId={jobId} />
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/30 px-4 py-6 text-sm text-slate-400">
                Results preview will appear after the first domains are processed.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}