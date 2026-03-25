# Sora – Bulk Library Downloader

A Tampermonkey userscript that bulk-downloads all of your generated images and videos from [sora.chatgpt.com](https://sora.chatgpt.com). It auto-scrolls through Sora's virtualized infinite-scroll library, collects every item, and downloads them all.

---

## Step 1 — Install Tampermonkey

First, install the Tampermonkey browser extension if you haven't already:

* **Chrome** → [Install from Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
* **Firefox** → [Install from Firefox Add-ons](https://addons.mozilla.org/firefox/addon/tampermonkey/)
* **Edge** → [Install from Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
* **Safari** → [Install from App Store](https://www.tampermonkey.net/?browser=safari)

---

## Step 2 — Configure Tampermonkey (Do This Before Installing the Script)

After installing Tampermonkey, you need to enable a setting or the script will not work.

1. Go to `chrome://extensions` in your address bar
2. Find **Tampermonkey** and click **Details**
3. Scroll down and turn on **"Allow User Scripts"**

> This allows Tampermonkey to run scripts that have not been reviewed by Google. You should only enable this if you trust the script you are installing.

4. On the same page, also turn on **"Allow in Incognito"** if you want the script to work in private/incognito windows

> Without this the script will only run in normal browser windows.

Once both settings are enabled, proceed to installation below.

---

## Features

* **Auto-scroll scanning** — scrolls through your entire Sora library automatically, collecting every generation
* **Handles virtualized lists** — Sora only renders ~20 tiles in the DOM at a time; the script polls the DOM continuously during scrolling to catch items before they're recycled
* **Multi-pass collection** — scrolls down, back up, and down again to maximize coverage
* **Direct CDN URL capture** — grabs full-resolution image/video URLs directly from rendered tiles (fastest method)
* **Fallback resolution** — for items missed during scrolling, fetches the individual `/g/` page to extract the download URL
* **Concurrent downloads** — configurable 1–4 parallel downloads
* **Image and video support** — downloads `.webp`, `.png`, `.jpg`, and `.mp4` files
* **Filename options** — save by generation ID or numbered sequence (0001, 0002, ...)
* **Stop button** — cancel scanning or downloading at any time
* **No API key needed** — uses your existing browser session cookies
* **No page interference** — runs alongside Sora's own page without conflicts

---

## Requirements

* [Tampermonkey](https://www.tampermonkey.net/) browser extension (Chrome, Firefox, Edge, Safari)
* A [ChatGPT](https://chatgpt.com) account with access to Sora
* Generated content in your Sora library

---

## Step 3 — Installation

1. Click the `sora-bulk-downloader.user.js` file in this repo — Tampermonkey should automatically prompt you to install it
2. Alternatively, open the Tampermonkey dashboard → click **Create new script** → paste the entire script contents → save

---

## How to Use

1. Go to **[sora.chatgpt.com](https://sora.chatgpt.com)** and navigate to your **Library** page
2. Make sure the page has fully loaded
3. You'll see a **download panel** in the top-right corner of the page
4. Click **"1. Scan Library"** — the script will auto-scroll through your entire library

### Panel Options

| Option | What it does |
| --- | --- |
| **Filename pattern** | `ID only` saves as `gen_01kh0pb33kec8.webp`; `Numbered` saves as `sora_0001.webp`, `sora_0002.webp`, etc. |
| **Concurrent downloads** | Number of parallel downloads (1–4). Lower is safer, higher is faster. |
| **1. Scan Library** | Auto-scrolls the page and collects all generation IDs + image URLs |
| **2. Download All** | Downloads everything that was found during scanning |
| **Stop** | Cancels the current scan or download |
| **Clear** | Resets all collected data so you can start fresh |

5. Watch the **IDs** counter climb as the script scrolls (20 → 40 → 60 → ...)
6. When scanning completes, click **"2. Download All"**
7. Files are saved to your browser's default **Downloads** folder under a `sora_downloads/` subfolder

> **Tip:** Disable "Ask where to save each file" in your browser's download settings, otherwise you'll get a save dialog for every single file.

---

## How It Works

### Why Not Use the API?

Sora's web app uses **React Server Components (RSC)** for data loading, which streams data through the HTML document itself rather than client-side `fetch`/`XHR` calls. This means traditional API interception (hooking `fetch` or `XMLHttpRequest`) doesn't work — the requests are invisible to JavaScript running on the page.

### DOM Scraping Approach

Instead of API interception, the script works directly with the rendered page:

1. **Scrolls the window** in half-viewport increments (using `window.scrollBy`)
2. **Waits 400ms** after each step for Sora's infinite scroll to fetch and render new tiles
3. **Scrapes the DOM** at every step, collecting:
   - Generation IDs from `<a href="/g/gen_xxxxx">` links
   - Full-res CDN image URLs from `<img src>` and `<img srcset>` attributes
   - Video URLs from `<video>` and `<source>` elements
4. **Handles the virtualized list** — Sora only keeps ~20 tiles in the DOM at once and recycles them as you scroll. The script polls continuously to catch each batch before it's removed.
5. **Multi-pass scanning** — after reaching the bottom, scrolls back up and down again to catch any items that were missed

### URL Resolution Fallback

For items where the CDN URL wasn't captured from the DOM (e.g., the tile rendered too briefly), the script falls back to fetching the individual `/g/{id}` page and searching for `videos.openai.com` URLs in the HTML.

### Download URLs

Images and videos are hosted on Azure Blob Storage via `videos.openai.com`:

```
https://videos.openai.com/az/vg-assets/task_{id}/...img_0.webp?se=...&sig=...
```

These URLs contain time-limited SAS tokens, so they should be downloaded promptly after scanning.

---

## Troubleshooting

**Panel doesn't appear**

Make sure "Allow User Scripts" is enabled in Tampermonkey's settings (see Step 2). Then refresh the page.

**Script not running on the page**

Go to `chrome://extensions` → Tampermonkey → Details and make sure "Allow User Scripts" is toggled on. Also try navigating directly to `https://sora.chatgpt.com` by typing it in the address bar rather than clicking through the site.

**Only finding ~20 items**

The script might not be scrolling correctly. Make sure you are on the **Library** page (not the home or explore page). If the issue persists, try reducing the scroll speed by editing the script — change `window.innerHeight * 0.5` to `window.innerHeight * 0.3` in the `autoScrollAndCollect` function.

**Downloads fail (0 succeeded)**

The CDN URLs contain time-limited auth tokens. If you wait too long between scanning and downloading, they may expire. **Download promptly after scanning.** You can also try re-scanning to get fresh URLs.

**Some items show "No URL" during download**

These are items where the script couldn't find a download URL from the DOM or the `/g/` page. This can happen if the generation is still processing, was deleted, or the page structure changed.

**Want to check what's happening under the hood**

Open DevTools (F12) → Console tab. You can also watch the log panel inside the script's UI in the top-right corner of the page.

---

## Privacy

This script runs entirely inside your browser. It only communicates with `sora.chatgpt.com` and `videos.openai.com` to fetch your own media. No data is sent to any third-party server.

---

## Disclaimer

This is an unofficial tool not affiliated with OpenAI. It scrapes Sora's rendered page which may change at any time. Use at your own risk and only to download your own content. Please respect OpenAI's [Terms of Use](https://openai.com/policies/terms-of-use).

---

## License

MIT — use it however you want.

---

## Contributing

Issues and PRs welcome! If the script breaks due to a Sora UI update, the most likely fix is updating the DOM selectors in `scrapeCurrentDOM()` or the scroll logic in `autoScrollAndCollect()`.
