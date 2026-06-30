/**
 * domainScraper.js
 * Fast path: HTTP → SERP → Snov → Minelead → Apollo
 * Deep path: CommonCrawl → Wayback → Bing → Playwright → ScraperAPI → WHOIS → Pattern
 */

import fs from 'fs';
import https from 'https';
import http from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { extractEmailsFromHtml } from './emailExtractor.js';
import { filterAndDeduplicateEmails } from '../utils/emailValidator.js';
import { getRandomUserAgent } from './userAgents.js';
import { logger } from '../utils/logger.js';
import { getConfig } from '../configStore.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import net from 'net';
import dns from 'dns/promises';

const execAsync = promisify(exec);

const DEEP_MODE_ENABLED = true;
const DOMAIN_TOTAL_BUDGET_MS = 120000;
const DOMAIN_EMERGENCY_TIMEOUT_MS = 150000;

const STEP_MIN_BUDGETS = {
  HTTP: 8000,
  GOOGLE_SERP: 10000,
  SNOV_IO: 20000,   // increased: async poll needs extra time
  MINELEAD: 10000,
  APOLLO: 12000,
  COMMON_CRAWL: 15000,
  WAYBACK_MACHINE: 12000,
  BING_CACHE: 8000,
  PLAYWRIGHT: 15000,
  SCRAPER_API: 25000,
  WHOIS: 8000,
  PATTERN_SMTP: 15000,
};

const INTERNAL_PATHS = [
  '/contact', '/contact-us', '/about', '/about-us',
  '/support', '/team', '/company', '/staff',
  '/help', '/reach-us', '/get-in-touch',
];

const BLOCKED_SIGNALS = [
  'cf-browser-verification', 'just a moment', 'ddos protection',
  'enable javascript and cookies', 'captcha',
  'access denied', 'challenge-platform', 'checking your browser',
  'please wait while we check your browser', 'cf_chl_opt',
  'ray id', '_cf_chl_', 'cloudflare',
];

const SKIP_DOMAINS = [
  'owler.com', 'crunchbase.com', 'linkedin.com', 'facebook.com',
  'twitter.com', 'instagram.com', 'youtube.com', 'wikipedia.org',
  'contactout.com', 'finalscout.com', 'getprospect.com', 'hunter.io',
  'apollo.io', 'snov.io', 'datanyze.com', 'zoominfo.com',
  'siteprice.org', 'sitelike.org', 'incrawler.com', 'similarweb.com',
  'scam-detector.com', 'manta.com', 'yelp.com', 'yell.com',
  'thomsonlocal.com', 'cylex.co.uk', '118businessdirectory.co.uk',
  'uk.ezilon.com', 'britishbusinessdirectory.com', 'gmpdirectory.com',
  'businessdirectory.name', 'sawebdirectory.com',
  'vuink.com', 'ratelivo.com', 'madblogz.com', 'papasearch.net',
];

const PLAYWRIGHT_SKIP_PATTERNS = [
  /\.hrmdirect\.com$/,
  /\.squarespace\.com$/,
  /\.substack\.com$/,
  /\.beehiiv\.com$/,
  /\.wpenginepowered\.com$/,
  /\.cloudfront\.net$/,
  /\.arcpublishing\.com$/,
  /\.arc-cdn\.net$/,
  /\.ghost\.io$/,
  /\.webflow\.io$/,
  /\.hubspotpagebuilder\.com$/,
  /\.wordpress\.com$/,
  /\.medium\.com$/,
  /\.typepad\.com$/,
  /\.sites\.google\.com$/,
  /^blog\./, /^careers\./, /^staging\./, /^dev\./,
  /^stage\./, /^cdn\./, /^assets\./, /^static\./,
];

const SNOV_SKIP_PATTERNS = [
  /^staging[-.]/, /^dev[-.]/, /^stage[-.]/, /^elastic-/,
  /\.wpcomstaging\.com$/, /\.getshifter\.io$/, /\.pdqs\.mobi$/,
  /\.govdelivery\.com$/, /\.biomedia\.net$/, /\.cloudfront\.net$/,
];

function shouldSkipPlaywright(domain) {
  return PLAYWRIGHT_SKIP_PATTERNS.some(p => p.test(domain));
}

function isBlockedResponse(html, status) {
  if (status === 403 || status === 429 || status === 503) return true;
  if (!html || html.length < 200) return false;
  const lower = html.toLowerCase();
  return BLOCKED_SIGNALS.some(s => lower.includes(s));
}

function discoverInternalLinks(html, baseUrl) {
  const found = new Set();
  const re = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const u = new URL(m[1], baseUrl);
      if (u.hostname !== new URL(baseUrl).hostname) continue;
      const p = u.pathname.toLowerCase().replace(/\/$/, '');
      if (INTERNAL_PATHS.some(ip => p === ip || p.startsWith(ip + '/'))) {
        u.hash = '';
        u.search = '';
        found.add(u.toString());
      }
    } catch {}
  }
  return Array.from(found).slice(0, 4);
}

function createBudget(domain, onLog, totalMs = DOMAIN_TOTAL_BUDGET_MS) {
  const startedAt = Date.now();
  const deadline = startedAt + totalMs;
  return {
    domain, startedAt, deadline,
    remaining() { return Math.max(0, deadline - Date.now()); },
    has(minMs = 0) { return this.remaining() >= minMs; },
    require(stepName, minMs) {
      const left = this.remaining();
      if (left < minMs) {
        onLog(`[${domain}] ⏭ Skipping ${stepName} — only ${left}ms left (need ${minMs}ms)`);
        return false;
      }
      return true;
    },
  };
}

function buildBudgetExhaustedResult() {
  return { emails: [], status: 'BLOCKED', method: 'ALL', error: `Time budget exhausted after ${DOMAIN_TOTAL_BUDGET_MS}ms` };
}

async function fetchHttp(url, timeout = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });
    clearTimeout(t);
    const html = await res.text();
    return { html, status: res.status };
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

async function fetchHttpWithProxy(url, timeout = 10000) {
  const proxyUrl = getConfig('WEBSHARE_PROXY_URL');
  if (!proxyUrl) return null;
  const agent = new HttpsProxyAgent(proxyUrl);
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const protocol = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      agent,
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    };
    const timer = setTimeout(() => { req.destroy(); reject(new Error('Proxy request timeout')); }, timeout);
    const req = protocol.request(options, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location) {
        clearTimeout(timer);
        fetchHttpWithProxy(res.headers.location, timeout).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => { clearTimeout(timer); resolve({ html: data, status: res.statusCode }); });
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    req.end();
  });
}

async function fetchPlaywright(browser, url, timeout = 10000, proxyUrl = null) {
  const ctxOptions = {
    userAgent: getRandomUserAgent(),
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  };
  if (proxyUrl) {
    const parsed = new URL(proxyUrl);
    ctxOptions.proxy = {
      server: `${parsed.protocol}//${parsed.host}`,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
    };
  }
  const ctx = await browser.newContext(ctxOptions);
  const page = await ctx.newPage();
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'media', 'font', 'stylesheet'].includes(type)) route.abort();
    else route.continue();
  });
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    const status = resp?.status() || 0;
    await page.waitForTimeout(1000);
    const html = await page.content();
    const mailtoEmails = await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="mailto:"]')]
        .map(a => a.href.replace('mailto:', '').split('?')[0].trim().toLowerCase())
        .filter(e => e.includes('@'))
    ).catch(() => []);
    return { html, status, mailtoEmails };
  } finally {
    await page.close();
    await ctx.close();
  }
}

async function fetchWaybackMachine(domain, onLog) {
  try {
    const res = await fetch(`https://archive.org/wayback/available?url=${domain}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    const snapshotUrl = json?.archived_snapshots?.closest?.url;
    if (!snapshotUrl) { onLog(`[${domain}] Wayback: no snapshot`); return null; }
    onLog(`[${domain}] Trying Wayback snapshot...`);
    const result = await fetchHttp(snapshotUrl, 10000);
    if (result.html && result.status === 200 && result.html.length > 500) {
      onLog(`[${domain}] ✅ Wayback hit`);
      return result.html;
    }
  } catch (e) { onLog(`[${domain}] Wayback error: ${e.message}`); }
  return null;
}

async function fetchBingCache(domain, onLog) {
  try {
    const url = `https://cc.bingj.com/cache.aspx?q=${domain}&url=https://${domain}`;
    const result = await fetchHttp(url, 7000);
    if (result.html && result.status === 200 && !isBlockedResponse(result.html, result.status)) {
      onLog(`[${domain}] ✅ Bing cache hit`);
      return result.html;
    }
  } catch {}
  return null;
}

async function fetchWithScraperAPI(url, domain, onLog) {
  const apiKey = getConfig('SCRAPER_API_KEY');
  if (!apiKey) return null;
  try {
    const scraperUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}&render=true`;
    onLog(`[${domain}] Sending to ScraperAPI...`);
    const result = await fetchHttp(scraperUrl, 45000);
    if (result.html && result.status === 200 && !isBlockedResponse(result.html, result.status) && result.html.length > 500) {
      onLog(`[${domain}] ✅ ScraperAPI success`);
      return result.html;
    }
  } catch (e) { onLog(`[${domain}] ScraperAPI error: ${e.message}`); }
  return null;
}

async function getWhoisEmails(domain) {
  try {
    const { stdout } = await execAsync(`whois ${domain}`, { timeout: 8000 });
    const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}/g;
    const found = [...new Set((stdout.match(emailRe) || []).map(e => e.toLowerCase()))];
    return found.filter(e =>
      !e.includes('whois') && !e.includes('iana') && !e.includes('abuse') &&
      !e.includes('noreply') && !e.includes('privacy') && !e.includes('redacted')
    );
  } catch { return []; }
}

// ─── Snov.io (fixed: async two-step API) ────────────────────────────────────

let _snovToken = null;
let _snovTokenExpiry = 0;
let _snovCredsKnownBad = false;

async function getSnovToken(onLog, domain) {
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
  if (!res.ok) {
    _snovToken = null;
    _snovTokenExpiry = 0;
    throw new Error(`Snov.io token HTTP ${res.status}: ${raw.slice(0, 200)}`);
  }

  let json;
  try { json = JSON.parse(raw); } catch { throw new Error('Snov.io token invalid JSON'); }
  if (!json.access_token) throw new Error('Snov.io access_token missing');

  _snovToken = json.access_token;
  _snovTokenExpiry = Date.now() + (json.expires_in * 1000) - 60000;
  onLog(`[${domain}] Snov.io: token obtained, expires in ${Math.round(json.expires_in / 60)} min`);
  return _snovToken;
}

async function snovPollResult(resultUrl, token, maxAttempts = 6, delayMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(resultUrl, {
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
    } catch { return null; }
  }
  return null;
}

async function snovDomainSearch(domain, onLog) {
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

    // Step 1: start search
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
        onLog(`[${domain}] Snov.io: auth failed — credentials marked invalid`);
      }
      return [];
    }

    let startJson;
    try { startJson = JSON.parse(startRaw); } catch {
      onLog(`[${domain}] Snov.io: invalid JSON in start response`);
      return [];
    }

    const resultUrl = startJson?.result;
    if (!resultUrl) {
      onLog(`[${domain}] Snov.io: no result URL — response: ${startRaw.slice(0, 200)}`);
      return [];
    }

    // Step 2: poll
    onLog(`[${domain}] Snov.io: polling for results...`);
    const resultJson = await snovPollResult(resultUrl, token, 6, 2000);

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

// ─── Google SERP ─────────────────────────────────────────────────────────────

async function googleSerpEmailSearch(domain, onLog) {
  const serperKey = getConfig('SERPER_API_KEY');
  if (!serperKey) { onLog(`[${domain}] Google SERP skipped: SERPER_API_KEY missing`); return []; }

  try {
    const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}/g;
    const emails = new Set();
    const queries = [`site:${domain} contact email`, `site:${domain} "@${domain}"`];
    onLog(`[${domain}] Google SERP key loaded: ****${serperKey.slice(-4)}`);

    for (const q of queries) {
      onLog(`[${domain}] Google SERP query: ${q}`);
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, num: 10 }),
        signal: AbortSignal.timeout(10000),
      });
      const rawText = await res.text();
      if (!res.ok) {
        onLog(`[${domain}] Google SERP HTTP ${res.status}: ${rawText.slice(0, 300)}`);
        if (res.status === 400 && rawText.includes('not allowed for free accounts')) break;
        continue;
      }
      let json;
      try { json = JSON.parse(rawText); } catch { continue; }
      const text = JSON.stringify(json?.organic || []);
      (text.match(emailRe) || [])
        .filter(e => e.toLowerCase().includes(domain.toLowerCase()))
        .forEach(e => emails.add(e.toLowerCase()));
      if (emails.size > 0) break;
    }

    const result = [...emails];
    onLog(`[${domain}] Google SERP: ${result.length} emails`);
    return result;
  } catch (e) {
    onLog(`[${domain}] Google SERP error: ${e.message}`);
    return [];
  }
}

// ─── Minelead ─────────────────────────────────────────────────────────────────

async function mineleadDomainSearch(domain, onLog) {
  const mineleadKey = getConfig('MINELEAD_API_KEY');
  if (!mineleadKey) { onLog(`[${domain}] Minelead skipped: MINELEAD_API_KEY missing`); return []; }

  try {
    const url = `https://api.minelead.io/v1/search/?key=${encodeURIComponent(mineleadKey)}&domain=${encodeURIComponent(domain)}`;
    onLog(`[${domain}] Minelead request: ${url.replace(mineleadKey, '****')}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const raw = await res.text();
    if (!res.ok) { onLog(`[${domain}] Minelead HTTP ${res.status}: ${raw.slice(0, 200)}`); return []; }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      onLog(`[${domain}] Minelead unexpected content-type (${contentType}) — skipping`);
      return [];
    }
    let json;
    try { json = JSON.parse(raw); } catch { onLog(`[${domain}] Minelead invalid JSON`); return []; }
    const candidates = Array.isArray(json?.data) ? json.data
      : Array.isArray(json?.emails) ? json.emails
      : Array.isArray(json) ? json : [];
    const emails = candidates
      .map(item => typeof item === 'string' ? item : item?.email)
      .filter(Boolean).map(e => e.toLowerCase().trim());
    onLog(`[${domain}] Minelead: ${emails.length} emails`);
    return emails;
  } catch (e) { onLog(`[${domain}] Minelead error: ${e.message}`); return []; }
}

// ─── Apollo ───────────────────────────────────────────────────────────────────

async function apolloDomainSearch(domain, onLog) {
  const apiKey = getConfig('APOLLO_API_KEY');
  if (!apiKey) { onLog(`[${domain}] Apollo skipped: APOLLO_API_KEY missing`); return []; }

  const emails = new Set();

  try {
    onLog(`[${domain}] Apollo: searching organization by domain...`);

    // Organization search
    const orgRes = await fetch('https://api.apollo.io/v1/organizations/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({ q_organization_domains: domain, page: 1, per_page: 10 }),
      signal: AbortSignal.timeout(12000),
    });
    if (orgRes.ok) {
      const orgJson = await orgRes.json().catch(() => null);
      (orgJson?.organizations || []).forEach(org => {
        if (org?.contact_email) emails.add(org.contact_email.toLowerCase().trim());
      });
    } else {
      const errText = await orgRes.text();
      onLog(`[${domain}] Apollo org search HTTP ${orgRes.status}: ${errText.slice(0, 200)}`);
    }

    // People search by domain
    onLog(`[${domain}] Apollo: searching people by domain...`);
    const peopleRes = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({ q_organization_domains: domain, page: 1, per_page: 10 }),
      signal: AbortSignal.timeout(12000),
    });
    if (peopleRes.ok) {
      const peopleJson = await peopleRes.json().catch(() => null);
      (peopleJson?.people || []).forEach(p => {
        if (p?.email) emails.add(p.email.toLowerCase().trim());
      });
    } else {
      const errText = await peopleRes.text();
      onLog(`[${domain}] Apollo people search HTTP ${peopleRes.status}: ${errText.slice(0, 200)}`);
    }

    const result = [...emails].filter(e => e.includes('@'));
    onLog(`[${domain}] Apollo: ${result.length} emails`);
    return result;
  } catch (e) {
    onLog(`[${domain}] Apollo error: ${e.message}`);
    return [];
  }
}

// ─── Common Crawl ─────────────────────────────────────────────────────────────

async function commonCrawlSearch(domain, onLog) {
  try {
    onLog(`[${domain}] Querying Common Crawl index...`);
    const indexes = ['CC-MAIN-2025-13', 'CC-MAIN-2024-51'];
    let records = [];
    for (const index of indexes) {
      const indexUrl =
        `https://index.commoncrawl.org/${index}-index` +
        `?url=${encodeURIComponent(domain + '/*')}&output=json&limit=5&filter=status:200`;
      try {
        const indexRes = await fetch(indexUrl, { signal: AbortSignal.timeout(12000) });
        if (!indexRes.ok) continue;
        const text = await indexRes.text();
        records = text.trim().split('\n')
          .map(l => { try { return JSON.parse(l); } catch { return null; } })
          .filter(Boolean);
        if (records.length) break;
      } catch { continue; }
    }
    if (!records.length) { onLog(`[${domain}] Common Crawl: no records`); return []; }

    const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}/g;
    const emails = new Set();
    await Promise.allSettled(records.slice(0, 3).map(async record => {
      try {
        const s3Url = `https://data.commoncrawl.org/${record.filename}`;
        const start = parseInt(record.offset, 10);
        const end = start + parseInt(record.length, 10) - 1;
        const r = await fetch(s3Url, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(15000) });
        if (!r.ok) return;
        const buffer = await r.arrayBuffer();
        const raw = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
        (raw.match(emailRe) || []).forEach(e => emails.add(e.toLowerCase()));
      } catch {}
    }));

    const cleaned = [...emails].filter(e =>
      !e.includes('example.') && !e.includes('test@') && !e.includes('@w3.org') &&
      !e.includes('@schema.org') && !e.includes('sentry.io') && !e.includes('@2x') &&
      !e.includes('noreply') && !e.includes('no-reply') && e.split('@')[1]?.includes('.')
    );
    onLog(`[${domain}] Common Crawl: ${cleaned.length} emails`);
    return cleaned;
  } catch (err) { onLog(`[${domain}] Common Crawl error: ${err.message}`); return []; }
}

// ─── SMTP ─────────────────────────────────────────────────────────────────────

async function smtpVerifyEmail(email, timeoutMs = 6000) {
  const domain = email.split('@')[1];
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords?.length) return false;
    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHost = mxRecords[0].exchange;
    return await new Promise((resolve) => {
      let resolved = false; let stage = 0; let buffer = '';
      const done = (result) => {
        if (!resolved) { resolved = true; clearTimeout(timer); socket.destroy(); resolve(result); }
      };
      const timer = setTimeout(() => done(false), timeoutMs);
      const socket = net.createConnection(25, mxHost);
      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\r\n'); buffer = lines.pop();
        for (const line of lines) {
          if (stage === 0 && line.startsWith('220')) { socket.write('EHLO verify.local\r\n'); stage = 1; }
          else if (stage === 1 && line.startsWith('250') && !line.startsWith('250-')) { socket.write('MAIL FROM:<verify@verify.local>\r\n'); stage = 2; }
          else if (stage === 2 && line.startsWith('250')) { socket.write(`RCPT TO:<${email}>\r\n`); stage = 3; }
          else if (stage === 3) { done(line.startsWith('250') || line.startsWith('251')); }
        }
      });
      socket.on('error', () => done(false));
      socket.on('timeout', () => done(false));
      socket.setTimeout(timeoutMs);
    });
  } catch { return false; }
}

async function emailPatternGuesser(domain, onLog, budget) {
  try {
    let mxRecords;
    try {
      mxRecords = await dns.resolveMx(domain);
      if (!mxRecords?.length) { onLog(`[${domain}] No MX — skipping pattern guesser`); return []; }
    } catch { onLog(`[${domain}] MX lookup failed — skipping pattern guesser`); return []; }

    const fakeEmail = `xqz_nonexistent_9k2@${domain}`;
    const isCatchAll = await smtpVerifyEmail(fakeEmail, 4000);
    if (isCatchAll) { onLog(`[${domain}] Catch-all detected — skipping pattern guesser`); return []; }

    const patterns = ['info', 'contact', 'hello', 'support', 'sales', 'admin', 'enquiries', 'office'];
    const verified = [];
    onLog(`[${domain}] Pattern guesser: SMTP-verifying up to ${patterns.length} candidates...`);

    for (const p of patterns) {
      if (!budget.has(2500)) { onLog(`[${domain}] Pattern guesser: stopping early — low remaining time`); break; }
      const email = `${p}@${domain}`;
      const exists = await smtpVerifyEmail(email, 4000);
      if (exists) { verified.push(email); onLog(`[${domain}] ✅ SMTP verified: ${email}`); }
      await new Promise(r => setTimeout(r, 250));
    }

    onLog(`[${domain}] Pattern guesser: ${verified.length}/${patterns.length} verified`);
    return verified;
  } catch (e) { onLog(`[${domain}] Pattern guesser error: ${e.message}`); return []; }
}

// ─── Crawlers ─────────────────────────────────────────────────────────────────

async function httpCrawlWithInternals(domain, onLog) {
  const base = `https://${domain}`;
  const allEmails = new Set();
  try {
    const r = await fetchHttp(base, 7000);
    if (!isBlockedResponse(r.html, r.status) && r.html.length > 500) {
      extractEmailsFromHtml(r.html).forEach(e => allEmails.add(e));
      const urls = [...new Set([...discoverInternalLinks(r.html, base), ...INTERNAL_PATHS.map(p => `${base}${p}`)])].slice(0, 6);
      const pages = await Promise.allSettled(urls.map(u => fetchHttp(u, 4000).then(x => !isBlockedResponse(x.html, x.status) ? x.html : null).catch(() => null)));
      pages.forEach(p => p.status === 'fulfilled' && p.value && extractEmailsFromHtml(p.value).forEach(e => allEmails.add(e)));
      return { emails: [...allEmails], wasReachable: true };
    }

    // Blocked — retry with Webshare proxy if configured
    const proxyUrl = getConfig('WEBSHARE_PROXY_URL');
    if (proxyUrl) {
      onLog(`[${domain}] HTTP blocked — retrying with Webshare proxy...`);
      try {
        const rp = await fetchHttpWithProxy(base, 10000);
        if (rp && !isBlockedResponse(rp.html, rp.status) && rp.html.length > 500) {
          onLog(`[${domain}] ✅ HTTP proxy: bypassed block`);
          extractEmailsFromHtml(rp.html).forEach(e => allEmails.add(e));
          const urls = [...new Set([...discoverInternalLinks(rp.html, base), ...INTERNAL_PATHS.map(p => `${base}${p}`)])].slice(0, 6);
          const pages = await Promise.allSettled(urls.map(u =>
            fetchHttpWithProxy(u, 5000).then(x => x && !isBlockedResponse(x.html, x.status) ? x.html : null).catch(() => null)
          ));
          pages.forEach(p => p.status === 'fulfilled' && p.value && extractEmailsFromHtml(p.value).forEach(e => allEmails.add(e)));
          return { emails: [...allEmails], wasReachable: true };
        }
      } catch (e) { onLog(`[${domain}] HTTP proxy error: ${e.message}`); }
    }

    return { emails: [], wasReachable: false };
  } catch { return { emails: [], wasReachable: false }; }
}

async function playwrightCrawlWithInternals(domain, browser, onLog, proxyUrl = null) {
  const base = `https://${domain}`;
  const allEmails = new Set();
  try {
    const r = await fetchPlaywright(browser, base, 10000, proxyUrl);
    if (!isBlockedResponse(r.html, r.status) && r.html.length > 500) {
      extractEmailsFromHtml(r.html).forEach(e => allEmails.add(e));
      (r.mailtoEmails || []).forEach(e => allEmails.add(e));
      const urls = [...new Set([...discoverInternalLinks(r.html, base), ...INTERNAL_PATHS.map(p => `${base}${p}`)])].slice(0, 3);
      const pages = await Promise.allSettled(urls.map(u =>
        fetchPlaywright(browser, u, 6000, proxyUrl).then(x => { (x.mailtoEmails || []).forEach(e => allEmails.add(e)); return !isBlockedResponse(x.html, x.status) ? x.html : null; }).catch(() => null)
      ));
      pages.forEach(p => p.status === 'fulfilled' && p.value && extractEmailsFromHtml(p.value).forEach(e => allEmails.add(e)));
      return { emails: [...allEmails], wasReachable: true };
    }
    return { emails: [], wasReachable: false };
  } catch { return { emails: [], wasReachable: false }; }
}

// ─── Main scraper ─────────────────────────────────────────────────────────────

async function _scrapeDomain(domain, browser, onLog) {
  const budget = createBudget(domain, onLog, DOMAIN_TOTAL_BUDGET_MS);

  if (SKIP_DOMAINS.some(skip => domain === skip || domain.endsWith('.' + skip))) {
    onLog(`[${domain}] ⏭ Skipped — known directory/aggregator`);
    return { emails: [], status: 'NO_EMAILS', method: 'SKIPPED', error: null };
  }

  const base = `https://${domain}`;
  onLog(`[${domain}] Starting...`);

  if (!budget.require('HTTP', STEP_MIN_BUDGETS.HTTP)) return buildBudgetExhaustedResult();

  {
    const { emails: raw, wasReachable } = await httpCrawlWithInternals(domain, onLog);
    const emails = filterAndDeduplicateEmails(raw);
    if (emails.length > 0) { onLog(`[${domain}] ✅ HTTP: ${emails.length} emails`); return { emails, status: 'SUCCESS', method: 'HTTP', error: null }; }
    if (wasReachable) onLog(`[${domain}] HTTP: reachable but no emails — continuing...`);
    else onLog(`[${domain}] HTTP: unreachable or blocked — continuing...`);
  }

  if (getConfig('SERPER_API_KEY') && budget.require('GOOGLE_SERP', STEP_MIN_BUDGETS.GOOGLE_SERP)) {
    onLog(`[${domain}] Trying Google SERP...`);
    const serpEmails = filterAndDeduplicateEmails(await googleSerpEmailSearch(domain, onLog));
    if (serpEmails.length > 0) { onLog(`[${domain}] ✅ Google SERP: ${serpEmails.length} emails`); return { emails: serpEmails, status: 'SUCCESS', method: 'GOOGLE_SERP', error: null }; }
    onLog(`[${domain}] Google SERP completed with no emails`);
  }

  if (getConfig('SNOV_CLIENT_ID') && getConfig('SNOV_CLIENT_SECRET') && budget.require('SNOV_IO', STEP_MIN_BUDGETS.SNOV_IO)) {
    onLog(`[${domain}] Trying Snov.io...`);
    const snovEmails = filterAndDeduplicateEmails(await snovDomainSearch(domain, onLog));
    if (snovEmails.length > 0) { onLog(`[${domain}] ✅ Snov.io: ${snovEmails.length} emails`); return { emails: snovEmails, status: 'SUCCESS', method: 'SNOV_IO', error: null }; }
  }

  if (getConfig('MINELEAD_API_KEY') && budget.require('MINELEAD', STEP_MIN_BUDGETS.MINELEAD)) {
    onLog(`[${domain}] Trying Minelead...`);
    const mlEmails = filterAndDeduplicateEmails(await mineleadDomainSearch(domain, onLog));
    if (mlEmails.length > 0) { onLog(`[${domain}] ✅ Minelead: ${mlEmails.length} emails`); return { emails: mlEmails, status: 'SUCCESS', method: 'MINELEAD', error: null }; }
  }

  if (getConfig('APOLLO_API_KEY') && budget.require('APOLLO', STEP_MIN_BUDGETS.APOLLO)) {
    onLog(`[${domain}] Trying Apollo...`);
    const apolloEmails = filterAndDeduplicateEmails(await apolloDomainSearch(domain, onLog));
    if (apolloEmails.length > 0) { onLog(`[${domain}] ✅ Apollo: ${apolloEmails.length} emails`); return { emails: apolloEmails, status: 'SUCCESS', method: 'APOLLO', error: null }; }
  }

  if (!DEEP_MODE_ENABLED) {
    onLog(`[${domain}] ❌ No emails found (fast mode)`);
    return { emails: [], status: 'BLOCKED', method: 'FAST_ONLY', error: 'Fast methods exhausted' };
  }

  if (budget.require('COMMON_CRAWL', STEP_MIN_BUDGETS.COMMON_CRAWL)) {
    onLog(`[${domain}] Trying Common Crawl...`);
    const ccEmails = filterAndDeduplicateEmails(await commonCrawlSearch(domain, onLog));
    if (ccEmails.length > 0) { onLog(`[${domain}] ✅ Common Crawl: ${ccEmails.length} emails`); return { emails: ccEmails, status: 'SUCCESS', method: 'COMMON_CRAWL', error: null }; }
  }

  if (budget.require('WAYBACK_MACHINE', STEP_MIN_BUDGETS.WAYBACK_MACHINE)) {
    onLog(`[${domain}] Trying Wayback Machine...`);
    const waybackHtml = await fetchWaybackMachine(domain, onLog);
    if (waybackHtml) {
      const allEmails = new Set();
      extractEmailsFromHtml(waybackHtml).forEach(e => allEmails.add(e));
      const links = [...new Set([...discoverInternalLinks(waybackHtml, base), ...INTERNAL_PATHS.map(p => `${base}${p}`)])].slice(0, 4);
      const pages = await Promise.allSettled(links.map(u => fetchHttp(u, 4000).then(r => !isBlockedResponse(r.html, r.status) ? r.html : null).catch(() => null)));
      pages.forEach(p => p.status === 'fulfilled' && p.value && extractEmailsFromHtml(p.value).forEach(e => allEmails.add(e)));
      const emails = filterAndDeduplicateEmails([...allEmails]);
      if (emails.length > 0) { onLog(`[${domain}] ✅ Wayback: ${emails.length} emails`); return { emails, status: 'SUCCESS', method: 'WAYBACK_MACHINE', error: null }; }
    }
    onLog(`[${domain}] Wayback: no emails found`);
  }

  if (budget.require('BING_CACHE', STEP_MIN_BUDGETS.BING_CACHE)) {
    onLog(`[${domain}] Trying Bing Cache...`);
    const bingHtml = await fetchBingCache(domain, onLog);
    if (bingHtml) {
      const allEmails = new Set();
      extractEmailsFromHtml(bingHtml).forEach(e => allEmails.add(e));
      const links = [...new Set([...discoverInternalLinks(bingHtml, base), ...INTERNAL_PATHS.map(p => `${base}${p}`)])].slice(0, 4);
      const pages = await Promise.allSettled(links.map(u => fetchHttp(u, 4000).then(r => !isBlockedResponse(r.html, r.status) ? r.html : null).catch(() => null)));
      pages.forEach(p => p.status === 'fulfilled' && p.value && extractEmailsFromHtml(p.value).forEach(e => allEmails.add(e)));
      const emails = filterAndDeduplicateEmails([...allEmails]);
      if (emails.length > 0) { onLog(`[${domain}] ✅ Bing Cache: ${emails.length} emails`); return { emails, status: 'SUCCESS', method: 'BING_CACHE', error: null }; }
    }
    onLog(`[${domain}] Bing Cache: no emails found`);
  }

  if (shouldSkipPlaywright(domain)) {
    onLog(`[${domain}] ⏭ Playwright skipped — subdomain/platform pattern matched`);
  } else if (!browser) {
    onLog(`[${domain}] ⏭ Playwright skipped — browser not available on this machine`);
  } else if (budget.require('PLAYWRIGHT', STEP_MIN_BUDGETS.PLAYWRIGHT)) {
    onLog(`[${domain}] Trying Playwright...`);
    try {
      const { emails: raw, wasReachable } = await playwrightCrawlWithInternals(domain, browser, onLog);
      const emails = filterAndDeduplicateEmails(raw);
      if (emails.length > 0) { onLog(`[${domain}] ✅ Playwright: ${emails.length} emails`); return { emails, status: 'SUCCESS', method: 'PLAYWRIGHT', error: null }; }
      if (wasReachable) {
        onLog(`[${domain}] Playwright: reachable but no emails — continuing...`);
      } else {
        onLog(`[${domain}] Playwright: blocked — retrying with Webshare proxy...`);
        const proxyUrl = getConfig('WEBSHARE_PROXY_URL');
        if (proxyUrl && budget.has(STEP_MIN_BUDGETS.PLAYWRIGHT)) {
          try {
            const { emails: proxyRaw, wasReachable: proxyReachable } = await playwrightCrawlWithInternals(domain, browser, onLog, proxyUrl);
            const proxyEmails = filterAndDeduplicateEmails(proxyRaw);
            if (proxyEmails.length > 0) { onLog(`[${domain}] ✅ Playwright+Proxy: ${proxyEmails.length} emails`); return { emails: proxyEmails, status: 'SUCCESS', method: 'PLAYWRIGHT_PROXY', error: null }; }
            onLog(`[${domain}] Playwright+Proxy: ${proxyReachable ? 'no emails found' : 'still blocked'} — continuing...`);
          } catch (e) { onLog(`[${domain}] Playwright+Proxy error: ${e.message}`); }
        }
      }
    } catch (e) { onLog(`[${domain}] Playwright error: ${e.message}`); }
  }

  if (getConfig('SCRAPER_API_KEY') && budget.require('SCRAPER_API', STEP_MIN_BUDGETS.SCRAPER_API)) {
    onLog(`[${domain}] Trying ScraperAPI...`);
    const scraperApiKey = getConfig('SCRAPER_API_KEY');
    const scraperHtml = await fetchWithScraperAPI(base, domain, onLog);
    if (scraperHtml) {
      const allEmails = new Set();
      extractEmailsFromHtml(scraperHtml).forEach(e => allEmails.add(e));
      const links = [...new Set([...discoverInternalLinks(scraperHtml, base), ...INTERNAL_PATHS.slice(0, 4).map(p => `${base}${p}`)])].slice(0, 4);
      for (const url of links) {
        if (!budget.has(6000)) { onLog(`[${domain}] ScraperAPI sub-pages: stopping early — low remaining time`); break; }
        try {
          const u = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(url)}&render=true`;
          const r = await fetchHttp(u, 45000);
          if (r.html && r.status === 200 && !isBlockedResponse(r.html, r.status)) extractEmailsFromHtml(r.html).forEach(e => allEmails.add(e));
        } catch {}
      }
      const emails = filterAndDeduplicateEmails([...allEmails]);
      if (emails.length > 0) { onLog(`[${domain}] ✅ ScraperAPI: ${emails.length} emails`); return { emails, status: 'SUCCESS', method: 'SCRAPER_API', error: null }; }
    }
    onLog(`[${domain}] ScraperAPI: no emails found`);
  }

  if (budget.require('WHOIS', STEP_MIN_BUDGETS.WHOIS)) {
    onLog(`[${domain}] Trying WHOIS...`);
    const whoisEmails = filterAndDeduplicateEmails(await getWhoisEmails(domain));
    if (whoisEmails.length > 0) { onLog(`[${domain}] ✅ WHOIS: ${whoisEmails.length} emails`); return { emails: whoisEmails, status: 'SUCCESS', method: 'WHOIS', error: null }; }
    onLog(`[${domain}] WHOIS: no emails found`);
  }

  if (budget.require('PATTERN_SMTP', STEP_MIN_BUDGETS.PATTERN_SMTP)) {
    onLog(`[${domain}] Trying SMTP pattern guesser...`);
    const guessedEmails = await emailPatternGuesser(domain, onLog, budget);
    const validated = filterAndDeduplicateEmails(guessedEmails);
    if (validated.length > 0) { onLog(`[${domain}] ✅ Pattern (SMTP verified): ${validated.length} emails`); return { emails: validated, status: 'SUCCESS', method: 'PATTERN_SMTP', error: null }; }
    onLog(`[${domain}] SMTP pattern: no emails verified`);
  }

  if (!budget.has(1)) { onLog(`[${domain}] ❌ Time budget exhausted`); return buildBudgetExhaustedResult(); }

  onLog(`[${domain}] ❌ No emails found`);
  return { emails: [], status: 'BLOCKED', method: 'ALL', error: 'All methods exhausted' };
}

export async function scrapeDomain(domain, browser, onLog = () => {}) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Domain emergency timeout after ${DOMAIN_EMERGENCY_TIMEOUT_MS}ms`)), DOMAIN_EMERGENCY_TIMEOUT_MS)
  );
  try {
    return await Promise.race([_scrapeDomain(domain, browser, onLog), timeout]);
  } catch (err) {
    logger.error(`scrapeDomain ${domain}: ${err.message}`);
    onLog(`[${domain}] ❌ ${err.message}`);
    return { emails: [], status: 'ERROR', method: 'TIMEOUT', error: err.message };
  }
}