// client/src/pages/Settings.jsx
import React, { useEffect, useState } from 'react';
import { Save, KeyRound, Globe, ShieldAlert, Bug } from 'lucide-react';
import { getSettings, saveSettings, getSettingsDebug } from '../services/api.js';

const fields = [
  { key: 'SERPER_API_KEY', label: 'Serper API Key', placeholder: 'Enter Serper API key', icon: KeyRound },
  { key: 'SNOV_CLIENT_ID', label: 'Snov Client ID', placeholder: 'Enter Snov client id', icon: KeyRound },
  { key: 'SNOV_CLIENT_SECRET', label: 'Snov Client Secret', placeholder: 'Enter Snov client secret', icon: KeyRound },
  { key: 'MINELEAD_API_KEY', label: 'Minelead API Key', placeholder: 'Enter Minelead API key', icon: KeyRound },
  { key: 'APOLLO_API_KEY', label: 'Apollo.io API Key', placeholder: 'Enter Apollo API key', icon: KeyRound },
  { key: 'SCRAPER_API_KEY', label: 'ScraperAPI Key', placeholder: 'Enter ScraperAPI key', icon: KeyRound },
  { key: 'SEARXNG_URL', label: 'SearXNG URL', placeholder: 'http://localhost:8080', icon: Globe },
];

const EMPTY_FORM = {
  SERPER_API_KEY: '',
  SNOV_CLIENT_ID: '',
  SNOV_CLIENT_SECRET: '',
  MINELEAD_API_KEY: '',
  APOLLO_API_KEY: '',
  SCRAPER_API_KEY: '',
  SEARXNG_URL: '',
};

export default function Settings() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saved, setSaved] = useState({});
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);

  async function loadCurrentSettings() {
    try {
      const res = await getSettings();
      setSaved(res.data?.settings || {});
    } catch (err) {
      setMessage(err.message || 'Failed to load settings');
    } finally {
      setBootLoading(false);
    }
  }

  useEffect(() => {
    loadCurrentSettings();
  }, []);

  function handleChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleDebug() {
    try {
      setMessage('');
      const res = await getSettingsDebug();
      const json = res.data;
      setDebugInfo(json);
      setMessage(
        `Config path: ${json.APP_CONFIG_PATH_ENV} | Keys saved: ${json.keysInFile.join(', ') || 'none'}`
      );
    } catch (e) {
      setMessage('Debug failed: ' + e.message);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setDebugInfo(null);

    try {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => String(v).trim() !== '')
      );

      if (!Object.keys(payload).length) {
        setMessage('Enter at least one value before saving.');
        setLoading(false);
        return;
      }

      const res = await saveSettings(payload);
      setMessage(res.data?.message || 'Settings saved successfully');
      setForm(EMPTY_FORM);
      await loadCurrentSettings();
    } catch (err) {
      setMessage(err.message || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
            <ShieldAlert size={14} />
            Admin settings
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Local API Configuration</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">
            Save provider keys on this computer without editing <code>.env</code>. These values are
            stored locally for the installed desktop app.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
        {bootLoading ? (
          <div className="py-12 text-sm text-slate-400">Loading settings...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            {fields.map(({ key, label, placeholder, icon: Icon }) => {
              const isSaved = saved?.[`${key}_SET`];
              const masked = saved?.[key] || '';

              return (
                <div key={key} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <Icon size={16} className="text-cyan-300" />
                    {label}
                  </label>
                  <input
                    type={key.includes('URL') ? 'text' : 'password'}
                    value={form[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    placeholder={isSaved ? `Saved: ${masked}` : placeholder}
                    className="w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40"
                    autoComplete="off"
                  />
                  <div className="mt-2 text-xs text-slate-400">
                    {isSaved ? '✅ A value is already saved for this field.' : '⚠️ No saved value yet.'}
                  </div>
                </div>
              );
            })}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Save size={16} />
                {loading ? 'Saving...' : 'Save Settings'}
              </button>

              <button
                type="button"
                onClick={handleDebug}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-300"
              >
                <Bug size={16} />
                Test Config
              </button>

              {message ? (
                <div
                  className={`text-sm ${
                    message.includes('failed') || message.includes('Error')
                      ? 'text-red-400'
                      : 'text-slate-300'
                  }`}
                >
                  {message}
                </div>
              ) : null}
            </div>

            {debugInfo && (
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs font-mono text-slate-400">
                <div>
                  <span className="text-cyan-400">Config path:</span> {debugInfo.APP_CONFIG_PATH_ENV}
                </div>
                <div>
                  <span className="text-cyan-400">Keys in file:</span>{' '}
                  {debugInfo.keysInFile.join(', ') || 'none'}
                </div>
                <div>
                  <span className="text-cyan-400">Fallback path:</span> {debugInfo.fallbackPath}
                </div>
              </div>
            )}
          </form>
        )}
      </div>
    </section>
  );
}