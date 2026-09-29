# SiteScan AI — Website Auditor Chrome Extension

Scans any website you open in Chrome and reports what's missing, what's broken,
and what to fix — as a client-ready report. Optionally uses Claude to write a
polished AI report on top of the same data.

## What it checks (82 automated tests)
- **Requirements** — paste your client's requirement list; SiteScan checks the site
  (plus a few linked pages) for each one and marks it Found / Partial / Missing
- **Bugs** — JavaScript errors, failed API calls, broken images, broken links (404s),
  dead links, duplicate IDs, dummy links, horizontal scroll overflow, and more
- **Security** — HTTPS, mixed content, security headers (CSP, HSTS, X-Frame-Options),
  server info leaks, insecure forms
- **Accessibility** — missing alt text, unlabeled form fields, heading order,
  colour contrast (WCAG AA approximate), icon-only buttons with no label
- **SEO** — title/description length, canonical tag, Open Graph tags, robots.txt,
  sitemap.xml, viewport tag
- **Performance** — load time, Largest Contentful Paint, Cumulative Layout Shift,
  page weight, oversized images/scripts, render-blocking scripts
- **Content** — placeholder text ("lorem ipsum"), "coming soon" text, missing
  contact/privacy/terms links, no clear call-to-action

Every failed check includes **why it matters** and **how to fix it** (often with
a code snippet).

## Install (Developer Mode — this isn't on the Chrome Web Store)
1. Unzip this folder somewhere permanent (don't delete it after installing —
   Chrome loads the extension from this folder every time).
2. Open Chrome, go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this `sitescan-extension` folder.
4. Pin the extension (puzzle-piece icon in the toolbar → pin SiteScan AI).

## How to use it
1. Open the website you want to audit in a tab (reload it first, so SiteScan can
   catch runtime errors from the very start of the page load).
2. Click the SiteScan AI icon.
3. (Optional) Paste your client's requirements, one per line, e.g.:
   ```
   Payment with Razorpay
   User login and register
   Contact form
   Privacy policy
   Live chat
   ```
4. Click **Scan this website**. A report opens in a new tab in a few seconds.
5. Use the buttons at the top: **Print/Save PDF** to send to a client,
   **Copy AI fix prompt** to paste into Claude/ChatGPT/Copilot together with
   your code for exact fixes, or **Download report (.md / .json)**.

## Optional: full AI-written report (Claude)
By default SiteScan builds a report with its own built-in logic — no API key,
fully free, fully offline. If you want a nicer, Claude-written narrative report:
1. In the popup, open **Claude AI report (optional)**.
2. Tick the checkbox and paste an Anthropic API key (from console.anthropic.com).
3. Scan as normal. The report page will show a "Claude AI report" tab.

The key is stored only in your browser (`chrome.storage.local`) and is sent
directly to Anthropic's API — never anywhere else. Use a key with a spend limit.
If the AI call fails for any reason, the built-in report is still shown, so a
scan never fails just because AI is unavailable.

## Limits (read this before you trust a report)
- It's an automated scan of the page you open, plus a few same-site linked pages —
  it cannot log in, complete payments, or test business logic.
- Requirement matching is **keyword-based**. A feature behind a login, or on a
  route the scanner didn't open, may exist but show as "Missing".
- Colour-contrast and a few checks are approximations, not a full WCAG audit.
- Treat it as a strong first pass, not a replacement for manual QA.

## Project structure
```
sitescan-extension/
├── manifest.json
├── background.js       # runs the scan: link checks, security headers, Claude call
├── popup.html/js/css    # the toolbar popup
├── report.html/js/css   # the full report page
├── content/
│   ├── scanner.js       # 82 in-page tests (SEO, a11y, perf, security, bugs, content)
│   ├── inject.js        # catches page JS errors / failed fetches (runs in page)
│   └── collector.js     # collects what inject.js reports
├── lib/report-core.js   # scoring, smart summary, AI prompt building (shared, testable)
├── icons/
└── tests/e2e.js         # Playwright test: loads the real extension in Chromium
                          # against a deliberately broken test site and checks
                          # every category of bug is actually detected
```

## Running the tests yourself
```bash
npm install playwright
node tests/e2e.js
```
This launches real Chromium with the extension loaded, serves a small website
full of planted bugs, runs a full scan (with a mock Claude server), and checks
that every bug type, the requirements matcher, the report page and the popup
all work correctly. Last run: **73/73 checks passed.**

## Known simplifications
- The colour-contrast check samples up to 250 visible text elements and skips
  text over images/gradients (cannot reliably compute contrast there).
- Link checking follows up to 40 links from the current page and 8 linked pages
  for requirement matching, to keep scans fast.
- This audits **public-facing content**; it does not test authenticated areas,
  payment flows, or server-side business logic.
