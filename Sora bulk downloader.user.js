// ==UserScript==
// @name         Sora Bulk Downloader
// @namespace    https://sora.chatgpt.com/
// @version      1.0
// @description  Bulk download all Sora generations (images & videos) — fixed scroll for virtualized infinite list
// @author       You
// @match        https://sora.chatgpt.com/*
// @match        https://sora.com/*
// @match        https://www.sora.com/*
// @grant        GM_download
// @grant        GM_addStyle
// @connect      videos.openai.com
// @connect      sora.chatgpt.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    let collectedIds = new Set();
    let collectedUrls = new Map();  // genId -> CDN url
    let resolvedItems = new Map();
    let isScanning = false;
    let isDownloading = false;
    let completedCount = 0;
    let failedCount = 0;
    let totalToDownload = 0;
    let stopRequested = false;

    const STYLE = `
#sora-dl-panel{position:fixed;top:12px;right:12px;z-index:99999;background:#1a1a2e;color:#e0e0e0;border:1px solid #333;border-radius:12px;padding:16px;width:370px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,.5);max-height:90vh;overflow-y:auto}
#sora-dl-panel h3{margin:0 0 12px;font-size:15px;color:#fff}
#sora-dl-panel .sdl-row{display:flex;gap:8px;margin-bottom:8px}
#sora-dl-panel button{padding:8px 14px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;transition:opacity .2s}
#sora-dl-panel button:hover{opacity:.85}
#sora-dl-panel button:disabled{opacity:.4;cursor:not-allowed}
.sdl-btn-primary{background:#6c5ce7;color:#fff;flex:1}
.sdl-btn-secondary{background:#2d2d44;color:#ccc;flex:1}
.sdl-btn-danger{background:#e74c3c;color:#fff;flex:1}
.sdl-btn-success{background:#27ae60;color:#fff;flex:1}
#sora-dl-panel .sdl-status{background:#16213e;border-radius:8px;padding:10px;margin:8px 0;font-size:12px;line-height:1.6;max-height:200px;overflow-y:auto;white-space:pre-wrap;word-break:break-word}
#sora-dl-panel .sdl-progress-bar{width:100%;height:6px;background:#2d2d44;border-radius:3px;overflow:hidden;margin:8px 0}
#sora-dl-panel .sdl-progress-fill{height:100%;background:linear-gradient(90deg,#6c5ce7,#a29bfe);border-radius:3px;transition:width .3s;width:0}
#sora-dl-panel select,#sora-dl-panel input[type=number]{background:#2d2d44;color:#e0e0e0;border:1px solid #444;border-radius:6px;padding:6px 8px;font-size:12px;width:100%;margin-bottom:8px;box-sizing:border-box}
#sora-dl-panel label{font-size:11px;color:#999;display:block;margin-bottom:4px}
#sora-dl-panel .sdl-stat{display:inline-block;background:#2d2d44;padding:4px 10px;border-radius:6px;margin:2px;font-size:11px}
#sora-dl-panel .sdl-minimize{position:absolute;top:8px;right:12px;background:0 0;border:none;color:#999;font-size:18px;cursor:pointer;padding:4px}
#sora-dl-panel .sdl-minimize:hover{color:#fff}
#sora-dl-panel .sdl-info{font-size:11px;color:#888;margin-top:8px;line-height:1.4}
.sdl-divider{border:none;border-top:1px solid #333;margin:10px 0}
`;

    function createPanel() {
        const s = document.createElement('style'); s.textContent = STYLE; document.head.appendChild(s);
        const panel = document.createElement('div');
        panel.id = 'sora-dl-panel';
        panel.innerHTML = `
            <button class="sdl-minimize" id="sdl-toggle">\u2500</button>
            <h3>\u2b07\ufe0f Sora Bulk Downloader v1.0</h3>
            <div id="sdl-body">
                <label>Filename pattern</label>
                <select id="sdl-naming">
                    <option value="id">ID only</option>
                    <option value="num">Numbered (0001, 0002...)</option>
                </select>
                <label>Concurrent downloads</label>
                <input type="number" id="sdl-concurrency" value="2" min="1" max="4">
                <hr class="sdl-divider">
                <div class="sdl-row">
                    <button class="sdl-btn-primary" id="sdl-scan">1. Scan Library</button>
                    <button class="sdl-btn-success" id="sdl-download" disabled>2. Download All</button>
                </div>
                <div class="sdl-row">
                    <button class="sdl-btn-danger" id="sdl-stop" disabled>Stop</button>
                    <button class="sdl-btn-secondary" id="sdl-clear">Clear</button>
                </div>
                <div class="sdl-progress-bar"><div class="sdl-progress-fill" id="sdl-progress"></div></div>
                <div id="sdl-stats" style="margin:6px 0">
                    <span class="sdl-stat" id="sdl-found">IDs: 0</span>
                    <span class="sdl-stat" id="sdl-urls">URLs: 0</span>
                    <span class="sdl-stat" id="sdl-done">Done: 0</span>
                    <span class="sdl-stat" id="sdl-failed">Failed: 0</span>
                </div>
                <div class="sdl-status" id="sdl-log">Ready. Go to your Library, then click "Scan Library".</div>
                <div class="sdl-info">
                    Scrolls the page slowly to load all items from Sora's infinite scroll, collecting image/video URLs from each tile as it appears. Then downloads them all.
                </div>
            </div>`;
        document.body.appendChild(panel);

        let min = false;
        document.getElementById('sdl-toggle').addEventListener('click', () => {
            min = !min;
            document.getElementById('sdl-body').style.display = min ? 'none' : 'block';
            document.getElementById('sdl-toggle').textContent = min ? '+' : '\u2500';
        });
        document.getElementById('sdl-scan').addEventListener('click', startScan);
        document.getElementById('sdl-download').addEventListener('click', startDownload);
        document.getElementById('sdl-stop').addEventListener('click', stopAll);
        document.getElementById('sdl-clear').addEventListener('click', () => {
            collectedIds.clear(); collectedUrls.clear(); resolvedItems.clear();
            completedCount = 0; failedCount = 0; totalToDownload = 0;
            updateStats(); document.getElementById('sdl-progress').style.width = '0%';
            document.getElementById('sdl-download').disabled = true; log('Cleared.');
        });
    }

    function log(msg) {
        const el = document.getElementById('sdl-log');
        if (el) el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + el.textContent;
    }

    function updateStats() {
        const s = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
        s('sdl-found', `IDs: ${collectedIds.size}`);
        s('sdl-urls', `URLs: ${collectedUrls.size}`);
        s('sdl-done', `Done: ${completedCount}`);
        s('sdl-failed', `Failed: ${failedCount}`);
        const p = document.getElementById('sdl-progress');
        if (p && totalToDownload > 0) p.style.width = ((completedCount + failedCount) / totalToDownload * 100) + '%';
    }

    // ─── DOM Scraping ────────────────────────────────────────────────────
    function scrapeCurrentDOM() {
        // Find links to /g/ pages
        document.querySelectorAll('a[href*="/g/"]').forEach(a => {
            const m = a.href.match(/\/g\/((?:gen|img)_[a-z0-9]+)/i);
            if (!m) return;
            const id = m[1];
            collectedIds.add(id);

            // Walk up to find the tile container, then look for images
            let container = a;
            for (let i = 0; i < 6; i++) {
                if (container.parentElement) container = container.parentElement;
            }

            // Find all images in/near this link
            const imgs = container.querySelectorAll('img[src]');
            imgs.forEach(img => {
                const src = img.src || '';
                if (src.includes('videos.openai.com') || src.includes('vg-assets')) {
                    if (!collectedUrls.has(id) || isBetter(src, collectedUrls.get(id))) {
                        collectedUrls.set(id, src);
                    }
                }
                // Check srcset
                (img.srcset || '').split(',').forEach(entry => {
                    const url = entry.trim().split(/\s+/)[0];
                    if (url && (url.includes('videos.openai.com') || url.includes('vg-assets'))) {
                        if (!collectedUrls.has(id) || isBetter(url, collectedUrls.get(id))) {
                            collectedUrls.set(id, url);
                        }
                    }
                });
            });

            // Videos
            container.querySelectorAll('video source[src], video[src]').forEach(v => {
                const src = v.src || v.getAttribute('src') || '';
                if (src.includes('videos.openai.com') || src.includes('.mp4')) {
                    collectedUrls.set(id, src);
                }
            });
        });

        // Also try matching images back to nearby links
        document.querySelectorAll('img[src*="videos.openai.com"]').forEach(img => {
            const src = img.src;
            // Walk up to find a /g/ link
            let el = img;
            for (let i = 0; i < 8; i++) {
                if (!el.parentElement) break;
                el = el.parentElement;
                const link = el.querySelector('a[href*="/g/"]') || (el.tagName === 'A' && el.href?.includes('/g/') ? el : null);
                if (link) {
                    const href = link.href || link.getAttribute('href') || '';
                    const m = href.match(/\/g\/((?:gen|img)_[a-z0-9]+)/i);
                    if (m) {
                        const id = m[1];
                        collectedIds.add(id);
                        if (!collectedUrls.has(id) || isBetter(src, collectedUrls.get(id))) {
                            collectedUrls.set(id, src);
                        }
                    }
                    break;
                }
            }
        });

        // Broad ID scan from innerHTML
        const html = document.body.innerHTML;
        const allIds = html.match(/(gen_[a-z0-9]{15,}|img_[a-z0-9]{15,})/gi);
        if (allIds) allIds.forEach(id => collectedIds.add(id));
    }

    function isBetter(newUrl, oldUrl) {
        if (!oldUrl) return true;
        if (oldUrl.includes('thumb') && !newUrl.includes('thumb')) return true;
        if (oldUrl.includes('sprite') && !newUrl.includes('sprite')) return true;
        if (!oldUrl.includes('source') && newUrl.includes('source')) return true;
        return false;
    }

    // ─── Scroll — window level, slow small steps ─────────────────────────
    async function autoScrollAndCollect() {
        log('Starting slow scroll to collect all items...');

        // Scroll to top first
        window.scrollTo(0, 0);
        await sleep(500);
        scrapeCurrentDOM();
        updateStats();

        const scrollStep = Math.floor(window.innerHeight * 0.5); // Half viewport per step
        let lastIdCount = 0;
        let stableRounds = 0;
        let totalSteps = 0;
        const maxSteps = 2000;

        while (stableRounds < 15 && totalSteps < maxSteps && !stopRequested) {
            // Scroll down one step
            window.scrollBy({ top: scrollStep, behavior: 'instant' });
            totalSteps++;

            // Wait for content to load/render
            await sleep(400);

            // Scrape whatever is currently visible
            scrapeCurrentDOM();

            // Check if we found new items
            if (collectedIds.size > lastIdCount) {
                stableRounds = 0;
                lastIdCount = collectedIds.size;
            } else {
                stableRounds++;
            }

            // Are we at the bottom?
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollHeight = document.documentElement.scrollHeight;
            const clientHeight = window.innerHeight;
            const atBottom = scrollTop + clientHeight >= scrollHeight - 20;

            if (atBottom && stableRounds >= 3) {
                // Try triggering more content by scrolling up a bit and back
                window.scrollBy({ top: -300, behavior: 'instant' });
                await sleep(300);
                window.scrollBy({ top: 400, behavior: 'instant' });
                await sleep(500);
                scrapeCurrentDOM();

                // Click any load-more buttons
                clickLoadMore();
                await sleep(500);
                scrapeCurrentDOM();

                if (collectedIds.size === lastIdCount) {
                    stableRounds += 2; // Accelerate toward exit
                } else {
                    stableRounds = 0;
                    lastIdCount = collectedIds.size;
                }
            }

            if (totalSteps % 10 === 0) {
                log(`Scrolling... ${collectedIds.size} IDs, ${collectedUrls.size} URLs (step ${totalSteps}, stable ${stableRounds})`);
                updateStats();
            }
        }

        // Final: scroll back up slowly to catch anything in the virtualized list
        log('Scrolling back up to catch missed items...');
        const totalH = document.documentElement.scrollHeight;
        for (let pos = totalH; pos >= 0 && !stopRequested; pos -= scrollStep) {
            window.scrollTo(0, pos);
            await sleep(250);
            scrapeCurrentDOM();
        }
        // And one more pass down
        for (let pos = 0; pos <= totalH && !stopRequested; pos += scrollStep * 2) {
            window.scrollTo(0, pos);
            await sleep(200);
            scrapeCurrentDOM();
        }

        log(stopRequested
            ? 'Stopped.'
            : `Scroll complete! ${collectedIds.size} IDs found, ${collectedUrls.size} have direct URLs. (${totalSteps} scroll steps)`);
        updateStats();
    }

    function clickLoadMore() {
        document.querySelectorAll('button, a, [role="button"]').forEach(b => {
            const t = (b.textContent || '').toLowerCase();
            if (['load more','show more','see more','view more','next page'].some(x => t.includes(x)))
                try { b.click(); } catch (e) {}
        });
    }

    // ─── Resolve URL from /g/ page ───────────────────────────────────────
    async function resolveUrl(genId) {
        if (resolvedItems.has(genId)) return resolvedItems.get(genId);
        try {
            const r = await fetch(`${window.location.origin}/g/${genId}`, { credentials: 'include' });
            if (!r.ok) return null;
            const html = await r.text();

            // Find videos.openai.com URLs
            const cdnUrls = html.match(/https:\/\/videos\.openai\.com\/[^"'\s\\<>]+/g);
            if (cdnUrls) {
                const imgs = cdnUrls.filter(u => /\.(webp|png|jpe?g)/i.test(u) && !/thumb|sprite/i.test(u));
                const vids = cdnUrls.filter(u => u.includes('.mp4'));
                const best = vids.find(u => u.includes('source')) || vids[0] || imgs[0] || cdnUrls[0];
                const clean = best.replace(/&amp;/g, '&');
                resolvedItems.set(genId, clean);
                return clean;
            }

            // Any media URL
            const media = html.match(/https?:\/\/[^"'\s\\<>]+\.(mp4|webp|png|jpe?g)(\?[^"'\s\\<>]*)?/gi);
            if (media) {
                const best = media.find(u => !/thumb|sprite|favicon/i.test(u)) || media[0];
                const clean = best.replace(/&amp;/g, '&');
                resolvedItems.set(genId, clean);
                return clean;
            }
            return null;
        } catch (e) { return null; }
    }

    // ─── Scan ────────────────────────────────────────────────────────────
    async function startScan() {
        if (isScanning) return;
        isScanning = true; stopRequested = false;
        collectedIds.clear(); collectedUrls.clear(); resolvedItems.clear();
        completedCount = 0; failedCount = 0;
        updateStats();

        const scanBtn = document.getElementById('sdl-scan');
        const dlBtn = document.getElementById('sdl-download');
        const stopBtn = document.getElementById('sdl-stop');
        scanBtn.disabled = true; scanBtn.textContent = 'Scanning...';
        dlBtn.disabled = true; stopBtn.disabled = false;

        await autoScrollAndCollect();

        if (collectedIds.size === 0) log('\u26a0\ufe0f No items found. Are you on the Library page?');

        isScanning = false;
        scanBtn.disabled = false; scanBtn.textContent = '1. Scan Library';
        dlBtn.disabled = collectedIds.size === 0; stopBtn.disabled = true;
        updateStats();
    }

    // ─── Download ────────────────────────────────────────────────────────
    function getFilename(genId, index, url) {
        const pattern = document.getElementById('sdl-naming')?.value || 'id';
        let ext = 'webp';
        if (url) {
            if (url.includes('.png')) ext = 'png';
            else if (/\.jpe?g/.test(url)) ext = 'jpg';
            else if (url.includes('.mp4')) ext = 'mp4';
        }
        return pattern === 'num'
            ? `sora_${String(index + 1).padStart(4, '0')}.${ext}`
            : `${genId}.${ext}`;
    }

    function downloadFile(url, filename) {
        return new Promise(resolve => {
            if (typeof GM_download === 'function') {
                GM_download({
                    url, name: `sora_downloads/${filename}`, saveAs: false,
                    onload: () => resolve(true),
                    onerror: () => dlViaBlob(url, filename).then(resolve),
                    ontimeout: () => dlViaBlob(url, filename).then(resolve),
                });
            } else dlViaBlob(url, filename).then(resolve);
        });
    }

    async function dlViaBlob(url, filename) {
        try {
            const r = await fetch(url);
            if (!r.ok) return false;
            const blob = await r.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = filename; a.style.display = 'none';
            document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
            return true;
        } catch (e) { return false; }
    }

    async function startDownload() {
        if (isDownloading || collectedIds.size === 0) return;
        isDownloading = true; stopRequested = false;
        completedCount = 0; failedCount = 0;
        const allIds = [...collectedIds];
        totalToDownload = allIds.length;
        const conc = Math.min(4, Math.max(1, parseInt(document.getElementById('sdl-concurrency')?.value) || 2));

        document.getElementById('sdl-download').disabled = true;
        document.getElementById('sdl-scan').disabled = true;
        document.getElementById('sdl-stop').disabled = false;

        const haveUrl = allIds.filter(id => collectedUrls.has(id)).length;
        log(`Downloading ${totalToDownload} (${haveUrl} have URLs, ${totalToDownload - haveUrl} need resolving, x${conc})...`);
        updateStats();

        let idx = 0;
        async function worker() {
            while (idx < allIds.length && !stopRequested) {
                const i = idx++;
                const id = allIds[i];
                let url = collectedUrls.get(id);

                if (!url) {
                    log(`[${i+1}/${totalToDownload}] Resolving ${id}...`);
                    url = await resolveUrl(id);
                    if (!url) { log(`\u274c No URL: ${id}`); failedCount++; updateStats(); continue; }
                }

                const fn = getFilename(id, i, url);
                log(`\u2b07\ufe0f [${i+1}/${totalToDownload}] ${fn}`);
                if (await downloadFile(url, fn)) completedCount++;
                else { failedCount++; log(`\u274c Failed: ${fn}`); }
                updateStats();
                await sleep(300);
            }
        }

        await Promise.all(Array.from({ length: conc }, () => worker()));
        log(`\u2705 Done! ${completedCount} ok, ${failedCount} failed.`);
        isDownloading = false;
        document.getElementById('sdl-download').disabled = false;
        document.getElementById('sdl-scan').disabled = false;
        document.getElementById('sdl-stop').disabled = true;
    }

    function stopAll() {
        stopRequested = true; isScanning = false; isDownloading = false;
        log('\ud83d\uded1 Stopped.');
        document.getElementById('sdl-scan').disabled = false;
        document.getElementById('sdl-scan').textContent = '1. Scan Library';
        document.getElementById('sdl-download').disabled = collectedIds.size === 0;
        document.getElementById('sdl-stop').disabled = true;
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function init() {
        createPanel();
        log('Ready. Go to your Library and click "Scan Library".');
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
})();
