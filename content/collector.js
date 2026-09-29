// Runs in the extension's isolated world at document_start.
// Collects what inject.js reports, plus images/scripts/styles that fail to load.
(function () {
  if (window.__ssCollector) return;
  window.__ssCollector = true;
  window.__ssErrors = [];

  function push(e) { if (window.__ssErrors.length < 100) window.__ssErrors.push(e); }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window || !ev.data || !ev.data.__sitescan) return;
    push(ev.data);
  });

  window.addEventListener("error", function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName) {
      push({ kind: "resource-error", tag: t.tagName.toLowerCase(), url: String(t.src || t.href || "").slice(0, 200) });
    }
  }, true);
})();
