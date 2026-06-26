// // fetch is built-in (Node v22)

// ─── CONFIG — paste your actual keys here ───────────────────────
const MINELEAD_API_KEY  = 'e1a26f5a959d466c3fb084758e99c759';
const SCRAPER_API_KEY   = 'e2d58b20b2e1b14c6e0b793401fd2c28';
// ────────────────────────────────────────────────────────────────

// Test domain — we KNOW this has an email (confirmed in results)
const TEST_DOMAIN = 'interviewsidekick.com';
const TEST_URL    = 'https://interviewsidekick.com/contact';

console.log('\n========================================');
console.log('  API Health Check');
console.log('========================================\n');

// ─── 1. MINELEAD ─────────────────────────────────────────────────
async function testMinelead() {
  console.log('🔵 Testing Minelead...');
  try {
    const url = `https://api.minelead.io/v1/search/?key=${MINELEAD_API_KEY}&domain=${TEST_DOMAIN}`;
    console.log('   URL:', url.replace(MINELEAD_API_KEY, '****'));

    const res = await fetch(url);
    const text = await res.text();

    console.log('   HTTP Status:', res.status);
    console.log('   Response:', text.slice(0, 300));

    if (res.status === 200) {
      const json = JSON.parse(text);
      const emails = json?.emails || json?.data?.emails || [];
      if (emails.length > 0) {
        console.log('   ✅ WORKING — found emails:', emails);
      } else {
        console.log('   ⚠️  Connected but 0 emails — key may be free tier / exhausted credits');
      }
    } else if (res.status === 401 || res.status === 403) {
      console.log('   ❌ INVALID API KEY');
    } else if (res.status === 429) {
      console.log('   ❌ RATE LIMITED / OUT OF CREDITS');
    } else {
      console.log('   ❌ UNEXPECTED STATUS:', res.status);
    }
  } catch (err) {
    console.log('   ❌ ERROR:', err.message);
  }
  console.log();
}

// ─── 2. SCRAPERAPI ───────────────────────────────────────────────
async function testScraperAPI() {
  console.log('🔵 Testing ScraperAPI...');
  try {
    // First check account info / credits
    const accountUrl = `https://api.scraperapi.com/account?api_key=${SCRAPER_API_KEY}`;
    console.log('   Checking account credits...');
    const accountRes = await fetch(accountUrl);
    const accountText = await accountRes.text();
    console.log('   Account HTTP Status:', accountRes.status);
    console.log('   Account Info:', accountText.slice(0, 300));

    // Then test an actual scrape
    console.log('   Testing actual scrape of', TEST_URL);
    const scrapeUrl = `https://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(TEST_URL)}&render=false`;
    const scrapeRes = await fetch(scrapeUrl, { signal: AbortSignal.timeout(30000) });
    const scrapeText = await scrapeRes.text();

    console.log('   Scrape HTTP Status:', scrapeRes.status);

    if (scrapeRes.status === 200) {
      // Check if any email pattern found in response
      const emails = scrapeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      const unique = [...new Set(emails)];
      console.log('   ✅ SCRAPE WORKING');
      console.log('   Emails found in page:', unique.length > 0 ? unique : 'none (but scrape worked)');
      console.log('   HTML length:', scrapeText.length, 'chars');
    } else if (scrapeRes.status === 403) {
      console.log('   ❌ INVALID/EXPIRED API KEY');
    } else if (scrapeRes.status === 429) {
      console.log('   ❌ OUT OF CREDITS');
    } else if (scrapeRes.status === 500 || scrapeRes.status === 502) {
      console.log('   ❌ TARGET SITE BLOCKED SCRAPERAPI');
    } else {
      console.log('   ❌ UNEXPECTED STATUS:', scrapeRes.status);
      console.log('   Response:', scrapeText.slice(0, 200));
    }
  } catch (err) {
    if (err.name === 'TimeoutError') {
      console.log('   ❌ TIMEOUT — ScraperAPI took >30s (site may be blocking)');
    } else {
      console.log('   ❌ ERROR:', err.message);
    }
  }
  console.log();
}

// ─── 3. COMMON CRAWL ─────────────────────────────────────────────
async function testCommonCrawl() {
  console.log('🔵 Testing Common Crawl...');
  try {
    // Try the latest index
    const indexListUrl = 'https://index.commoncrawl.org/collinfo.json';
    console.log('   Fetching available indexes...');
    const indexRes = await fetch(indexListUrl, { signal: AbortSignal.timeout(15000) });
    const indexes = await indexRes.json();
    const latestIndex = indexes[0]?.id;
    console.log('   Latest index:', latestIndex);

    // Query that index for our test domain
    const cdxUrl = `https://index.commoncrawl.org/${latestIndex}-index?url=${TEST_DOMAIN}/*&output=json&limit=3`;
    console.log('   Querying:', cdxUrl);
    const cdxRes = await fetch(cdxUrl, { signal: AbortSignal.timeout(20000) });
    const cdxText = await cdxRes.text();

    console.log('   CDX HTTP Status:', cdxRes.status);
    console.log('   Response:', cdxText.slice(0, 400));

    if (cdxRes.status === 200 && cdxText.trim()) {
      const lines = cdxText.trim().split('\n').filter(Boolean);
      console.log(`   ✅ WORKING — found ${lines.length} records for ${TEST_DOMAIN}`);
    } else if (cdxText.includes('No Captures found')) {
      console.log('   ⚠️  Connected but domain not in this index — try older index');
    } else {
      console.log('   ❌ Unexpected response');
    }

    // Also check what index your app is currently using
    console.log('\n   📋 Your app uses which index? Check commonCrawlService.js');
    console.log('   Available recent indexes:', indexes.slice(0, 3).map(i => i.id).join(', '));

  } catch (err) {
    if (err.name === 'TimeoutError') {
      console.log('   ❌ TIMEOUT — Common Crawl API unreachable (check your internet/firewall)');
    } else {
      console.log('   ❌ ERROR:', err.message);
    }
  }
  console.log();
}

// ─── RUN ALL ─────────────────────────────────────────────────────
(async () => {
  await testMinelead();
  await testScraperAPI();
  await testCommonCrawl();
  console.log('========================================');
  console.log('  Done');
  console.log('========================================\n');
})();
