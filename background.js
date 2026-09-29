/* background.js - MV3 service worker.
 * Orchestrates a scan: in-page tests -> link checks -> security headers -> robots/sitemap -> report -> optional Claude AI.
 */
importScripts("lib/report-core.js");

var DEFAULT_API = "https://api.anthropic.com/v1/messages";
var DEFAULT_MODEL = "claude-sonnet-5";

function progress(msg, pct) {
  try { chrome.runtime.sendMessage({ type: "PROGRESS", msg: msg, pct: pct }).catch(function () {}); } catch (e) {}
}

async function fetchWithTimeout(url, opts, ms) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, ms);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal })); }
  finally { clearTimeout(t); }
}
function drop(res) { try { if (res && res.body) res.body.cancel(); } catch (e) {} }

async function checkUrl(url) {
  var base = { cache: "no-store", credentials: "omit", redirect: "follow" };
  try {
    var res = await fetchWithTimeout(url, Object.assign({ method: "HEAD" }, base), 8000);
    if (res.status >= 400) { res = await fetchWithTimeout(url, Object.assign({ method: "GET" }, base), 8000); drop(res); }
    return { url: url, status: res.status };
  } catch (e) {
    try {
      var r2 = await fetchWithTimeout(url, Object.assign({ method: "GET" }, base), 8000);
      drop(r2);
      return { url: url, status: r2.status };
    } catch (e2) {
      return { url: url, status: 0, error: e2 && e2.name === "AbortError" ? "timeout" : String((e2 && e2.message) || e2) };
    }
  }
}

async function pool(items, n, fn) {
  var out = new Array(items.length), i = 0;
  var workers = [];
  for (var w = 0; w < Math.min(n, items.length); w++) {
    workers.push((async function () {
      while (i < items.length) { var idx = i++; out[idx] = await fn(items[idx]); }
    })());
  }
  await Promise.all(workers);
  return out;
}

var T = ReportCore.makeTest;

function linkTests(results) {
  var broken = results.filter(function (r) { return r.status === 404 || r.status === 410; });
  var server = results.filter(function (r) { return r.status >= 500; });
  var dead = results.filter(function (r) { return r.status === 0; });
  var fmt = function (r) { return (r.status || r.error || "failed") + " " + r.url; };
  return [
    T("Bugs", "bug-broken-links", "No broken links (404 / 410)", broken.length === 0, {
      severity: "high", count: broken.length, detail: broken.length + " of " + results.length + " checked links return Not Found.",
      samples: broken.map(fmt), fix: "Update or remove these links, or add redirects for pages that moved."
    }),
    T("Bugs", "bug-server-links", "No links returning server errors (5xx)", server.length === 0, {
      severity: "high", count: server.length, detail: server.length + " linked pages crash on the server.", samples: server.map(fmt),
      fix: "Check the server logs for these URLs."
    }),
    T("Bugs", "bug-dead-links", "All links reachable (no timeouts / DNS errors)", dead.length === 0, {
      severity: "medium", count: dead.length, detail: dead.length + " links could not be reached (site down, wrong domain or blocked).",
      samples: dead.map(fmt), fix: "Open them manually; remove or correct dead links."
    })
  ];
}

async function headerTests(pageUrl) {
  var u = new URL(pageUrl);
  var local = /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(u.hostname);
  var res;
  try {
    res = await fetchWithTimeout(pageUrl, { method: "GET", cache: "no-store", credentials: "omit", redirect: "follow" }, 10000);
    drop(res);
  } catch (e) { return []; }
  var h = function (n) { return res.headers.get(n); };
  var tests = [];
  if (u.protocol === "https:" && !local) {
    tests.push(T("Security", "sec-hsts", "HSTS header (forces HTTPS)", !!h("strict-transport-security"), {
      severity: "medium", detail: "Strict-Transport-Security header is missing.", fix: "Send Strict-Transport-Security: max-age=31536000; includeSubDomains."
    }));
  }
  tests.push(T("Security", "sec-csp", "Content-Security-Policy header", !!h("content-security-policy"), {
    severity: "low", detail: "No CSP header. It limits damage from XSS attacks.", fix: "Add a Content-Security-Policy header (helmet does this for Express)."
  }));
  var xfo = h("x-frame-options"), csp = h("content-security-policy") || "";
  tests.push(T("Security", "sec-clickjack", "Clickjacking protection (X-Frame-Options / frame-ancestors)", !!xfo || /frame-ancestors/i.test(csp), {
    severity: "low", detail: "Other sites can embed this page in a hidden iframe.", fix: "Send X-Frame-Options: SAMEORIGIN or CSP frame-ancestors 'self'."
  }));
  tests.push(T("Security", "sec-nosniff", "X-Content-Type-Options: nosniff", /nosniff/i.test(h("x-content-type-options") || ""), {
    severity: "low", detail: "Browsers may guess file types, which can be abused.", fix: "Send X-Content-Type-Options: nosniff."
  }));
  tests.push(T("Security", "sec-referrer", "Referrer-Policy header", !!h("referrer-policy"), {
    severity: "low", detail: "Full URLs may leak to other sites.", fix: "Send Referrer-Policy: strict-origin-when-cross-origin."
  }));
  var powered = h("x-powered-by"), server = h("server") || "";
  var leak = !!powered || /\d+\.\d+/.test(server);
  tests.push(T("Security", "sec-info-leak", "Server does not reveal its technology/version", !leak, {
    severity: "low", detail: "Headers reveal: " + [powered ? "X-Powered-By: " + powered : "", /\d+\.\d+/.test(server) ? "Server: " + server : ""].filter(Boolean).join(", "),
    fix: "Hide the details. In Express: app.disable('x-powered-by') or use helmet().",
    code: "import helmet from \"helmet\";\napp.use(helmet()); // also removes X-Powered-By and adds security headers"
  }));
  var enc = h("content-encoding") || "";
  tests.push(T("Performance", "perf-compress", "HTML is compressed (gzip / brotli)", /gzip|br|zstd|deflate/i.test(enc), {
    severity: local ? "low" : "medium", detail: "Content-Encoding header is missing, so pages are sent uncompressed" + (local ? " (normal for local dev servers)." : "."),
    fix: "Enable compression. In Express: npm i compression, then app.use(compression()). On Nginx/Cloudflare enable gzip/brotli."
  }));
  return tests;
}

async function fileTests(origin) {
  async function get(p) {
    try {
      var r = await fetchWithTimeout(origin + p, { cache: "no-store", credentials: "omit" }, 6000);
      var t = (await r.text()).slice(0, 400);
      return { status: r.status, text: t };
    } catch (e) { return { status: 0, text: "" }; }
  }
  var rand = Math.random().toString(36).slice(2, 8);
  var out = await Promise.all([get("/robots.txt"), get("/sitemap.xml"), get("/__sitescan_404_check_" + rand)]);
  var robots = out[0], sitemap = out[1], nf = out[2];
  var looksHtml = function (t) { return /^\s*<(!doctype|html)/i.test(t); };
  return [
    T("SEO", "seo-robots", "robots.txt exists", robots.status === 200 && !looksHtml(robots.text) && /user-agent|sitemap|disallow/i.test(robots.text), {
      severity: "low", detail: "No valid /robots.txt found.", fix: "Create /robots.txt.", code: "User-agent: *\nAllow: /\nSitemap: " + origin + "/sitemap.xml"
    }),
    T("SEO", "seo-sitemap", "sitemap.xml exists", sitemap.status === 200 && /<urlset|<sitemapindex/i.test(sitemap.text), {
      severity: "low", detail: "No valid /sitemap.xml found, so search engines discover pages more slowly.", fix: "Generate a sitemap.xml and submit it in Google Search Console."
    }),
    T("Bugs", "bug-404", "Unknown URLs return a real 404 status", nf.status === 404, {
      severity: "low", detail: "A made-up URL returned HTTP " + (nf.status || "no response") + ". Single-page apps often do this; make sure users still see a proper Not Found page and search engines get a 404.",
      fix: "Add a catch-all route that shows a Not Found page (and returns 404 from the server where possible)."
    })
  ];
}

async function askClaude(settings, report) {
  var apiUrl = settings.apiUrl || DEFAULT_API;
  var model = settings.model || DEFAULT_MODEL;
  var res = await fetchWithTimeout(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 4000,
      messages: [{ role: "user", content: ReportCore.aiPrompt(ReportCore.aiPayload(report)) }]
    })
  }, 120000);
  var data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    var m = data && data.error && (data.error.message || data.error.type);
    throw new Error("Claude API error " + res.status + (m ? ": " + m : ""));
  }
  var text = (data && data.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("\n").trim();
  if (!text) throw new Error("Claude returned an empty answer.");
  return { text: text, model: model };
}

async function runScan(tabId, settings) {
  settings = settings || {};
  var tab = await chrome.tabs.get(tabId);
  if (!/^https?:/i.test(tab.url || "")) {
    throw new Error("This page cannot be scanned. Open a normal website (http/https) in the tab and try again.");
  }
  var requirements = (settings.requirements || []).map(function (s) { return String(s).trim(); }).filter(Boolean).slice(0, 30);

  progress("Running page tests (SEO, accessibility, bugs, performance)...", 10);
  try {
    await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ["content/scanner.js"] });
  } catch (e) {
    throw new Error("Chrome does not allow scanning this page (" + (e && e.message ? e.message : e) + ").");
  }
  var inj = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function (o) { return window.__siteScan(o); },
    args: [{ requirements: requirements }]
  });
  var scan = inj && inj[0] && inj[0].result;
  if (!scan) throw new Error("The scanner returned no data. Reload the page and try again.");

  progress("Checking links for errors...", 40);
  var linkResults = await pool((scan.links || []).slice(0, 40).map(function (l) { return l.href; }), 6, checkUrl);
  var extra = linkTests(linkResults);

  progress("Checking security headers, robots.txt and sitemap...", 60);
  var origin = new URL(scan.url).origin;
  var more = await Promise.all([headerTests(scan.url), fileTests(origin)]);
  extra = extra.concat(more[0], more[1]);
  scan.stats.linksChecked = linkResults.length;

  progress("Building report...", 75);
  var report = ReportCore.build(scan, extra);

  if (settings.useAI && settings.apiKey) {
    progress("Asking Claude to write the AI report...", 85);
    try {
      var ai = await askClaude(settings, report);
      report.aiMd = ai.text;
      report.aiModel = ai.model;
    } catch (e) {
      report.aiError = String((e && e.message) || e);
    }
  }
  progress("Done", 100);
  return report;
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === "SCAN") {
    (async function () {
      try {
        var report = await runScan(msg.tabId, msg.settings || {});
        var store = await chrome.storage.local.get("history");
        var history = (store.history || []).filter(function (h) { return h.id !== report.id; });
        history.unshift({ id: report.id, host: report.host, url: report.url, score: report.score.overall, createdAt: report.createdAt });
        await chrome.storage.local.set({ lastReport: report, history: history.slice(0, 10) });
        if (msg.open !== false) await chrome.tabs.create({ url: chrome.runtime.getURL("report.html") });
        sendResponse({ ok: true, score: report.score.overall, failed: report.score.failed, aiError: report.aiError });
      } catch (e) {
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      }
    })();
    return true; // keep the message channel open for the async response
  }
});
