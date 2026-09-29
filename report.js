(function () {
  var RC = ReportCore, $ = function (id) { return document.getElementById(id); };
  var report = null, filter = "all", activeTab = "smart";

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function colorFor(n) { return n >= 80 ? "#16a34a" : n >= 65 ? "#f59e0b" : n >= 50 ? "#f97316" : "#dc2626"; }
  function download(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  function renderOverview() {
    var s = report.score;
    $("host").textContent = report.host;
    $("meta").textContent = report.url + "  ·  scanned " + new Date(report.createdAt).toLocaleString();
    $("gaugeNum").textContent = s.overall;
    $("gauge").style.setProperty("--p", s.overall);
    $("gauge").style.setProperty("--c", colorFor(s.overall));
    $("gradeLine").textContent = "Grade " + s.grade + "  ·  " + s.passed + " passed / " + s.failed + " failed";
    var counts = $("counts"); counts.textContent = "";
    ["critical", "high", "medium", "low"].forEach(function (k) {
      if (s.counts[k]) { var b = el("span", "sev " + k, s.counts[k] + " " + k); counts.appendChild(b); }
    });
    if (!s.failed) counts.appendChild(el("span", "pill green", "No issues"));

    var cats = $("cats"); cats.textContent = "";
    RC.CATEGORY_ORDER.forEach(function (k) {
      var c = s.categories[k]; if (!c) return;
      var box = el("div", "cat");
      box.appendChild(el("b", "", k));
      box.appendChild(el("div", "n", c.score + " "));
      var bar = el("div", "bar"), fill = el("i"); fill.style.width = c.score + "%"; fill.style.background = colorFor(c.score); bar.appendChild(fill);
      box.appendChild(bar);
      box.appendChild(el("div", "sub", c.pass + " passed, " + c.fail + " failed"));
      cats.appendChild(box);
    });
  }

  function renderSummary() {
    var tabs = $("tabs"); tabs.textContent = "";
    var hasAI = !!report.aiMd;
    function tab(id, label) {
      var b = el("button", activeTab === id ? "on" : "", label);
      b.addEventListener("click", function () { activeTab = id; renderSummary(); });
      tabs.appendChild(b);
    }
    tab("smart", "Smart report");
    if (hasAI) tab("ai", "Claude AI report");
    var box = $("summary"); box.textContent = "";
    if (report.aiError) box.insertAdjacentHTML("beforeend", '<div class="notice">Claude AI report failed: ' + RC.esc(report.aiError) + ". Showing the built-in smart report.</div>");
    if (activeTab === "ai" && hasAI) {
      box.insertAdjacentHTML("beforeend", '<p class="muted">Written by ' + RC.esc(report.aiModel || "Claude") + " from the scan data. Check important claims before sharing.</p>" + RC.renderMarkdown(report.aiMd));
    } else {
      box.insertAdjacentHTML("beforeend", RC.renderMarkdown(report.summaryMd));
    }
  }

  function renderRequirements() {
    var reqs = report.requirements || [];
    $("reqSection").classList.toggle("hidden", !reqs.length);
    var list = $("reqList"); list.textContent = "";
    reqs.forEach(function (q) {
      var row = el("div", "req");
      row.appendChild(el("span", "st " + q.status, q.status.toUpperCase()));
      var d = el("div");
      d.appendChild(el("div", "", q.text + (q.score != null ? "  (" + q.score + "%)" : "")));
      if (q.foundOn && q.foundOn.length) d.appendChild(el("div", "muted", "Found on: " + q.foundOn.join(", ")));
      if (q.missing && q.missing.length && q.status !== "found") d.appendChild(el("div", "muted", "Keywords not seen: " + q.missing.join(", ")));
      row.appendChild(d); list.appendChild(row);
    });
  }

  function renderIssues() {
    var all = RC.failedSorted(report.tests);
    var shown = all.filter(function (t) { return filter === "all" || t.severity === filter; });
    $("issueCount").textContent = all.length;

    var f = $("filters"); f.textContent = "";
    ["all", "critical", "high", "medium", "low"].forEach(function (k) {
      var n = k === "all" ? all.length : all.filter(function (t) { return t.severity === k; }).length;
      if (k !== "all" && !n) return;
      var b = el("button", filter === k ? "on" : "", k + " (" + n + ")");
      b.addEventListener("click", function () { filter = k; renderIssues(); });
      f.appendChild(b);
    });

    var box = $("issues"); box.textContent = "";
    if (!shown.length) box.appendChild(el("p", "muted", all.length ? "No issues with this severity." : "No issues found. 🎉"));
    shown.forEach(function (t) {
      var d = el("details", "issue " + t.severity);
      var s = el("summary");
      s.appendChild(el("span", "sev " + t.severity, t.severity));
      s.appendChild(el("b", "", t.name));
      s.appendChild(el("span", "cat-tag", t.category));
      d.appendChild(s);
      var body = el("div", "body");
      if (t.detail) body.appendChild(el("p", "", t.detail));
      if (t.samples && t.samples.length) {
        body.appendChild(el("p", "muted", "Examples:"));
        var ul = el("ul"); t.samples.forEach(function (x) { ul.appendChild(el("li", "", x)); }); body.appendChild(ul);
      }
      if (t.fix) { var p = el("p"); p.appendChild(el("b", "", "How to fix: ")); p.appendChild(document.createTextNode(t.fix)); body.appendChild(p); }
      if (t.code) { var pre = el("pre"); pre.appendChild(el("code", "", t.code)); body.appendChild(pre); }
      d.appendChild(body); box.appendChild(d);
    });
  }

  function renderStats() {
    var s = report.stats || {}, box = $("stats"); box.textContent = "";
    var items = [
      ["Load time", s.loadMs ? s.loadMs + " ms" : "n/a"], ["Server response", s.ttfbMs != null ? s.ttfbMs + " ms" : "n/a"],
      ["Largest paint (LCP)", s.lcpMs != null ? s.lcpMs + " ms" : "n/a"], ["Layout shift (CLS)", s.cls != null ? s.cls : "n/a"],
      ["Requests", s.requests], ["Data transferred", s.transferKB != null ? s.transferKB + " KB" : "n/a"],
      ["HTML elements", s.elements], ["Links (checked)", s.links + " (" + (s.linksChecked || 0) + ")"], ["Images", s.images], ["Scripts", s.scripts], ["Forms", s.forms]
    ];
    items.forEach(function (it) { var d = el("div", "stat"); d.appendChild(el("b", "", String(it[1]))); d.appendChild(el("span", "", it[0])); box.appendChild(d); });
  }

  function renderPassed() {
    var ok = report.tests.filter(function (t) { return t.status === "pass"; });
    $("passedCount").textContent = ok.length;
    var ul = $("passed"); ul.textContent = "";
    ok.forEach(function (t) { ul.appendChild(el("li", "", t.category + ": " + t.name)); });
  }

  function wire() {
    $("btnPrint").addEventListener("click", function () { window.print(); });
    $("btnPrompt").addEventListener("click", async function (e) {
      try { await navigator.clipboard.writeText(report.fixPrompt); e.target.textContent = "Copied ✓"; }
      catch (err) { window.prompt("Copy this prompt:", report.fixPrompt); }
      setTimeout(function () { e.target.textContent = "Copy AI fix prompt"; }, 2000);
    });
    $("btnMd").addEventListener("click", function () { download("sitescan-" + report.host.replace(/[^a-z0-9.-]/gi, "_") + ".md", RC.toMarkdown(report), "text/markdown"); });
    $("btnJson").addEventListener("click", function () { download("sitescan-" + report.host.replace(/[^a-z0-9.-]/gi, "_") + ".json", JSON.stringify(report, null, 2), "application/json"); });
    window.addEventListener("beforeprint", function () { document.querySelectorAll("details").forEach(function (d) { d.open = true; }); });
  }

  chrome.storage.local.get("lastReport").then(function (store) {
    report = store.lastReport;
    if (!report) { $("empty").classList.remove("hidden"); return; }
    $("app").classList.remove("hidden");
    document.title = "SiteScan AI - " + report.host;
    activeTab = report.aiMd ? "ai" : "smart";
    renderOverview(); renderSummary(); renderRequirements(); renderIssues(); renderStats(); renderPassed(); wire();
  });
})();
