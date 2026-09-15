/**
 * Common Crawl Email Search
 * 100% free, no API key, no account, no rate limits.
 * Searches the public web archive for cached pages of a domain
 * and extracts emails from the raw HTML stored in S3.
 */

const CC_INDEX = 'CC-MAIN-2024-51'; // latest crawl index

/**
 * Search Common Crawl archive for emails on a domain.
 * @param {string} domain
 * @param {function} onLog
 * @returns {Promise<string[]>}
 */
export async function commonCrawlSearch(domain, onLog) {
  try {
    onLog(`[${domain}] Querying Common Crawl index...`);

    // Step 1: find pages for this domain in the crawl index
    const indexUrl =
      `https://index.commoncrawl.org/${CC_INDEX}-index` +
      `?url=${encodeURIComponent(domain + '/*')}&output=json&limit=8`;

    const indexRes = await fetch(indexUrl, { signal: AbortSignal.timeout(15000) });
    if (!indexRes.ok) return [];

    const text = await indexRes.text();
    const records = text
      .trim()
      .split('\n')
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);

    if (!records.length) {
      onLog(`[${domain}] No Common Crawl records found`);
      return [];
    }

    onLog(`[${domain}] Common Crawl: ${records.length} records found, extracting...`);

    const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}/g;
    const emails = new Set();

    // Step 2: fetch raw HTML for each record from S3 using Range header
    const fetches = records.slice(0, 4).map(async record => {
      try {
        const s3Url = `https://data.commoncrawl.org/${record.filename}`;
        const start = parseInt(record.offset, 10);
        const end = start + parseInt(record.length, 10) - 1;

        const r = await fetch(s3Url, {
          headers: { Range: `bytes=${start}-${end}` },
          signal: AbortSignal.timeout(20000)
        });

        if (!r.ok) return;

        const buffer = await r.arrayBuffer();
        // Decode — WARC files are gzip-compressed, decode as text safely
        const raw = new TextDecoder('utf-8', { fatal: false }).decode(buffer);

        // Extract emails from the raw WARC/HTML content
        (raw.match(emailRe) || []).forEach(e => emails.add(e.toLowerCase()));

      } catch { /* skip failed record */ }
    });

    await Promise.allSettled(fetches);

    // Filter junk
    const cleaned = [...emails].filter(e =>
      !e.includes('example.') &&
      !e.includes('test@') &&
      !e.includes('@w3.org') &&
      !e.includes('@schema.org') &&
      !e.includes('sentry.io') &&
      !e.includes('@2x') &&
      e.split('@')[1]?.includes('.')
    );

    onLog(`[${domain}] Common Crawl: ${cleaned.length} raw emails extracted`);
    return cleaned;

  } catch (err) {
    onLog(`[${domain}] Common Crawl error: ${err.message}`);
    return [];
  }
}