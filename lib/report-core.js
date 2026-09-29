/* report-core.js
 * Pure logic shared by the background service worker, the report page and the Node tests.
 * No DOM / chrome.* APIs are used here, so it can be unit-tested with plain Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ReportCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var SEV_ORDER = ["critical", "high", "medium", "low", "info"];
  var PENALTY = { critical: 25, high: 15, medium: 8, low: 3, info: 0 };
  var WEIGHT = { Requirements: 1.5, Bugs: 1.5, Security: 1.2, Accessibility: 1, SEO: 1, Performance: 1, Content: 0.8 };
  var CATEGORY_ORDER = ["Requirements", "Bugs", "Security", "Accessibility", "SEO", "Performance", "Content"];

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function grade(score) {
    return score >= 90 ? "A" : score >= 80 ? "B" : score >= 65 ? "C" : score >= 50 ? "D" : "F";
  }

  // Same shape the in-page scanner produces.
  function makeTest(category, id, name, passed, o) {
    o = o || {};
    var sev = o.severity || "medium";
    return {
      category: category, id: id, name: name,
      status: passed ? "pass" : (sev === "info" ? "info" : "fail"),
      severity: passed ? "none" : sev,
      detail: o.detail || "",
      fix: passed ? "" : (o.fix || ""),
      code: passed ? "" : (o.code || ""),
      samples: (o.samples || []).slice(0, 5).map(String),
      count: o.count == null ? null : o.count
    };
  }

  function score(tests) {
    var cats = {};
    tests.forEach(function (t) {
      if (t.status !== "pass" && t.status !== "fail") return; // info items are not scored
      var c = cats[t.category] || (cats[t.category] = { name: t.category, pass: 0, fail: 0, penalty: 0 });
      if (t.status === "pass") c.pass++;
      else { c.fail++; c.penalty += PENALTY[t.severity] || 0; }
    });
    var wsum = 0, acc = 0;
    Object.keys(cats).forEach(function (name) {
      var c = cats[name];
      c.score = Math.max(0, 100 - c.penalty);
      c.grade = grade(c.score);
      var w = WEIGHT[name] || 1;
      wsum += w; acc += c.score * w;
    });
    var overall = wsum ? Math.round(acc / wsum) : 100;
    var counts = { critical: 0, high: 0, medium: 0, low: 0 };
    var passed = 0, failed = 0;
    tests.forEach(function (t) {
      if (t.status === "pass") passed++;
      else if (t.status === "fail") { failed++; counts[t.severity] = (counts[t.severity] || 0) + 1; }
    });
    return { overall: overall, grade: grade(overall), categories: cats, counts: counts, total: passed + failed, passed: passed, failed: failed };
  }

  function failedSorted(tests) {
    return tests.filter(function (t) { return t.status === "fail"; }).sort(function (a, b) {
      var d = SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity);
      if (d) return d;
      return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    });
  }

  function requirementCounts(reqs) {
    var c = { found: 0, partial: 0, missing: 0, unknown: 0 };
    (reqs || []).forEach(function (r) { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }

  function smartSummary(r) {
    var s = r.score, fails = failedSorted(r.tests), L = [];
    var cats = Object.keys(s.categories).map(function (k) { return s.categories[k]; }).sort(function (a, b) { return a.score - b.score; });

    L.push("## Executive summary");
    L.push("**" + r.host + "** scored **" + s.overall + "/100 (grade " + s.grade + ")**. SiteScan ran " + s.total +
      " automated checks: " + s.passed + " passed and " + s.failed + " failed (" + s.counts.critical + " critical, " +
      s.counts.high + " high, " + s.counts.medium + " medium, " + s.counts.low + " low).");
    if (cats.length > 1) {
      L.push("Weakest area: **" + cats[0].name + "** (" + cats[0].score + "/100). Strongest area: **" +
        cats[cats.length - 1].name + "** (" + cats[cats.length - 1].score + "/100).");
    }
    var verdict = s.grade === "A" ? "The site is in very good shape. Only small polish items remain."
      : s.grade === "B" ? "The site is in good shape, but fix the items below before calling it production-ready."
      : s.grade === "C" ? "The site works but has clear quality gaps that visitors or search engines will notice."
      : s.grade === "D" ? "The site has serious gaps. It should not be shown to a client before the high-priority items are fixed."
      : "The site has critical problems and needs significant work before release.";
    L.push(verdict);

    var rq = r.requirements || [];
    if (rq.length) {
      var rc = requirementCounts(rq);
      L.push("");
      L.push("## Client requirements check");
      L.push(rc.found + " of " + rq.length + " requirements were found on the scanned pages, " + rc.partial + " partially, " + rc.missing + " not found.");
      rq.filter(function (q) { return q.status === "missing" || q.status === "partial"; }).forEach(function (q) {
        L.push("- **" + (q.status === "missing" ? "Missing" : "Partial") + ":** " + q.text +
          (q.missing && q.missing.length ? " (keywords not seen: " + q.missing.join(", ") + ")" : ""));
      });
      L.push("Note: this is keyword-based. A feature behind a login, or on a route the scanner could not open, may exist but not be detected.");
    }

    L.push("");
    L.push("## Priority action plan");
    if (!fails.length) L.push("No failed checks. Nice work.");
    fails.slice(0, 10).forEach(function (t, i) {
      L.push((i + 1) + ". **[" + t.severity.toUpperCase() + "] " + t.name + "** (" + t.category + "). " + (t.fix || t.detail));
    });
    if (fails.length > 10) L.push("...and " + (fails.length - 10) + " more issues listed below.");

    L.push("");
    L.push("## How to use this report");
    L.push("- Fix critical and high items first, then rescan to see the score go up.");
    L.push("- Use the **Copy AI fix prompt** button and paste it into Claude, ChatGPT or Copilot together with your source code to get exact code changes.");
    L.push("- Limits: this is an automated scan of the page you opened" + ((r.pagesScanned && r.pagesScanned.length) ? " plus " + r.pagesScanned.length + " linked page(s)" : "") +
      ". It cannot log in, test payments or check business logic, so keep manual testing for those.");
    if (r.errorCapture === false) {
      L.push("- Runtime errors could not be captured because the page was open before the extension loaded. Reload the page and scan again for console/network error results.");
    }
    return L.join("\n");
  }

  function buildFixPrompt(r) {
    var fails = failedSorted(r.tests), L = [];
    L.push("You are a senior full-stack web developer. I ran an automated audit on my website (" + r.url + ") and it found the problems below.");
    L.push("Fix them in my codebase. For every issue: give the root cause in one line, then the exact code change (file path, before and after). Start with the highest severity. Do not change unrelated code. If you need a file to give an exact fix, ask me for it.");
    L.push("");
    L.push("AUDIT SCORE: " + r.score.overall + "/100");
    L.push("");
    L.push("ISSUES:");
    fails.forEach(function (t, i) {
      L.push((i + 1) + ". [" + t.severity.toUpperCase() + "] " + t.category + ": " + t.name);
      if (t.detail) L.push("   Details: " + t.detail);
      if (t.samples && t.samples.length) L.push("   Examples: " + t.samples.join(" | "));
      if (t.fix) L.push("   Suggested direction: " + t.fix);
    });
    var missing = (r.requirements || []).filter(function (q) { return q.status === "missing" || q.status === "partial"; });
    if (missing.length) {
      L.push("");
      L.push("CLIENT REQUIREMENTS NOT MET (implement them, or tell me what is needed):");
      missing.forEach(function (q) { L.push("- " + q.text); });
    }
    return L.join("\n");
  }

  function aiPayload(r) {
    var fails = failedSorted(r.tests);
    var cats = {};
    Object.keys(r.score.categories).forEach(function (k) { cats[k] = r.score.categories[k].score; });
    return {
      site: r.url,
      title: r.title,
      overallScore: r.score.overall,
      categoryScores: cats,
      stats: r.stats,
      failedChecks: fails.slice(0, 45).map(function (t) {
        return { severity: t.severity, category: t.category, check: t.name, detail: t.detail, examples: (t.samples || []).slice(0, 3), count: t.count };
      }),
      passedChecks: r.tests.filter(function (t) { return t.status === "pass"; }).slice(0, 40).map(function (t) { return t.name; }),
      clientRequirements: (r.requirements || []).map(function (q) { return { requirement: q.text, status: q.status, keywordsNotSeen: q.missing }; }),
      pageSummary: String(r.pageSummary || "").slice(0, 5000),
      limitations: [
        "Automated scan of one page plus a few linked pages; no login, payment or business-logic testing.",
        "Requirement matching is keyword based and can miss features on other routes or behind login."
      ]
    };
  }

  function aiPrompt(payload) {
    return [
      "You are a senior web QA engineer and product consultant. Below is JSON data from an automated website audit (SiteScan AI).",
      "Write a client-ready audit report in Markdown with exactly these sections:",
      "## Executive summary (max 120 words, plain language, mention the score)",
      "## Gaps versus the client's requirements (use clientRequirements; say what is missing and what to build)",
      "## Bugs and issues (group them, explain the business impact of each group)",
      "## Fix plan (top 10 fixes ordered by impact versus effort, with short code snippets where possible)",
      "## Suggested test cases (10 concrete manual or automated test cases for this site)",
      "## Quick wins for this week",
      "Rules: use ONLY the data given, never invent findings. If data is missing or uncertain, say so. Do not use tables. Keep code snippets short.",
      "",
      "DATA:",
      JSON.stringify(payload)
    ].join("\n");
  }

  function build(scan, extraTests, opts) {
    opts = opts || {};
    var tests = (scan.tests || []).concat(extraTests || []);
    var report = {
      id: String(Date.now()),
      createdAt: new Date().toISOString(),
      url: scan.url, host: scan.host, title: scan.title,
      stats: scan.stats || {},
      requirements: scan.requirements || [],
      pagesScanned: scan.pagesScanned || [],
      pageSummary: scan.pageSummary || "",
      errorCapture: scan.errorCapture,
      tests: tests,
      score: score(tests),
      aiMd: null, aiError: null, aiModel: null
    };
    report.summaryMd = smartSummary(report);
    report.fixPrompt = buildFixPrompt(report);
    return report;
  }

  function toMarkdown(r) {
    var L = [];
    L.push("# Website audit: " + r.host);
    L.push("");
    L.push("- URL: " + r.url);
    L.push("- Scanned: " + r.createdAt);
    L.push("- Overall score: " + r.score.overall + "/100 (grade " + r.score.grade + ")");
    L.push("");
    L.push("## Category scores");
    CATEGORY_ORDER.forEach(function (k) {
      var c = r.score.categories[k];
      if (c) L.push("- " + k + ": " + c.score + "/100 (" + c.pass + " passed, " + c.fail + " failed)");
    });
    L.push("");
    L.push(r.summaryMd);
    if (r.aiMd) { L.push(""); L.push("# AI report"); L.push(r.aiMd); }
    L.push("");
    L.push("## All issues");
    failedSorted(r.tests).forEach(function (t) {
      L.push("### [" + t.severity.toUpperCase() + "] " + t.name + " (" + t.category + ")");
      if (t.detail) L.push(t.detail);
      if (t.samples && t.samples.length) L.push("Examples: " + t.samples.join(" | "));
      if (t.fix) L.push("**Fix:** " + t.fix);
      if (t.code) { L.push("```"); L.push(t.code); L.push("```"); }
      L.push("");
    });
    L.push("## Passed checks");
    r.tests.filter(function (t) { return t.status === "pass"; }).forEach(function (t) { L.push("- " + t.name); });
    return L.join("\n");
  }

  // Tiny, safe Markdown -> HTML (everything is escaped first).
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return s;
  }
  function renderMarkdown(md) {
    var lines = String(md || "").split("\n"), html = "", list = null, inCode = false, code = [];
    function closeList() { if (list) { html += "</" + list + ">"; list = null; } }
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i], line = raw.replace(/\s+$/, ""), m;
      if (/^```/.test(line)) {
        if (inCode) { html += "<pre><code>" + esc(code.join("\n")) + "</code></pre>"; code = []; inCode = false; }
        else { closeList(); inCode = true; }
        continue;
      }
      if (inCode) { code.push(raw); continue; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { closeList(); var n = Math.min(m[1].length + 1, 6); html += "<h" + n + ">" + inline(m[2]) + "</h" + n + ">"; continue; }
      if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; } html += "<li>" + inline(m[1]) + "</li>"; continue; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; } html += "<li>" + inline(m[1]) + "</li>"; continue; }
      if (!line.trim()) { closeList(); continue; }
      closeList();
      html += "<p>" + inline(line) + "</p>";
    }
    if (inCode) html += "<pre><code>" + esc(code.join("\n")) + "</code></pre>";
    closeList();
    return html;
  }

  return {
    SEV_ORDER: SEV_ORDER, CATEGORY_ORDER: CATEGORY_ORDER,
    makeTest: makeTest, score: score, grade: grade, failedSorted: failedSorted, requirementCounts: requirementCounts,
    smartSummary: smartSummary, buildFixPrompt: buildFixPrompt, aiPayload: aiPayload, aiPrompt: aiPrompt,
    build: build, toMarkdown: toMarkdown, renderMarkdown: renderMarkdown, esc: esc
  };
});
