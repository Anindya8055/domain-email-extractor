import React from 'react';
import { Globe, Mail, CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';

function MetricCard({ icon: Icon, label, value, tone }) {
  return (
    <div className={`rounded-3xl border p-4 ${tone}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-black/20">
          <Icon size={18} />
        </div>
        <span className="text-[11px] uppercase tracking-[0.18em] text-white/50">Metric</span>
      </div>

      <div className="text-2xl font-bold text-white">{Number(value || 0).toLocaleString()}</div>
      <div className="mt-1 text-xs text-white/65">{label}</div>
    </div>
  );
}

export default function StatsBar({ job }) {
  if (!job) return null;

  const total = job.totalDomains || 0;
  const processed = job.processedCount || 0;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-300">
            Processed {processed.toLocaleString()} / {total.toLocaleString()} domains
          </span>
          <span className="text-sm font-semibold text-cyan-300">{pct}%</span>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={Globe}
          label="Total Domains"
          value={job.totalDomains}
          tone="border-white/10 bg-gradient-to-br from-slate-900 to-slate-800/70 text-slate-200"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Successful"
          value={job.successCount}
          tone="border-emerald-400/20 bg-gradient-to-br from-emerald-500/20 to-emerald-400/10 text-emerald-200"
        />
        <MetricCard
          icon={Mail}
          label="Emails Found"
          value={job.emailsFound}
          tone="border-cyan-400/20 bg-gradient-to-br from-cyan-500/20 to-sky-400/10 text-cyan-200"
        />
        <MetricCard
          icon={ShieldAlert}
          label="Blocked"
          value={job.blockedCount}
          tone="border-amber-400/20 bg-gradient-to-br from-amber-500/20 to-amber-400/10 text-amber-200"
        />
        <MetricCard
          icon={XCircle}
          label="Errors / No Email"
          value={job.errorCount}
          tone="border-rose-400/20 bg-gradient-to-br from-rose-500/20 to-rose-400/10 text-rose-200"
        />
      </div>
    </div>
  );
}