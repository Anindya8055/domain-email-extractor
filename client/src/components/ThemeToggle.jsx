import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark((v) => !v)}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
    >
      {dark ? <Sun size={17} className="text-amber-300" /> : <Moon size={17} className="text-cyan-300" />}
    </button>
  );
}