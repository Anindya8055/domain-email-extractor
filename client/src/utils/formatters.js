export const statusColor = (status) => {
  switch (status) {
    case 'SUCCESS':
      return 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200';
    case 'BLOCKED':
      return 'border border-amber-400/20 bg-amber-400/10 text-amber-200';
    case 'NO_EMAILS':
      return 'border border-sky-400/20 bg-sky-400/10 text-sky-200';
    case 'ERROR':
      return 'border border-rose-400/20 bg-rose-400/10 text-rose-200';
    case 'PROCESSING':
      return 'border border-cyan-400/20 bg-cyan-400/10 text-cyan-200';
    default:
      return 'border border-white/10 bg-white/5 text-slate-300';
  }
};

export const methodBadge = (method) => {
  switch (method) {
    case 'PLAYWRIGHT':
      return 'border border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200';
    case 'HTTP':
      return 'border border-cyan-400/20 bg-cyan-400/10 text-cyan-200';
    default:
      return 'border border-white/10 bg-white/5 text-slate-300';
  }
};