import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser } from 'playwright';

// Apply stealth plugin once at module load
chromium.use(stealthPlugin());

// ─── User-Agent Pool ─────────────────────────────────────────────────────────
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
];

function pickUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** Behavioral jitter: random delay between minMs and maxMs */
function behavioralJitter(minMs = 300, maxMs = 1500): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
}

/** Human-like mouse movement to foil simple bot detectors */
async function simulateHumanInteraction(page: any) {
    const { width, height } = page.viewportSize() || { width: 1280, height: 800 };
    // Move to 3 random points
    for (let i = 0; i < 3; i++) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        await page.mouse.move(x, y, { steps: 5 });
        await behavioralJitter(100, 300);
    }
}

const VIEWPORTS = [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
];

function pickViewport() {
    return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
}

// ─── Strip protocol from URL for site: query ─────────────────────────────────
// Google's site: operator must NOT include https:// or http://.
// e.g. site:example.com/path — never site:https://example.com/path
function toSiteQuery(url: string): string {
    try {
        const u = new URL(url);
        // hostname + pathname, strip trailing slash for cleaner queries
        const raw = u.hostname + u.pathname;
        return raw.replace(/\/$/, '');
    } catch {
        // If parsing fails, strip protocol manually
        return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
}

// ─── Shared Browser Instance ──────────────────────────────────────────────────
let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    if (sharedBrowser && sharedBrowser.isConnected()) {
        return sharedBrowser;
    }
    sharedBrowser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--window-size=1280,800',
        ],
    });
    return sharedBrowser;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface IndexCheckResult {
    url: string;
    status: 'INDEXED' | 'NOT_INDEXED' | 'ERROR';
    error?: string;
}

// ─── Hard Timeout Wrapper ────────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
    ]);
}

// ─── Core Check ──────────────────────────────────────────────────────────────
export async function checkGoogleIndex(url: string): Promise<IndexCheckResult> {
    const result = await withTimeout(
        _checkGoogleIndex(url),
        45_000, // hard 45-second cap — never get stuck
        { url, status: 'ERROR' as const, error: 'Timed out after 45s' }
    );
    return result;
}

async function _checkGoogleIndex(url: string): Promise<IndexCheckResult> {
    let context = null;
    try {
        const browser = await getBrowser();
        const userAgent = pickUserAgent();

        const viewport = pickViewport();

        context = await browser.newContext({
            viewport,
            userAgent,
            locale: 'en-US',
            timezoneId: 'America/New_York',
            extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
        });

        const page = await context.newPage();
        await simulateHumanInteraction(page);

        // ── Build correct site: query ──────────────────────────────────────
        // CRITICAL: strip protocol — Google site: operator never uses https://
        const siteQuery = toSiteQuery(url);
        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(`site:${siteQuery}`)}&hl=en&gl=us&num=5`;

        console.log(`[Engine] Checking: site:${siteQuery}`);

        await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // ── Dynamic Wait ───────────────────────────────────────────────────
        // Wait for Google's results area OR the "no results" block to load.
        // Timeout after 15s — if neither appears, it's likely a CAPTCHA page.
        try {
            await page.waitForSelector('#search, #topstuff, #main, #rcnt, #captcha-form', {
                timeout: 15000,
            });
        } catch {
            // waitForSelector timed out — could be a CAPTCHA or network issue
            console.warn(`[Engine] waitForSelector timed out for: ${url}`);
        }

        // ── CAPTCHA / Consent check ────────────────────────────────────────
        const isCaptcha = await page.evaluate(() => {
            const body = document.body.innerText || '';
            return (
                body.includes('unusual traffic') ||
                body.includes('not a robot') ||
                body.includes('captcha') ||
                document.querySelector('#captcha-form') !== null
            );
        });

        if (isCaptcha) {
            console.warn(`[Engine] CAPTCHA detected for: ${url} — resetting browser`);
            // Kill the shared browser so the next check starts fresh
            await closeBrowser();
            return { url, status: 'ERROR', error: 'CAPTCHA or unusual traffic block' };
        }

        // ── Behavioral Jitter ──────────────────────────────────────────────
        await behavioralJitter(300, 1200);

        // ── NOT_INDEXED Detection ──────────────────────────────────────────
        // Google shows "did not match any documents" when site: returns 0 results.
        const isNotIndexed = await page.evaluate(() => {
            // Check multiple selectors Google uses for the "no results" message
            const candidates = [
                document.querySelector('#topstuff') as HTMLElement | null,
                document.querySelector('#main') as HTMLElement | null,
                document.querySelector('#rcnt') as HTMLElement | null,
                document.body as HTMLElement,
            ];
            for (const el of candidates) {
                if (!el) continue;
                const text = el.innerText || '';
                if (
                    text.includes('did not match any documents') ||
                    text.includes('did not match any results') ||
                    text.includes('No results found for') ||
                    text.includes('Your search - site:') && text.includes('- did not match')
                ) {
                    return true;
                }
            }

            // Also check result-stats — "0 results" is a hard NOT_INDEXED signal
            const statsEl = document.querySelector('#result-stats, #resultStats') as HTMLElement | null;
            if (statsEl) {
                const statsText = statsEl.innerText || '';
                // "About 0 results" means not indexed
                if (/About\s+0\s+results/i.test(statsText)) return true;
            }

            return false;
        });

        if (isNotIndexed) {
            console.log(`[Engine] NOT_INDEXED: site:${siteQuery}`);
            return { url, status: 'NOT_INDEXED' };
        }

        // ── INDEXED Detection ──────────────────────────────────────────────
        // A genuine site: result shows organic links AND a result-stats bar.
        // We check both to reduce false positives.
        const isIndexed = await page.evaluate(() => {
            const searchContainer = document.querySelector('#search');
            if (!searchContainer) return false;

            // Must have at least one non-Google organic link
            const links = Array.from(
                searchContainer.querySelectorAll('a[href]')
            ) as HTMLAnchorElement[];

            const hasExternalLink = links.some(a => {
                const href = a.href || '';
                return href.startsWith('http') && !href.includes('google.com');
            });

            // Result stats bar (e.g. "About 3 results") is a strong INDEXED signal
            const statsEl = document.querySelector('#result-stats, #resultStats') as HTMLElement | null;
            const hasStats = statsEl !== null && /About\s+[1-9]/i.test(statsEl.innerText || '');

            return hasExternalLink || hasStats;
        });

        if (isIndexed) {
            console.log(`[Engine] INDEXED: site:${siteQuery}`);
            return { url, status: 'INDEXED' };
        }

        // ── Fallback ───────────────────────────────────────────────────────
        // Page loaded but matched neither condition — ambiguous state.
        // Treat conservatively as NOT_INDEXED to avoid false positives.
        console.warn(`[Engine] Ambiguous result for: ${url} — treating as NOT_INDEXED`);
        return { url, status: 'NOT_INDEXED' };

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Engine] Error checking ${url}:`, msg);
        return { url, status: 'ERROR', error: msg };
    } finally {
        if (context) {
            await context.close().catch(() => { });
        }
    }
}

/** 
 * Secondary Free Fallback: Bing 
 * Used if Google blocks the local scraper with a persistent CAPTCHA.
 */
export async function checkBingIndex(url: string): Promise<IndexCheckResult> {
    let context = null;
    try {
        const browser = await getBrowser();
        const userAgent = pickUserAgent();
        const viewport = pickViewport();

        context = await browser.newContext({
            viewport,
            userAgent,
            locale: 'en-US',
        });

        const page = await context.newPage();
        const siteQuery = toSiteQuery(url);
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(`site:${siteQuery}`)}`;

        console.log(`[Engine] Bing Fallback: site:${siteQuery}`);

        await page.goto(bingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await behavioralJitter(1000, 2000);

        const isNotIndexed = await page.evaluate(() => {
            const body = document.body.innerText || '';
            return (
                body.includes('did not match any documents') ||
                body.includes('There are no results for') ||
                body.includes('We did not find any results')
            );
        });

        if (isNotIndexed) return { url, status: 'NOT_INDEXED' };

        const isIndexed = await page.evaluate(() => {
            const b_results = document.querySelector('#b_results');
            if (!b_results) return false;
            // Check for presence of external links in results
            const links = Array.from(b_results.querySelectorAll('a[href]')) as HTMLAnchorElement[];
            return links.some(a => a.href.startsWith('http') && !a.href.includes('bing.com'));
        });

        return { url, status: isIndexed ? 'INDEXED' : 'NOT_INDEXED' };

    } catch (err: any) {
        console.error(`[Engine] Bing Error for ${url}:`, err.message);
        return { url, status: 'ERROR', error: err.message };
    } finally {
        if (context) await context.close().catch(() => { });
    }
}

/** Gracefully close the shared browser (call on app shutdown). */
export async function closeBrowser(): Promise<void> {
    if (sharedBrowser) {
        await sharedBrowser.close();
        sharedBrowser = null;
    }
}
