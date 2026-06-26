import { getConfig } from '../configStore.js';

let _snovToken = null;
let _snovTokenExpiry = 0;
export let _snovCredsKnownBad = false;

export function resetSnovBadFlag() {
  _snovCredsKnownBad = false;
}

export async function getSnovToken(onLog, domain) {
  if (_snovToken && Date.now() < _snovTokenExpiry) return _snovToken;

  const clientId = getConfig('SNOV_CLIENT_ID');
  const clientSecret = getConfig('SNOV_CLIENT_SECRET');

  if (!clientId || !clientSecret) throw new Error('Snov.io credentials missing in config');

  onLog(`[${domain}] Snov.io: requesting access token (client_id: ****${clientId.slice(-4)})`);

  const res = await fetch('https://api.snov.io/v1/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(10000),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`Snov.io token HTTP ${res.status}: ${raw.slice(0, 200)}`);

  let json;
  try { json = JSON.parse(raw); } catch { throw new Error('Snov.io token invalid JSON'); }
  if (!json.access_token) throw new Error('Snov.io access_token missing');

  _snovToken = json.access_token;
  _snovTokenExpiry = Date.now() + (json.expires_in * 1000) - 60000;
  onLog(`[${domain}] Snov.io: token obtained, expires in ${Math.round(json.expires_in / 60)} min`);
  return _snovToken;
}

const SNOV_SKIP_PATTERNS = [
  /^staging[-.]/, /^dev[-.]/, /^stage[-.]/, /^elastic-/,
  /\.wpcomstaging\.com$/, /\.getshifter\.io$/, /\.pdqs\.mobi$/,
  /\.govdelivery\.com$/, /\.biomedia\.net$/, /\.cloudfront\.net$/,
];

async function pollResult(url, token, maxAttempts = 5, delayMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.status === 'in_progress' || json?.status === 'pending') {
      await new Promise(r => setTimeout(r, delayMs));
      continue;
    }
    return json;
  }
  return null;
}

export async function snovDomainSearch(domain, onLog) {
  const clientId = getConfig('SNOV_CLIENT_ID');
  const clientSecret = getConfig('SNOV_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    onLog(`[${domain}] Snov.io skipped: credentials not configured`);
    return [];
  }

  if (SNOV_SKIP_PATTERNS.some(p => p.test(domain))) {
    onLog(`[${domain}] Snov.io skipped: junk/staging domain pattern`);
    return [];
  }

  if (_snovCredsKnownBad) {
    onLog(`[${domain}] Snov.io skipped: previously failed auth in this session`);
    return [];
  }

  try {
    const token = await getSnovToken(onLog, domain);
    onLog(`[${domain}] Snov.io: searching domain emails...`);

    // Step 1: start domain emails search
    const startRes = await fetch(
      `https://api.snov.io/v2/domain-search/domain-emails/start?domain=${encodeURIComponent(domain)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    );

    const startRaw = await startRes.text();

    if (!startRes.ok) {
      onLog(`[${domain}] Snov.io start HTTP ${startRes.status}: ${startRaw.slice(0, 300)}`);
      if (startRes.status === 400 && startRaw.includes('ran out of credits')) {
        _snovCredsKnownBad = true;
        onLog(`[${domain}] Snov.io: OUT OF CREDITS — disabled for this session`);
      }
      if (startRes.status === 401 || startRes.status === 403) {
        _snovCredsKnownBad = true;
        onLog(`[${domain}] Snov.io: auth failed — credentials marked invalid for session`);
      }
      return [];
    }

    let startJson;
    try { startJson = JSON.parse(startRaw); } catch {
      onLog(`[${domain}] Snov.io start invalid JSON`);
      return [];
    }

    const resultUrl = startJson?.result;
    if (!resultUrl) {
      onLog(`[${domain}] Snov.io: no result URL in start response`);
      return [];
    }

    // Step 2: poll for results
    onLog(`[${domain}] Snov.io: polling for results...`);
    const resultJson = await pollResult(resultUrl, token, 6, 2000);

    if (!resultJson) {
      onLog(`[${domain}] Snov.io: polling timed out or failed`);
      return [];
    }

    const candidates = Array.isArray(resultJson?.data)
      ? resultJson.data
      : Array.isArray(resultJson?.emails)
      ? resultJson.emails
      : [];

    const emails = candidates
      .map(item => typeof item === 'string' ? item : item?.email)
      .filter(Boolean)
      .map(e => e.toLowerCase().trim());

    onLog(`[${domain}] Snov.io: ${emails.length} emails`);
    return emails;
  } catch (e) {
    if (e.message?.includes('401') || e.message?.includes('credentials')) {
      _snovCredsKnownBad = true;
    }
    onLog(`[${domain}] Snov.io error: ${e.message}`);
    return [];
  }
}