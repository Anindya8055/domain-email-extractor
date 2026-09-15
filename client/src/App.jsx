// client/src/App.jsx
import React, { useState } from 'react';
import {
  Globe2,
  ShieldCheck,
  Zap,
  Database,
  Settings as SettingsIcon,
  Home as HomeIcon,
} from 'lucide-react';
import ThemeToggle from './components/ThemeToggle.jsx';
import HomePage from './pages/Home.jsx';
import Settings from './pages/Settings.jsx';

function TopPill({ icon: Icon, text }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-md">
      <Icon size={14} className="text-cyan-300" />
      <span>{text}</span>
    </div>
  );
}

function NavButton({ active, icon: Icon, text, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm transition ${
        active
          ? 'bg-cyan-400 text-slate-950'
          : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
      }`}
    >
      <Icon size={16} />
      <span>{text}</span>
    </button>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState('home');

  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100 selection:bg-cyan-500/30">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.10),_transparent_24%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.08),_transparent_24%)]" />
        <div className="absolute left-1/2 top-0 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07111f]/75 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/20 to-blue-500/10 shadow-[0_0_30px_rgba(34,211,238,0.12)]">
              <Globe2 size={18} className="text-cyan-300" />
            </div>

            <div>
              <div className="text-sm font-semibold tracking-wide text-white">
                Domain Email Extractor
              </div>
              <div className="text-xs text-slate-400">Crawl · Enrich · Export</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <NavButton
              active={activePage === 'home'}
              icon={HomeIcon}
              text="Home"
              onClick={() => setActivePage('home')}
            />
            <NavButton
              active={activePage === 'settings'}
              icon={SettingsIcon}
              text="Settings"
              onClick={() => setActivePage('settings')}
            />
            <TopPill icon={ShieldCheck} text="Protected jobs" />
            <TopPill icon={Zap} text="Playwright engine" />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {activePage === 'home' ? (
        <>
          <section className="relative border-b border-white/10">
            <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:px-6 lg:grid-cols-[1.25fr_0.75fr] lg:py-16">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-200">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                  Built for bulk domain prospecting
                </div>

                <h1 className="max-w-4xl text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">
                  Extract business emails from uploaded domain lists with a cleaner, faster workflow.
                </h1>

                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                  Upload Excel or CSV files, monitor live progress, inspect crawl logs, preview
                  extracted emails, and export the final workbook after processing.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <TopPill icon={Database} text="Excel + CSV ready" />
                  <TopPill icon={Globe2} text="Contact/About page discovery" />
                  <TopPill icon={Zap} text="Live progress + logs" />
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Pipeline Snapshot</div>
                    <div className="text-xs text-slate-400">What the engine does automatically</div>
                  </div>
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                    Live-ready
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    ['1', 'Upload domains', 'Excel or CSV input with one or many rows.'],
                    ['2', 'Discover pages', 'Homepage, contact, about, team, legal, footer paths.'],
                    ['3', 'Extract emails', 'Deduplicate addresses and keep row-level results clean.'],
                    ['4', 'Export workbook', 'Download the processed file when the job completes.'],
                  ].map(([step, title, text]) => (
                    <div
                      key={step}
                      className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cyan-400/15 text-sm font-semibold text-cyan-300">
                          {step}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">{title}</div>
                          <div className="mt-1 text-xs leading-6 text-slate-400">{text}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <main className="relative z-10">
            <HomePage />
          </main>
        </>
      ) : (
        <main className="relative z-10">
          <Settings />
        </main>
      )}
    </div>
  );
}