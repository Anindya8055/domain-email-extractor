import React from 'react';
import { Clock3, Loader2, CheckCircle2, XCircle } from 'lucide-react';

const styles = {
  PENDING: {
    icon: Clock3,
    className: 'border-white/10 bg-white/5 text-slate-300',
    text: 'Pending',
  },
  PROCESSING: {
    icon: Loader2,
    className: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
    text: 'Processing',
    spin: true,
  },
  COMPLETED: {
    icon: CheckCircle2,
    className: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    text: 'Completed',
  },
  FAILED: {
    icon: XCircle,
    className: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
    text: 'Failed',
  },
};

export default function JobProgress({ status = 'PENDING' }) {
  const cfg = styles[status] || styles.PENDING;
  const Icon = cfg.icon;

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${cfg.className}`}>
      <Icon size={14} className={cfg.spin ? 'animate-spin' : ''} />
      <span>{cfg.text}</span>
    </div>
  );
}