import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getJobDomains, getJobStatus } from '../services/api.js';
import { methodBadge, statusColor } from '../utils/formatters.js';

const LIMIT = 50;
const POLL_INTERVAL = 3000; // re-fetch every 3s while job is running

const RUNNING_STATUSES = new Set(['PENDING', 'PROCESSING']);

export default function ResultsTable({ jobId }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [jobDone, setJobDone] = useState(false);
  const pollRef = useRef(null);

  // Reset when jobId changes
  useEffect(() => {
    setPage(1);
    setRows([]);
    setTotal(0);
    setJobDone(false);
  }, [jobId]);

  const fetchRows = async (currentPage, isFirstLoad = false) => {
    if (!jobId) return;
    if (isFirstLoad) setLoading(true);

    try {
      const [domainRes, jobRes] = await Promise.all([
        getJobDomains(jobId, currentPage, LIMIT),
        getJobStatus(jobId),
      ]);

      setRows(Array.isArray(domainRes?.data?.data) ? domainRes.data.data : []);
      setTotal(Number(domainRes?.data?.total || 0));

      const jobStatus = jobRes?.data?.status;
      const isDone = jobStatus && !RUNNING_STATUSES.has(jobStatus);
      setJobDone(isDone);
    } catch (err) {
      console.error('Results preview failed:', err);
      setRows([]);
      setTotal(0);
    } finally {
      if (isFirstLoad) setLoading(false);
    }
  };

  // Start/stop polling based on jobId, page, and jobDone
  useEffect(() => {
    if (!jobId) return;

    // Immediate first load
    fetchRows(page, true);

    // Start polling if job is not done yet
    if (!jobDone) {
      pollRef.current = setInterval(() => {
        fetchRows(page, false); // silent re-fetch, no loading spinner
      }, POLL_INTERVAL);
    }

    return () => {
      clearInterval(pollRef.current);
    };
  }, [jobId, page, jobDone]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const showPagination = total > LIMIT;

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#081120]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-[0.18em] text-slate-400">
            <tr>
              <th className="px-4 py-4">Domain</th>
              <th className="px-4 py-4">Emails</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Method</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/[0.05]">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-4">
                    <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-60 animate-pulse rounded bg-white/10" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-4 py-10 text-center text-sm text-slate-400">
                  No processed rows available yet.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={`${row.domain}-${index}`}
                  className="transition hover:bg-cyan-400/[0.03]"
                >
                  <td className="px-4 py-4 align-top font-mono text-xs text-slate-200 break-all">
                    {row.domain || '—'}
                  </td>

                  <td className="px-4 py-4 align-top">
                    {row.emails?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {row.emails.slice(0, 4).map((email) => (
                          <span
                            key={email}
                            className="rounded-full border border-cyan-400/15 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-mono text-cyan-200"
                          >
                            {email}
                          </span>
                        ))}
                        {row.emails.length > 4 && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-400">
                            +{row.emails.length - 4} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">No emails</span>
                    )}
                  </td>

                  <td className="px-4 py-4 align-top">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColor(row.status)}`}
                    >
                      {row.status || 'UNKNOWN'}
                    </span>
                  </td>

                  <td className="px-4 py-4 align-top">
                    {row.method ? (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${methodBadge(row.method)}`}
                      >
                        {row.method}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.03] px-4 py-3">
          <span className="text-xs text-slate-400">
            {total.toLocaleString()} rows · Page {page} of {totalPages}
          </span>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>

            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}