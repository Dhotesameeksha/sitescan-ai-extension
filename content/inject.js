// Runs inside the PAGE (MAIN world) at document_start.
// Records console errors, JS crashes, unhandled promise rejections and failed fetch/XHR calls.
(function () {
  if (window.__ssInjected) return;
  window.__ssInjected = true;

  function post(kind, data) {
    try { window.postMessage(Object.assign({ __sitescan: true, kind: kind }, data), "*"); } catch (e) {}
  }
  function fmt(args) {
    return Array.prototype.map.call(args, function (a) {
      try { return typeof a === "string" ? a : (a && a.stack) || JSON.stringify(a); } catch (e) { return String(a); }
    }).join(" ").slice(0, 300);
  }

  ["error", "warn"].forEach(function (level) {
    var orig = console[level];
    console[level] = function () {
      post("console-" + level, { msg: fmt(arguments) });
      return orig.apply(this, arguments);
    };
  });

  window.addEventListener("error", function (e) {
    if (e.target && e.target !== window) return; // resource errors are handled by collector.js
    post("js-error", { msg: String(e.message || "Script error").slice(0, 300), src: e.filename, line: e.lineno, col: e.colno });
  });

  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    post("promise-rejection", { msg: String((r && (r.message || r)) || "Unhandled promise rejection").slice(0, 300) });
  });

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function () {
      var args = arguments;
      var url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      var method = (args[1] && args[1].method) || (args[0] && args[0].method) || "GET";
      return origFetch.apply(this, args).then(function (res) {
        if (res.status >= 400) post("http-error", { url: String(url).slice(0, 200), status: res.status, method: method });
        return res;
      }, function (err) {
        post("network-error", { url: String(url).slice(0, 200), msg: String((err && err.message) || err) });
        throw err;
      });
    };
  }

  var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__ss = { m: m, u: u }; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    var self = this;
    this.addEventListener("loadend", function () {
      if (self.__ss && self.status >= 400) post("http-error", { url: String(self.__ss.u).slice(0, 200), status: self.status, method: self.__ss.m });
    });
    return XS.apply(this, arguments);
  };
})();
