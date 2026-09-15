/**
 * Email extraction — strict validation to eliminate asset filenames,
 * hash strings, obfuscated fragments, and other false positives.
 * Includes Cloudflare email obfuscation decoder.
 */

// Strict email regex — requires realistic TLD (2-6 chars), no hashes
const STRICT_EMAIL_REGEX = /\b([a-zA-Z0-9._%+\-]{1,64})@([a-zA-Z0-9\-]{1,63}(?:\.[a-zA-Z0-9\-]{1,63})*\.[a-zA-Z]{2,6})\b/g;

const MAILTO_REGEX = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6})/gi;

// Patterns that indicate a false positive (asset filenames, hashes, etc.)
const FALSE_POSITIVE_PATTERNS = [
  /\.[a-f0-9]{20,}/i,
  /\.(js|css|png|jpg|jpeg|gif|svg|webp|woff|ttf|ico|map)$/i,
  /^[a-f0-9]{10,}$/i,
  /@[a-f0-9]{8,}/i,
  /[a-f0-9]{32,}/i,
];

// Unicode/entity prefixes injected by HTML rendering engines
const BAD_PREFIXES = [
  'u003e', 'u003c', '\\u003e', '\\u003c',
  '%3e', '%3c', '&gt;', '&lt;',
];

// Word fragments that look like emails but aren't (e.g. navig@ion)
const WORD_FRAGMENT_PATTERN = /^[a-z]{1,8}@[a-z]{2,6}$/;

function decodeHtmlEntities(str) {
  return str
    .replace(/&#64;/g, '@').replace(/&#46;/g, '.')
    .replace(/&#x40;/gi, '@').replace(/&#x2e;/gi, '.')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function isFalsePositive(email) {
  if (!email || typeof email !== 'string') return true;
  const e = email.trim().toLowerCase();

  // Reject unicode/entity prefixed emails
  for (const prefix of BAD_PREFIXES) {
    if (e.startsWith(prefix)) return true;
  }

  const atIdx = e.lastIndexOf('@');
  if (atIdx === -1) return true;

  const local  = e.slice(0, atIdx);
  const domain = e.slice(atIdx + 1);

  if (!local || !domain) return true;
  if (local.length > 40) return true;
  if (domain.length > 80) return true;

  // Reject file extension domains
  if (/\.(js|css|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|ico|map|json)$/i.test(domain)) return true;

  // Reject word fragments
  if (WORD_FRAGMENT_PATTERN.test(e)) return true;

  // Domain must have a dot
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return true;

  // TLD must be pure alpha, 2-6 chars, no digits
  const tld = domainParts[domainParts.length - 1];
  if (/\d/.test(tld) || tld.length < 2 || tld.length > 6) return true;

  // Domain hex check
  const domainWithoutTld = domainParts.slice(0, -1).join('.');
  if (/^[a-f0-9\-]+$/.test(domainWithoutTld) && domainWithoutTld.length > 16) return true;

  // Local part must not be pure hex > 16 chars
  if (/^[a-f0-9]{16,}$/.test(local)) return true;

  // Check false positive patterns
  for (const pattern of FALSE_POSITIVE_PATTERNS) {
    if (pattern.test(email)) return true;
  }

  return false;
}

/**
 * Decodes Cloudflare's email obfuscation.
 * CF encodes emails as: <a href="/cdn-cgi/l/email-protection" data-cfemail="HEXSTRING">
 * This is a publicly documented, reversible XOR encoding.
 */
export function decodeCloudflareEmails(html) {
  const emails = [];
  const re = /data-cfemail="([0-9a-f]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const encoded = m[1];
      if (encoded.length < 4) continue;
      const key = parseInt(encoded.substr(0, 2), 16);
      let decoded = '';
      for (let i = 2; i < encoded.length; i += 2) {
        decoded += String.fromCharCode(parseInt(encoded.substr(i, 2), 16) ^ key);
      }
      const clean = decoded.toLowerCase().trim();
      if (clean.includes('@') && !isFalsePositive(clean)) {
        emails.push(clean);
      }
    } catch { /* skip malformed */ }
  }
  return emails;
}

/**
 * Scans raw HTML/text for @ symbols and extracts surrounding context.
 * Works even when JS rendering fails — "Ctrl+F for @" strategy.
 */
export function extractEmailsByAtScan(html) {
  if (!html) return [];
  const emails = new Set();
  const decoded = decodeHtmlEntities(html);

  for (let i = 0; i < decoded.length; i++) {
    if (decoded[i] !== '@') continue;
    const start  = Math.max(0, i - 60);
    const end    = Math.min(decoded.length, i + 60);
    const window = decoded.slice(start, end);
    const matches = window.match(STRICT_EMAIL_REGEX) || [];
    matches.forEach(e => emails.add(e.toLowerCase().trim()));
  }

  return Array.from(emails).filter(e => !isFalsePositive(e));
}

/**
 * Main extraction function.
 * Combines: mailto hrefs + @ scan + Cloudflare CF email decode.
 * @param {string} html
 * @returns {string[]}
 */
export function extractEmailsFromHtml(html) {
  if (!html) return [];
  const emails = new Set();
  const decoded = decodeHtmlEntities(html);

  // Strategy 1: mailto hrefs — most reliable
  const mailtoPattern = new RegExp(MAILTO_REGEX.source, 'gi');
  let m;
  while ((m = mailtoPattern.exec(decoded)) !== null) {
    const raw = m[1].split('?')[0].toLowerCase().trim();
    if (!isFalsePositive(raw)) emails.add(raw);
  }

  // Strategy 2: @ scan on decoded HTML
  extractEmailsByAtScan(decoded).forEach(e => emails.add(e));

  // Strategy 3: Cloudflare email obfuscation decode
  decodeCloudflareEmails(html).forEach(e => emails.add(e));

  return Array.from(emails);
}