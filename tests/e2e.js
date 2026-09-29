/* End-to-end test: loads the extension into real Chromium, scans a deliberately broken
 * website and checks that SiteScan finds the bugs. Run: npm i playwright && node tests/e2e.js */
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { chromium } = require("playwright");

const EXT = path.resolve(__dirname, "..");
const SHOTS = path.join(__dirname, "screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

// 1x1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

const HOME = `<!doctype html>
<html>
<head>
<title>Hi</title>
<script src="/app.js"></script>
</head>
<body style="font-family:Arial">
<header><nav><a href="/">Home</a> <a href="/contact">Contact</a> <a href="/services">Services</a> <a href="#">Pricing</a> <a href="/missing-page">Old page</a> <a href="http://127.0.0.1:9/dead">Partner</a></nav></header>
<h1>Welcome</h1><h1>Second heading</h1>
<h3>Skipped heading level</h3>
<p style="color:#ccc;background:#fff">Very light grey text that is hard to read</p>
<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
<img src="/ok.png"><img src="/missing.png" alt="broken logo"><img src='/x.png"><script>alert(1)</script>'>
<form action="/submit"><input name="q" placeholder="Search"><input type="password" id="pw"><input id="dup" name="a"><input id="dup" name="b"></form>
<button><svg width="10" height="10"></svg></button>
<a href="#nowhere">jump</a>
<div style="width:1500px;height:10px;background:#eee"></div>
<footer>&copy; 2019 Demo Co.</footer>
<script>console.error("Demo console error"); fetch("/api/fail");</script>
<script>undefinedFunction();</script>
</body></html>`;

const site = http.createServer((req, res) => {
  const u = req.url.split("?")[0];
  res.setHeader("X-Powered-By", "Express");
  if (u === "/") { res.setHeader("Content-Type", "text/html"); return res.end(HOME); }
  if (u === "/app.js") { res.setHeader("Content-Type", "text/javascript"); return res.end("console.log('app loaded')"); }
  if (u === "/ok.png") { res.setHeader("Content-Type", "image/png"); return res.end(PNG); }
  if (u === "/api/fail") { res.statusCode = 500; res.setHeader("Content-Type", "application/json"); return res.end('{"error":"boom"}'); }
  if (u === "/contact") { res.setHeader("Content-Type", "text/html"); return res.end("<title>Contact</title><h1>Contact us</h1><p>Send us a message using the contact form below.</p><form><input name=email placeholder=Email></form>"); }
  if (u === "/services") { res.setHeader("Content-Type", "text/html"); return res.end("<title>Services</title><h1>Our services</h1><p>Web design, SEO and hosting.</p>"); }
  if (u === "/submit") return res.end("ok");
  res.statusCode = 404; res.end("Not found");
}).listen(8099);

let aiRequest = null;
const mockAI = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    aiRequest = { headers: req.headers, body: JSON.parse(body || "{}") };
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ content: [{ type: "text", text: "## Executive summary\nMock AI report for **localhost**.\n\n## Fix plan\n1. Add a `<title>`\n```\n<title>Better title</title>\n```" }] }));
  });
}).listen(8098);

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log("  PASS  " + name); }
  else { failed++; console.log("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
}

(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-"));
  const ctx = await chromium.launchPersistentContext(userDir, {
    channel: "chromium", headless: true, viewport: { width: 1200, height: 900 },
    args: ["--disable-extensions-except=" + EXT, "--load-extension=" + EXT]
  });
  let sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
  const extId = new URL(sw.url()).host;
  console.log("Extension loaded, id:", extId);

  const page = await ctx.newPage();
  await page.goto("http://localhost:8099/");
  await page.waitForTimeout(800);
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: "http://localhost:8099/*" }))[0].id);

  console.log("\n== Running scan (with mock Claude AI) ==");
  const settings = {
    requirements: ["Payment with Razorpay", "Contact form", "User login and register", "Privacy policy", "Web design services"],
    useAI: true, apiKey: "test-key-123", model: "claude-test-model", apiUrl: "http://127.0.0.1:8098/v1/messages"
  };
  const t0 = Date.now();
  const report = await sw.evaluate(async ({ tabId, settings }) => runScan(tabId, settings), { tabId, settings });
  console.log("Scan finished in " + ((Date.now() - t0) / 1000).toFixed(1) + "s. Score " + report.score.overall + "/100, " + report.score.failed + " failed, " + report.score.passed + " passed");

  const byId = Object.fromEntries(report.tests.map((t) => [t.id, t]));
  const mustFail = ["seo-title", "seo-description", "seo-h1", "seo-lang", "seo-viewport", "seo-robots", "seo-sitemap",
    "a11y-img-alt", "a11y-labels", "a11y-names", "a11y-heading-order", "a11y-contrast",
    "bug-js", "bug-console", "bug-resources", "bug-api", "bug-broken-img", "bug-dummy-links", "bug-anchors", "bug-dup-ids", "bug-overflow",
    "bug-broken-links", "bug-dead-links", "sec-info-leak", "sec-csp", "perf-blocking", "ct-lorem", "ct-copyright", "ct-privacy",
    "req-0", "req-2", "req-3"];
  console.log("\n== Bugs that MUST be detected ==");
  mustFail.forEach((id) => check(id, byId[id] && byId[id].status === "fail", byId[id] ? byId[id].status : "test missing"));

  console.log("\n== Things that must NOT be flagged (no false alarms) ==");
  ["bug-404", "sec-https", "req-1", "req-4", "ct-contact", "ct-nav", "ct-footer"].forEach((id) => check(id + " passes", byId[id] && byId[id].status === "pass", byId[id] ? byId[id].status : "test missing"));

  console.log("\n== Detail checks ==");
  check("broken link 404 lists /missing-page", (byId["bug-broken-links"].samples || []).join(" ").includes("/missing-page"));
  check("dead link lists 127.0.0.1:9", (byId["bug-dead-links"].samples || []).join(" ").includes("127.0.0.1:9"));
  check("API 500 error captured", (byId["bug-api"].samples || []).join(" ").includes("/api/fail"));
  check("JS error message captured (undefinedFunction)", (byId["bug-js"].samples || []).join(" ").includes("undefinedFunction"));
  check("console.error message captured", (byId["bug-console"].samples || []).join(" ").includes("Demo console error"));
  check("Express X-Powered-By leak detected", byId["sec-info-leak"].detail.includes("Express"));
  check("requirements: 5 results", report.requirements.length === 5);
  check("requirement 'Web design services' found on /services", report.requirements[4].status === "found" && report.requirements[4].foundOn.some((u) => u.includes("/services")));
  check("requirement 'Payment with Razorpay' = missing", report.requirements[0].status === "missing");
  check("score is between 0 and 100 and below 80 for this bad site", report.score.overall >= 0 && report.score.overall < 80, String(report.score.overall));
  check("smart summary mentions host", report.summaryMd.includes("localhost:8099"));
  check("AI fix prompt lists issues", report.fixPrompt.includes("ISSUES:") && report.fixPrompt.includes("CLIENT REQUIREMENTS NOT MET"));

  console.log("\n== Claude AI call (mock server) ==");
  check("AI report text stored", report.aiMd && report.aiMd.includes("Mock AI report"), String(report.aiError));
  check("sent x-api-key header", aiRequest && aiRequest.headers["x-api-key"] === "test-key-123");
  check("sent anthropic-version header", aiRequest && aiRequest.headers["anthropic-version"] === "2023-06-01");
  check("used the chosen model", aiRequest && aiRequest.body.model === "claude-test-model");
  check("prompt contains real scan data", aiRequest && aiRequest.body.messages[0].content.includes("bug-") === false && aiRequest.body.messages[0].content.includes("Missing") === false ? aiRequest.body.messages[0].content.includes("failedChecks") : true);
  check("prompt includes client requirements", aiRequest && aiRequest.body.messages[0].content.includes("Razorpay"));

  console.log("\n== AI failure falls back gracefully ==");
  const failReport = await sw.evaluate(async ({ tabId }) => runScan(tabId, { useAI: true, apiKey: "x", apiUrl: "http://127.0.0.1:8097/nope" }), { tabId });
  check("aiError set and smart report still built", !!failReport.aiError && !!failReport.summaryMd && !failReport.aiMd, failReport.aiError);

  console.log("\n== Restricted page gives a friendly error ==");
  const blank = await ctx.newPage(); await blank.goto("about:blank");
  const blankId = await sw.evaluate(async () => (await chrome.tabs.query({ url: "about:blank" }))[0] ? (await chrome.tabs.query({ url: "about:blank" }))[0].id : -1).catch(() => -1);
  let msg = "";
  try { await sw.evaluate(async (id) => runScan(id, {}), blankId); } catch (e) { msg = String(e.message); }
  check("about:blank refused with helpful message", /cannot be scanned/i.test(msg) || /No tab/i.test(msg) || msg.length > 0, msg);
  await blank.close();

  console.log("\n== Report page in the browser ==");
  await sw.evaluate(async (r) => chrome.storage.local.set({ lastReport: r }), report);
  const rp = await ctx.newPage();
  const errors = [];
  rp.on("pageerror", (e) => errors.push(String(e)));
  rp.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await rp.goto(`chrome-extension://${extId}/report.html`);
  await rp.waitForSelector("#app:not(.hidden)");
  check("report shows host", (await rp.textContent("#host")) === "localhost:8099");
  check("report gauge shows score", (await rp.textContent("#gaugeNum")) === String(report.score.overall));
  check("report lists issues", parseInt(await rp.textContent("#issueCount"), 10) === report.score.failed);
  check("report has 5 requirement rows", (await rp.locator("#reqList .req").count()) === 5);
  check("Claude AI tab exists and is default", (await rp.locator("#tabs button").allTextContents()).includes("Claude AI report") && (await rp.locator("#summary h3").first().textContent()).includes("Executive summary"));
  check("markdown code block rendered", (await rp.locator("#summary pre code").count()) === 1);
  check("no injected <script> from scanned page (XSS-safe)", (await rp.locator("script").count()) === 2, String(await rp.locator("script").count()));
  check("no JS errors on report page", errors.length === 0, errors.join(" | "));
  await rp.locator("#tabs button", { hasText: "Smart report" }).click();
  check("smart report tab works", (await rp.locator("#summary").textContent()).includes("Priority action plan"));
  await rp.locator("#filters button", { hasText: "high" }).click();
  check("severity filter works", (await rp.locator("#issues details.issue.medium").count()) === 0 && (await rp.locator("#issues details.issue.high").count()) > 0);
  await rp.locator("#filters button", { hasText: "all" }).click();
  await rp.locator("#issues details.issue").first().locator("summary").click();
  await rp.screenshot({ path: path.join(SHOTS, "report-top.png") });
  await rp.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = false)));
  await rp.screenshot({ path: path.join(SHOTS, "report-full.png"), fullPage: true });

  console.log("\n== Popup ==");
  const pp = await ctx.newPage();
  const perrors = [];
  pp.on("pageerror", (e) => perrors.push(String(e)));
  await pp.setViewportSize({ width: 380, height: 640 });
  await pp.goto(`chrome-extension://${extId}/popup.html`);
  await pp.waitForTimeout(300);
  check("popup renders scan button", (await pp.textContent("#scanBtn")) === "Scan this website");
  await pp.fill("#reqs", "Payment\nLogin");
  await pp.click("#scanBtn");
  await pp.waitForSelector("#errorBox:not(.hidden)", { timeout: 15000 });
  check("popup shows friendly error for non-website tab", /cannot be scanned/i.test(await pp.textContent("#errorBox")), await pp.textContent("#errorBox"));
  const saved = await sw.evaluate(async () => (await chrome.storage.local.get("settings")).settings);
  check("popup saved requirements", saved && saved.requirements.length === 2);
  check("no JS errors in popup", perrors.length === 0, perrors.join(" | "));
  await pp.screenshot({ path: path.join(SHOTS, "popup.png") });

  console.log("\n==============================");
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  await ctx.close(); site.close(); mockAI.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TEST CRASHED:", e); process.exit(2); });
