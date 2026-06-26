/**
 * Normalize a raw domain or URL string into a clean hostname.
 * Returns null if the input is not a valid domain.
 */
export function normalizeDomain(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let cleaned = raw.trim().toLowerCase();

  // Strip leading protocols and www
  cleaned = cleaned.replace(/^(https?:\/\/)?(www\.)?/, '');

  // Strip trailing slashes, paths, ports, query strings
  cleaned = cleaned.split('/')[0];
  cleaned = cleaned.split(':')[0];
  cleaned = cleaned.split('?')[0];

  if (!cleaned.includes('.') || /\s/.test(cleaned)) return null;
  if (cleaned.length > 253) return null;

  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
  if (!domainRegex.test(cleaned)) return null;

  return cleaned;
}

/**
 * Removes duplicate domains (case-insensitive).
 * @param {string[]} domains
 * @returns {string[]}
 */
export function deduplicateDomains(domains) {
  const seen = new Set();
  return domains.filter(d => {
    if (seen.has(d)) return false;
    seen.add(d);
    return true;
  });
}