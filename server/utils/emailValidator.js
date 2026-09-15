const FAKE_DOMAINS = new Set([
  'example.com','example.org','example.net','test.com','test.org',
  'yourdomain.com','domain.com','yoursite.com','placeholder.com',
  'fake.com','dummy.com','acme.com','foo.com','bar.com','baz.com',
  'lorem.com','noreply.com','sentry.io','email.com','user.com',
]);

const FAKE_LOCAL_PARTS = new Set([
  'noreply','no-reply','donotreply','do-not-reply',
  'example','test','user','youremail','your-email',
]);

// Unicode/entity prefixes that appear before real emails in HTML
const BAD_PREFIXES = [
  'u003e', 'u003c', '\\u003e', '\\u003c',
  '%3e', '%3c', '&gt;', '&lt;',
];

// Word fragment patterns — HTML words split at @ (e.g. navig@ion, organis@ions)
const WORD_FRAGMENT_PATTERN = /^[a-z]{1,8}@[a-z]{2,6}$/;

// Must look like a real TLD
const VALID_TLD = /^[a-zA-Z]{2,6}$/;

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;

  let e = email.trim().toLowerCase();

  // Reject emails that start with unicode/entity garbage prefixes
  // e.g. "u003egds.data.protection@dsit.gov.uk" — the clean version is captured separately
  for (const prefix of BAD_PREFIXES) {
    if (e.startsWith(prefix)) return false;
  }

  if (e.length > 100 || e.length < 6) return false;
  if (!e.includes('@') || e.includes('..')) return false;

  const atIdx = e.lastIndexOf('@');
  const local  = e.slice(0, atIdx);
  const domain = e.slice(atIdx + 1);

  if (!local || !domain) return false;
  if (local.length > 40 || domain.length > 80) return false;

  // Reject hash-like strings (asset filenames, cache-busting hashes)
  if (/[a-f0-9]{16,}/.test(local) || /[a-f0-9]{20,}/.test(domain)) return false;

  // Reject file extensions in domain (JS/CSS/image asset filenames)
  if (/\.(js|css|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|ico|map|json)$/i.test(domain)) return false;

  // Reject word fragments like navig@ion, organis@ions, applic@ion
  if (WORD_FRAGMENT_PATTERN.test(e)) return false;

  // Domain must have at least one dot
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false;

  const tld = domainParts[domainParts.length - 1];
  if (!VALID_TLD.test(tld)) return false;

  // TLD must not contain digits
  if (/\d/.test(tld)) return false;

  if (FAKE_DOMAINS.has(domain)) return false;
  if (FAKE_LOCAL_PARTS.has(local)) return false;

  // Must match basic email shape
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,6}$/.test(e)) return false;

  return true;
}

export function filterAndDeduplicateEmails(rawEmails) {
  const seen  = new Set();
  const valid = [];
  for (const raw of rawEmails) {
    const n = raw.trim().toLowerCase();
    if (!seen.has(n) && isValidEmail(n)) {
      seen.add(n);
      valid.push(n);
    }
  }
  return valid;
}