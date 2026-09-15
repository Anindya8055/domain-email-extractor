import React, { useEffect, useRef } from 'react';
import { TerminalSquare } from 'lucide-react';

const levelMap = {
  info: 'text-slate-200',
  debug: 'text-slate-500',
  warn: 'text-amber-300',
  error: 'text-rose-300',
};

export default function LogFeed({ logs = [] }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#020817] shadow-inner shadow-cyan-950/20">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <TerminalSquare size={15} className="text-cyan-300" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Runtime feed
          </span>
        </div>
        <span className="text-xs text-slate-500">{logs.length} events</span>
      </div>

      <div className="log-container h-[480px] overflow-y-auto px-4 py-4 font-mono text-xs leading-7">
        {logs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-slate-500">
            Waiting for logs...
          </div>
        ) : (
          logs.map((log, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[82px_1fr] gap-3 border-b border-white/[0.04] py-2 last:border-b-0"
            >
              <div className="text-slate-600">
                {log?.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '--:--:--'}
              </div>
              <div className={levelMap[log?.level] || 'text-slate-200'}>
                {log?.message || 'No message'}
              </div>
            </div>
          ))
        )}
        <div ref={ref} />
      </div>
    </div>
  );
}