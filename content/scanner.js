/* scanner.js - injected on demand into the page (isolated world).
 * Defines window.__siteScan(opts) which runs many checks and returns a plain object.
 * Server-side checks (headers, broken links, robots.txt) are done later by background.js.
 */
window.__siteScan = async function (opts) {
  opts = opts || {};
  var doc = document, loc = location;
  var tests = [];

  function add(category, id, name, passed, o) {
    o = o || {};
    var sev = o.severity || "medium";
    tests.push({
      category: category, id: id, name: name,
      status: passed ? "pass" : (sev === "info" ? "info" : "fail"),
      severity: passed ? "none" : sev,
      detail: o.detail || "",
      fix: passed ? "" : (o.fix || ""),
      code: passed ? "" : (o.code || ""),
      samples: (o.samples || []).slice(0, 5).map(String),
      count: o.count == null ? null : o.count
    });
  }
  function txt(el) { return ((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim(); }
  function snip(el) { try { return el.outerHTML.replace(/\s+/g, " ").slice(0, 110); } catch (e) { return ""; } }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  function metaContent(sel) { var m = doc.querySelector(sel); return m ? (m.getAttribute("content") || "").trim() : ""; }
  var isLocal = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(loc.hostname);

  /* ------------------------------ SEO ------------------------------ */
  var title = (doc.title || "").trim();
  add("SEO", "seo-title", "Page has a good <title> (10-60 characters)", title.length >= 10 && title.length <= 60, {
    severity: title ? "low" : "high",
    detail: title ? "Title is " + title.length + ' characters: "' + title.slice(0, 80) + '"' : "No <title> tag found.",
    fix: "Write a unique, descriptive title of 10-60 characters with the main keyword first and the brand last.",
    code: "<title>Hire Local Freelancers in Pune | SkillSphere</title>"
  });

  var desc = metaContent('meta[name="description"]');
  add("SEO", "seo-description", "Meta description present (50-160 characters)", desc.length >= 50 && desc.length <= 160, {
    severity: desc ? "low" : "medium",
    detail: desc ? "Description is " + desc.length + " characters." : "No meta description found. Search engines will guess a snippet.",
    fix: "Add a meta description that sells the page in 50-160 characters.",
    code: '<meta name="description" content="Find verified local freelancers, compare proposals and pay safely with milestone payments.">'
  });

  var h1s = $$("h1");
  add("SEO", "seo-h1", "Exactly one <h1> heading", h1s.length === 1, {
    severity: h1s.length === 0 ? "medium" : "low",
    detail: "Found " + plural(h1s.length, "<h1>") + ".",
    fix: "Use one <h1> that describes the page; use <h2>-<h3> for sub-sections."
  });

  add("SEO", "seo-canonical", "Canonical link present", !!doc.querySelector('link[rel="canonical"]'), {
    severity: "low", detail: "Canonical tags prevent duplicate-content problems.",
    fix: "Add a canonical URL in <head>.", code: '<link rel="canonical" href="https://example.com/this-page">'
  });

  var ogOk = metaContent('meta[property="og:title"]') && metaContent('meta[property="og:description"]') && metaContent('meta[property="og:image"]');
  add("SEO", "seo-og", "Open Graph tags for social sharing (title, description, image)", !!ogOk, {
    severity: "low", detail: "Missing og:title, og:description or og:image, so shared links look plain on WhatsApp, LinkedIn and Facebook.",
    fix: "Add Open Graph meta tags.", code: '<meta property="og:title" content="...">\n<meta property="og:description" content="...">\n<meta property="og:image" content="https://example.com/preview.png">'
  });

  var lang = (doc.documentElement.getAttribute("lang") || "").trim();
  add("SEO", "seo-lang", "<html lang> attribute set", !!lang, {
    severity: "medium", detail: "The language of the page is not declared (also needed by screen readers).",
    fix: "Set the lang attribute on <html>.", code: '<html lang="en">'
  });

  var vp = metaContent('meta[name="viewport"]');
  add("SEO", "seo-viewport", "Mobile viewport meta tag present", !!vp, {
    severity: "high", detail: "Without a viewport tag the page will not scale properly on phones.",
    fix: "Add the viewport meta tag.", code: '<meta name="viewport" content="width=device-width, initial-scale=1">'
  });

  add("SEO", "seo-favicon", "Favicon declared", !!doc.querySelector('link[rel~="icon"]'), {
    severity: "low", detail: "No <link rel=\"icon\"> found; browsers show a blank tab icon.",
    fix: "Add a favicon.", code: '<link rel="icon" href="/favicon.png">'
  });

  var robotsMeta = metaContent('meta[name="robots"]').toLowerCase();
  add("SEO", "seo-noindex", "Page is allowed to be indexed by search engines", robotsMeta.indexOf("noindex") === -1, {
    severity: "medium", detail: 'Robots meta says "' + robotsMeta + '". Google will not list this page.',
    fix: "Remove noindex before launch (fine on staging sites)."
  });

  add("SEO", "seo-jsonld", "Structured data (JSON-LD) present", !!doc.querySelector('script[type="application/ld+json"]'), {
    severity: "low", detail: "No structured data found. It helps Google show rich results.",
    fix: "Add JSON-LD for your Organization / Product / Service."
  });

  /* ---------------------------- ACCESSIBILITY ---------------------------- */
  var imgs = $$("img");
  var noAlt = imgs.filter(function (i) { return !i.hasAttribute("alt"); });
  add("Accessibility", "a11y-img-alt", "All images have an alt attribute", noAlt.length === 0, {
    severity: "medium", count: noAlt.length,
    detail: plural(noAlt.length, "image") + " without alt text (screen readers and SEO cannot describe them).",
    samples: noAlt.map(function (i) { return i.getAttribute("src") || snip(i); }),
    fix: 'Add a short description, or alt="" for purely decorative images.', code: '<img src="team.jpg" alt="Our team in the Pune office">'
  });

  var controls = $$("input, select, textarea").filter(function (el) {
    return ["hidden", "submit", "button", "reset", "image"].indexOf((el.type || "").toLowerCase()) === -1;
  });
  var unlabeled = controls.filter(function (el) {
    if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title")) return false;
    if (el.id && doc.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]')) return false;
    if (el.closest("label")) return false;
    return true;
  });
  add("Accessibility", "a11y-labels", "Every form field has a label", unlabeled.length === 0, {
    severity: "medium", count: unlabeled.length,
    detail: plural(unlabeled.length, "form field") + " have no <label> or aria-label (placeholder text alone is not a label).",
    samples: unlabeled.map(snip),
    fix: "Connect each field to a <label>.", code: '<label for="email">Email</label>\n<input id="email" type="email" name="email">'
  });

  var nameless = $$("a[href], button, [role=button]").filter(function (el) {
    if (txt(el)) return false;
    if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title")) return false;
    if (el.querySelector("img[alt]:not([alt=''])")) return false;
    if (el.value) return false;
    return true;
  });
  add("Accessibility", "a11y-names", "Buttons and links have readable names", nameless.length === 0, {
    severity: "medium", count: nameless.length,
    detail: plural(nameless.length, "button/link") + " have no text or aria-label (icon-only buttons are silent for screen readers).",
    samples: nameless.map(snip),
    fix: "Add aria-label to icon-only controls.", code: '<button aria-label="Open menu"><svg>...</svg></button>'
  });

  var heads = $$("h1,h2,h3,h4,h5,h6"), jumps = [], prev = 0;
  heads.forEach(function (h) {
    var lvl = parseInt(h.tagName.charAt(1), 10);
    if (prev && lvl > prev + 1) jumps.push("h" + prev + " -> h" + lvl + ': "' + txt(h).slice(0, 40) + '"');
    prev = lvl;
  });
  add("Accessibility", "a11y-heading-order", "Heading levels do not skip", jumps.length === 0, {
    severity: "low", count: jumps.length, detail: "Heading levels jump (for example h1 to h3).", samples: jumps,
    fix: "Keep headings in order: h1, h2, h3. Style with CSS instead of picking a smaller tag."
  });

  var generic = $$("a[href]").filter(function (a) { return /^(click here|read more|here|more|learn more|link)$/i.test(txt(a)); });
  add("Accessibility", "a11y-link-text", 'Links use descriptive text (not "click here")', generic.length === 0, {
    severity: "low", count: generic.length, detail: plural(generic.length, "link") + ' use generic text like "click here" or "read more".',
    samples: generic.map(snip), fix: 'Use text that makes sense alone, e.g. "Read the pricing guide".'
  });

  var badTab = $$("[tabindex]").filter(function (el) { return parseInt(el.getAttribute("tabindex"), 10) > 0; });
  add("Accessibility", "a11y-tabindex", "No positive tabindex values", badTab.length === 0, {
    severity: "low", count: badTab.length, detail: "Positive tabindex breaks the natural keyboard order.", samples: badTab.map(snip),
    fix: 'Use tabindex="0" or remove it, and order elements properly in the HTML.'
  });

  var badFrames = $$("iframe").filter(function (f) { return !f.getAttribute("title"); });
  add("Accessibility", "a11y-iframe-title", "Iframes have a title", badFrames.length === 0, {
    severity: "low", count: badFrames.length, detail: plural(badFrames.length, "iframe") + " without a title attribute.",
    samples: badFrames.map(snip), fix: "Add a title describing the embedded content."
  });

  // Colour contrast (approximate: samples up to 250 visible text elements)
  function parseColor(c) {
    var m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
    if (p.length < 3 || p.some(isNaN)) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function lum(c) {
    function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function bgOf(el) {
    var cur = el;
    while (cur && cur.nodeType === 1) {
      var cs = getComputedStyle(cur);
      var c = parseColor(cs.backgroundColor);
      if (c && c.a > 0.9) return c;
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null; // gradients/images: cannot judge
      cur = cur.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  var lowContrast = [], smallText = [], checked = 0;
  $$("p, a, span, li, h1, h2, h3, h4, h5, h6, button, label, td, th, small").some(function (el) {
    if (checked >= 250) return true;
    var own = Array.prototype.some.call(el.childNodes, function (n) { return n.nodeType === 3 && n.nodeValue.trim().length > 1; });
    if (!own) return false;
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) return false;
    checked++;
    var fs = parseFloat(cs.fontSize);
    if (fs < 12) smallText.push(el.tagName.toLowerCase() + " (" + fs + 'px): "' + txt(el).slice(0, 30) + '"');
    var fg = parseColor(cs.color), bg = bgOf(el);
    if (!fg || !bg) return false;
    var l1 = lum(fg), l2 = lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    var large = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    if (ratio < (large ? 3 : 4.5)) lowContrast.push(ratio.toFixed(1) + ':1 "' + txt(el).slice(0, 30) + '" (' + cs.color + " on " + cs.backgroundColor + ")");
    return false;
  });
  add("Accessibility", "a11y-contrast", "Text colour contrast is readable (WCAG AA, approximate)", lowContrast.length === 0, {
    severity: "medium", count: lowContrast.length,
    detail: plural(lowContrast.length, "text element") + " below the 4.5:1 contrast ratio (out of " + checked + " sampled). Text over images/gradients is not judged.",
    samples: lowContrast, fix: "Darken the text or lighten the background until the ratio is at least 4.5:1 (3:1 for large text)."
  });

  /* ---------------------------- PERFORMANCE ---------------------------- */
  var nav = performance.getEntriesByType("navigation")[0] || {};
  var loadMs = Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd || 0);
  var ttfb = Math.round(nav.responseStart || 0);

  var vitals = await new Promise(function (resolve) {
    var lcp = null, cls = 0, done = false;
    function finish() { if (done) return; done = true; resolve({ lcp: lcp, cls: Math.round(cls * 1000) / 1000 }); }
    try {
      var po1 = new PerformanceObserver(function (l) { var e = l.getEntries(); if (e.length) lcp = Math.round(e[e.length - 1].startTime); });
      po1.observe({ type: "largest-contentful-paint", buffered: true });
      var po2 = new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) cls += e.value; }); });
      po2.observe({ type: "layout-shift", buffered: true });
      setTimeout(function () { try { po1.disconnect(); po2.disconnect(); } catch (e) {} finish(); }, 250);
    } catch (e) { finish(); }
  });

  add("Performance", "perf-load", "Page load time under 3 seconds", !loadMs || loadMs < 3000, {
    severity: loadMs > 6000 ? "high" : "medium", detail: "Load event finished at " + loadMs + " ms (server response " + ttfb + " ms).",
    fix: "Compress images, remove unused JavaScript, use a CDN and enable caching."
  });
  add("Performance", "perf-lcp", "Largest Contentful Paint under 2.5 s", vitals.lcp == null || vitals.lcp < 2500, {
    severity: vitals.lcp > 4000 ? "high" : "medium", detail: "LCP is " + vitals.lcp + " ms.",
    fix: "Optimise the biggest above-the-fold image or text block: preload it, compress it, avoid render-blocking scripts."
  });
  add("Performance", "perf-cls", "Layout does not jump (CLS under 0.1)", vitals.cls < 0.1, {
    severity: vitals.cls > 0.25 ? "high" : "medium", detail: "Cumulative Layout Shift is " + vitals.cls + ".",
    fix: "Set width/height on images and reserve space for ads, banners and late-loading content."
  });

  var res = performance.getEntriesByType("resource");
  function size(e) { return e.transferSize || e.encodedBodySize || 0; }
  var totalBytes = res.reduce(function (a, e) { return a + size(e); }, 0);
  add("Performance", "perf-requests", "Reasonable number of requests (under 100)", res.length < 100, {
    severity: "low", count: res.length, detail: res.length + " network requests were made while loading.",
    fix: "Bundle files, lazy-load below-the-fold content and remove unused third-party scripts."
  });
  add("Performance", "perf-weight", "Total page weight under 3 MB", totalBytes < 3 * 1024 * 1024, {
    severity: "medium", detail: "Approx. " + (totalBytes / 1048576).toFixed(1) + " MB transferred.",
    fix: "Compress images (WebP/AVIF), minify JS/CSS and remove unused libraries."
  });
  var bigImgs = res.filter(function (e) { return (e.initiatorType === "img" || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(e.name)) && size(e) > 500 * 1024; });
  add("Performance", "perf-big-images", "No image larger than 500 KB", bigImgs.length === 0, {
    severity: "medium", count: bigImgs.length, detail: plural(bigImgs.length, "image") + " are heavier than 500 KB.",
    samples: bigImgs.map(function (e) { return Math.round(size(e) / 1024) + " KB " + e.name; }),
    fix: "Resize to the displayed size and convert to WebP/AVIF."
  });
  var bigJs = res.filter(function (e) { return /\.js(\?|$)/i.test(e.name) && size(e) > 500 * 1024; });
  add("Performance", "perf-big-js", "No JavaScript file larger than 500 KB", bigJs.length === 0, {
    severity: "low", count: bigJs.length, detail: plural(bigJs.length, "script") + " are heavier than 500 KB.",
    samples: bigJs.map(function (e) { return Math.round(size(e) / 1024) + " KB " + e.name; }),
    fix: "Use code splitting / lazy routes and remove unused packages."
  });
  var noDims = imgs.filter(function (i) { return !(i.getAttribute("width") && i.getAttribute("height")) && !i.style.aspectRatio; });
  add("Performance", "perf-img-dims", "Images declare width and height", noDims.length <= 3, {
    severity: "low", count: noDims.length, detail: plural(noDims.length, "image") + " have no width/height (causes layout jumps).",
    samples: noDims.map(function (i) { return i.getAttribute("src") || snip(i); }), fix: "Add width and height attributes or a CSS aspect-ratio."
  });
  var eager = imgs.filter(function (i) { return i.getAttribute("loading") !== "lazy" && (i.getBoundingClientRect().top + window.scrollY) > window.innerHeight * 1.5; });
  add("Performance", "perf-lazy", "Below-the-fold images are lazy-loaded", eager.length <= 2, {
    severity: "low", count: eager.length, detail: plural(eager.length, "image") + " far below the fold load immediately.",
    samples: eager.map(function (i) { return i.getAttribute("src") || snip(i); }), fix: 'Add loading="lazy" to below-the-fold images.'
  });
  var blocking = $$("head script[src]").filter(function (s) { return !s.async && !s.defer && s.type !== "module"; });
  add("Performance", "perf-blocking", "No render-blocking scripts in <head>", blocking.length === 0, {
    severity: "medium", count: blocking.length, detail: plural(blocking.length, "script") + " in <head> block page rendering.",
    samples: blocking.map(function (s) { return s.getAttribute("src"); }), fix: "Add defer (or async) to these script tags, or move them to the end of <body>."
  });
  var domSize = doc.getElementsByTagName("*").length;
  add("Performance", "perf-dom", "DOM size under 1500 elements", domSize < 1500, {
    severity: domSize > 3000 ? "medium" : "low", detail: "The page has " + domSize + " HTML elements.",
    fix: "Paginate long lists and avoid deeply nested wrappers."
  });
  var thirdParty = {};
  $$("script[src]").forEach(function (s) { try { var u = new URL(s.src); if (u.origin !== loc.origin) thirdParty[u.hostname] = 1; } catch (e) {} });
  var tpList = Object.keys(thirdParty);
  add("Performance", "perf-third-party", "Few third-party script domains (10 or fewer)", tpList.length <= 10, {
    severity: "low", count: tpList.length, detail: tpList.length + " external script domains.", samples: tpList,
    fix: "Remove trackers and widgets you do not need."
  });

  /* ------------------------------ SECURITY ------------------------------ */
  var https = loc.protocol === "https:";
  add("Security", "sec-https", "Site is served over HTTPS", https || isLocal, {
    severity: "critical", detail: isLocal ? "Local development server (HTTPS not required)." : "This page uses plain HTTP; data can be read or changed in transit.",
    fix: "Install an SSL certificate (free with Let's Encrypt or Cloudflare) and redirect HTTP to HTTPS."
  });
  var mixed = https ? $$("img[src], script[src], iframe[src], source[src], audio[src], video[src], link[rel=stylesheet][href]").filter(function (el) {
    return /^http:\/\//i.test(el.getAttribute("src") || el.getAttribute("href") || "");
  }) : [];
  add("Security", "sec-mixed", "No mixed content (HTTP files on an HTTPS page)", mixed.length === 0, {
    severity: "high", count: mixed.length, detail: plural(mixed.length, "resource") + " load over insecure HTTP; browsers may block them.",
    samples: mixed.map(function (el) { return el.getAttribute("src") || el.getAttribute("href"); }), fix: "Change these URLs to https://."
  });
  var pwd = $$('input[type="password"]');
  add("Security", "sec-password-http", "Password fields only on HTTPS pages", !(pwd.length && !https && !isLocal), {
    severity: "critical", detail: "A password field exists on an insecure page.", fix: "Serve the login page over HTTPS only."
  });
  var httpForms = $$("form[action]").filter(function (f) { return /^http:\/\//i.test(f.getAttribute("action")) && https; });
  add("Security", "sec-form-http", "Forms do not submit to HTTP addresses", httpForms.length === 0, {
    severity: "high", count: httpForms.length, detail: "Form data would be sent unencrypted.", samples: httpForms.map(snip), fix: "Point the form action to an https:// URL."
  });
  var blankNoRel = $$('a[target="_blank"]').filter(function (a) { return !/noopener|noreferrer/i.test(a.getAttribute("rel") || ""); });
  add("Security", "sec-noopener", 'Links opening a new tab use rel="noopener"', blankNoRel.length === 0, {
    severity: "low", count: blankNoRel.length, detail: plural(blankNoRel.length, "link") + ' open with target="_blank" and no rel.',
    samples: blankNoRel.map(snip), fix: 'Add rel="noopener noreferrer".', code: '<a href="https://..." target="_blank" rel="noopener noreferrer">'
  });
  var autoPwd = pwd.filter(function (p) { return (p.getAttribute("autocomplete") || "").toLowerCase() === "off"; });
  add("Security", "sec-pwd-autocomplete", "Password fields allow password managers", autoPwd.length === 0, {
    severity: "low", detail: 'autocomplete="off" on password fields blocks password managers, which weakens security in practice.',
    fix: 'Use autocomplete="current-password" or "new-password".'
  });

  /* ------------------------------- BUGS ------------------------------- */
  var errs = window.__ssErrors || [];
  var capture = !!window.__ssCollector;
  if (!capture) {
    add("Bugs", "bug-capture", "Runtime error capture available", false, {
      severity: "info", detail: "This page was open before the extension loaded, so console/network errors could not be recorded.",
      fix: "Reload the page, then scan again."
    });
  }
  var jsErr = errs.filter(function (e) { return e.kind === "js-error" || e.kind === "promise-rejection"; });
  var conErr = errs.filter(function (e) { return e.kind === "console-error"; });
  var resErr = errs.filter(function (e) { return e.kind === "resource-error"; });
  var netErr = errs.filter(function (e) { return e.kind === "http-error" || e.kind === "network-error"; });
  if (capture) {
    add("Bugs", "bug-js", "No JavaScript errors on load", jsErr.length === 0, {
      severity: "high", count: jsErr.length, detail: plural(jsErr.length, "uncaught JavaScript error") + " happened. Users may see broken features.",
      samples: jsErr.map(function (e) { return e.msg + (e.line ? " (line " + e.line + ")" : ""); }),
      fix: "Open DevTools > Console, click the error and fix the line. Wrap risky code in try/catch and check for null before use."
    });
    add("Bugs", "bug-console", "No console.error messages", conErr.length === 0, {
      severity: "medium", count: conErr.length, detail: plural(conErr.length, "console error") + " logged.", samples: conErr.map(function (e) { return e.msg; }),
      fix: "Fix the underlying problem the message describes."
    });
    add("Bugs", "bug-resources", "All images, scripts and styles load", resErr.length === 0, {
      severity: "high", count: resErr.length, detail: plural(resErr.length, "file") + " failed to load.",
      samples: resErr.map(function (e) { return e.tag + ": " + e.url; }), fix: "Correct the file path or upload the missing file."
    });
    add("Bugs", "bug-api", "No failed API calls (fetch/XHR 4xx-5xx)", netErr.length === 0, {
      severity: "high", count: netErr.length, detail: plural(netErr.length, "network request") + " failed or returned an error status.",
      samples: netErr.map(function (e) { return (e.method || "") + " " + e.url + " -> " + (e.status || e.msg); }),
      fix: "Check the server route, CORS settings and the request body. Show a friendly error message to the user."
    });
  }
  var brokenImgs = imgs.filter(function (i) { return i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src); });
  add("Bugs", "bug-broken-img", "No broken images", brokenImgs.length === 0, {
    severity: "high", count: brokenImgs.length, detail: plural(brokenImgs.length, "image") + " could not be displayed.",
    samples: brokenImgs.map(function (i) { return i.currentSrc || i.src; }), fix: "Fix the image path or replace the file."
  });
  var dummy = $$("a[href]").filter(function (a) { var h = (a.getAttribute("href") || "").trim(); return h === "#" || h === "" || /^javascript:/i.test(h); });
  add("Bugs", "bug-dummy-links", 'No dummy links (href="#" or javascript:)', dummy.length === 0, {
    severity: "low", count: dummy.length, detail: plural(dummy.length, "link") + " go nowhere.",
    samples: dummy.map(function (a) { return txt(a).slice(0, 30) || snip(a); }), fix: "Point them to real pages, or use <button> for actions."
  });
  var badAnchors = $$('a[href^="#"]').filter(function (a) {
    var id = (a.getAttribute("href") || "").slice(1);
    return id.length > 0 && !doc.getElementById(id) && !doc.getElementsByName(id).length;
  });
  add("Bugs", "bug-anchors", "In-page anchor links have a target", badAnchors.length === 0, {
    severity: "low", count: badAnchors.length, detail: plural(badAnchors.length, "anchor") + " point to an id that does not exist.",
    samples: badAnchors.map(function (a) { return a.getAttribute("href"); }), fix: "Add the matching id or fix the link."
  });
  var idMap = {}, dupIds = [];
  $$("[id]").forEach(function (el) { idMap[el.id] = (idMap[el.id] || 0) + 1; });
  Object.keys(idMap).forEach(function (k) { if (idMap[k] > 1) dupIds.push(k + " (x" + idMap[k] + ")"); });
  add("Bugs", "bug-dup-ids", "No duplicate element IDs", dupIds.length === 0, {
    severity: "medium", count: dupIds.length, detail: "Duplicate ids break labels, anchors and JavaScript selectors.", samples: dupIds, fix: "Make every id unique."
  });
  var noName = $$("form input, form select, form textarea").filter(function (el) {
    return !el.name && !el.disabled && ["submit", "button", "reset", "image"].indexOf((el.type || "").toLowerCase()) === -1;
  });
  add("Bugs", "bug-input-name", "Form fields have a name attribute", noName.length === 0, {
    severity: "medium", count: noName.length, detail: plural(noName.length, "field") + " inside forms have no name, so their value is not submitted (unless JavaScript reads them).",
    samples: noName.map(snip), fix: "Add name attributes to the fields."
  });
  var noSubmit = $$("form").filter(function (f) { return !f.querySelector('button:not([type="button"]):not([type="reset"]), input[type="submit"], input[type="image"]'); });
  add("Bugs", "bug-form-submit", "Forms have a submit button", noSubmit.length === 0, {
    severity: "low", count: noSubmit.length, detail: plural(noSubmit.length, "form") + " have no submit button.", samples: noSubmit.map(snip),
    fix: 'Add <button type="submit">.'
  });
  var overflowX = doc.documentElement.scrollWidth > window.innerWidth + 1;
  add("Bugs", "bug-overflow", "No horizontal scrolling at the current window width", !overflowX, {
    severity: "medium", detail: "Page is " + doc.documentElement.scrollWidth + "px wide in a " + window.innerWidth + "px window; something is too wide (common on mobile).",
    fix: "Find the element wider than the screen (DevTools > outline all) and use max-width:100% or flex-wrap."
  });
  var deprecated = $$("center, font, marquee, blink, big, strike, frame, frameset");
  add("Bugs", "bug-deprecated", "No deprecated HTML tags", deprecated.length === 0, {
    severity: "low", count: deprecated.length, detail: "Outdated tags such as <center>, <font>, <marquee> found.", samples: deprecated.map(snip), fix: "Replace with CSS."
  });
  add("Bugs", "bug-small-text", "Text is not smaller than 12px", smallText.length === 0, {
    severity: "low", count: smallText.length, detail: plural(smallText.length, "text element") + " use a font size under 12px.", samples: smallText,
    fix: "Use at least 14-16px for body text."
  });

  /* ------------------ CONTENT & TRUST (client essentials) ------------------ */
  var bodyText = (doc.body ? doc.body.innerText || "" : "");
  var bodyAll = (doc.body ? doc.body.textContent || "" : "");
  var lorem = /lorem ipsum|dolor sit amet/i.test(bodyAll);
  add("Content", "ct-lorem", "No placeholder text (lorem ipsum)", !lorem, {
    severity: "high", detail: "Dummy Latin text is still on the page.", fix: "Replace it with real content."
  });
  var unfinished = /coming soon|under construction|your text here|todo:|tbd\b|sample text/i.exec(bodyText);
  add("Content", "ct-unfinished", 'No "coming soon" / "under construction" placeholders', !unfinished, {
    severity: "medium", detail: 'Found the phrase "' + (unfinished ? unfinished[0] : "") + '".', fix: "Finish or remove the unfinished section."
  });
  var phImgs = imgs.filter(function (i) { return /placeholder|placehold\.co|dummyimage|picsum\.photos|lorempixel|via\.placeholder/i.test(i.currentSrc || i.src); });
  add("Content", "ct-placeholder-img", "No placeholder images", phImgs.length === 0, {
    severity: "medium", count: phImgs.length, detail: plural(phImgs.length, "placeholder image") + " still used.", samples: phImgs.map(function (i) { return i.currentSrc || i.src; }),
    fix: "Replace with real images."
  });
  var yearMatch = bodyText.match(/(?:©|&copy;|copyright)\s*(\d{4})(?:\s*[-–]\s*(\d{4}))?/i);
  if (yearMatch) {
    var latest = parseInt(yearMatch[2] || yearMatch[1], 10), now = new Date().getFullYear();
    add("Content", "ct-copyright", "Copyright year is current", latest >= now, {
      severity: "low", detail: "Footer says " + latest + " but the year is " + now + ".", fix: "Update it, or generate it with new Date().getFullYear()."
    });
  }

  var links = $$("a");
  var linkBlob = links.map(function (a) { return (txt(a) + " " + (a.getAttribute("href") || "") + " " + (a.getAttribute("aria-label") || "")).toLowerCase(); });
  function hasLink(re) { return linkBlob.some(function (t) { return re.test(t); }); }
  function essential(id, name, ok, sev, fix) {
    add("Content", id, name, !!ok, { severity: sev, detail: ok ? "Found." : "Not found on this page.", fix: fix });
  }
  essential("ct-contact", "Contact details or contact page", hasLink(/mailto:|tel:|contact|reach us|get in touch/) || $$("form input[type=email]").length, "medium", "Add an email, phone number or contact form so customers can reach you.");
  essential("ct-about", "About page/section", hasLink(/about/), "low", "Add an About page to build trust.");
  essential("ct-privacy", "Privacy policy link", hasLink(/privacy/), "medium", "Add a Privacy Policy (required for forms, analytics and cookies).");
  essential("ct-terms", "Terms & conditions link", hasLink(/terms|conditions|tos\b/), "low", "Add Terms & Conditions.");
  essential("ct-nav", "Main navigation menu", doc.querySelector("nav, [role=navigation], header a"), "medium", "Add a clear navigation menu.");
  essential("ct-footer", "Footer section", doc.querySelector("footer, [role=contentinfo]"), "low", "Add a footer with contact, legal and social links.");
  essential("ct-social", "Social media links", hasLink(/facebook|instagram|linkedin|twitter|x\.com|youtube|github|wa\.me|whatsapp/), "low", "Link your social profiles.");
  essential("ct-search", "Search feature", doc.querySelector('input[type=search], [role=search], input[placeholder*="search" i], form[action*="search" i]'), "low", "Add search if the site has many pages or products.");
  essential("ct-cookie", "Cookie notice / consent", /cookie/i.test(bodyAll) || doc.querySelector('[class*="cookie" i], [id*="cookie" i]'), "low", "Add a cookie consent banner if you use analytics or tracking.");
  essential("ct-cta", "Clear call-to-action button", $$("a, button").some(function (el) { return /get started|sign up|register|buy|book|contact us|hire|apply|subscribe|order|try|demo|start|join|post a/i.test(txt(el)); }), "medium", "Add a clear call-to-action such as Get Started or Contact Us.");
  essential("ct-faq", "FAQ or help section", /faq|frequently asked/i.test(bodyAll) || hasLink(/faq|help/), "low", "Add an FAQ to answer common questions.");
  essential("ct-lead", "Newsletter / lead capture form", $$("input[type=email]").length, "low", "Add an email sign-up form.");

  /* ---------------------- CLIENT REQUIREMENTS MATCHING ---------------------- */
  var pageCorpus = (function (d) {
    var parts = [d.title || ""];
    Array.prototype.forEach.call(d.querySelectorAll("h1,h2,h3,h4,button,a,label,summary,th,li,p,span"), function (el) { parts.push(el.textContent || ""); });
    Array.prototype.forEach.call(d.querySelectorAll("[placeholder],[aria-label],[title],img[alt],input[name],input[type],a[href],meta[name=description],meta[name=keywords]"), function (el) {
      parts.push(el.getAttribute("placeholder") || "", el.getAttribute("aria-label") || "", el.getAttribute("title") || "", el.getAttribute("alt") || "",
        el.getAttribute("name") || "", el.getAttribute("type") || "", el.getAttribute("href") || "", el.getAttribute("content") || "");
    });
    return parts.join(" ").replace(/\s+/g, " ").toLowerCase().slice(0, 150000);
  })(doc);

  var corpora = [{ url: loc.href, text: pageCorpus }];
  var pagesScanned = [];
  var reqs = (opts.requirements || []).map(function (s) { return String(s).trim(); }).filter(Boolean);

  if (reqs.length) {
    var seen = {}; seen[loc.pathname + loc.search] = 1;
    var cands = $$("nav a[href], header a[href], footer a[href], a[href]").map(function (a) { return a.href; }).filter(function (h) {
      try {
        var u = new URL(h);
        if (u.origin !== loc.origin || /\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|docx?|xlsx?)$/i.test(u.pathname)) return false;
        var key = u.pathname + u.search;
        if (seen[key]) return false;
        seen[key] = 1; return true;
      } catch (e) { return false; }
    }).slice(0, 8);
    await Promise.all(cands.map(async function (h) {
      var ctrl = new AbortController(), t = setTimeout(function () { ctrl.abort(); }, 6000);
      try {
        var r = await fetch(h, { credentials: "same-origin", signal: ctrl.signal });
        if (!r.ok || !/text\/html/i.test(r.headers.get("content-type") || "")) return;
        var rawHtml = (await r.text()).replace(/></g, "> <"); // keep adjacent tags like </h1><p> from merging into one word
        var d = new DOMParser().parseFromString(rawHtml, "text/html");
        d.querySelectorAll("script,style,noscript").forEach(function (n) { n.remove(); });
        var pieces = [d.title || "", d.body ? d.body.textContent || "" : ""];
        d.querySelectorAll("[placeholder],[aria-label],img[alt],a[href],input[name]").forEach(function (el) {
          pieces.push(el.getAttribute("placeholder") || "", el.getAttribute("aria-label") || "", el.getAttribute("alt") || "", el.getAttribute("href") || "", el.getAttribute("name") || "");
        });
        corpora.push({ url: h, text: pieces.join(" ").replace(/\s+/g, " ").toLowerCase().slice(0, 60000) });
        pagesScanned.push(h);
      } catch (e) { /* page could not be fetched: skip */ } finally { clearTimeout(t); }
    }));
  }

  var STOP = {};
  ("the a an and or of to for in on with should must have has had be is are was were will can able user users system website site page pages feature features " +
   "option options allow allows need needs needed like that this it its as at by from into via using use uses their his her also all any each per").split(" ").forEach(function (w) { STOP[w] = 1; });
  var SYN = {
    login: ["signin", "sign in", "log in", "auth"], signin: ["login", "log in"], signup: ["register", "registration", "join", "sign up"], register: ["signup", "registration", "join", "sign up"],
    payment: ["pay", "checkout", "razorpay", "stripe", "upi", "billing", "invoice"], pay: ["payment", "checkout"], chat: ["message", "messaging", "inbox", "whatsapp"],
    contact: ["email", "phone", "reach", "mailto", "tel:"], search: ["find", "filter"], review: ["rating", "testimonial", "feedback"], rating: ["review", "star"],
    notification: ["alert", "notify"], dashboard: ["overview", "analytics", "panel"], profile: ["account", "portfolio"], admin: ["administrator", "manage"],
    cart: ["basket", "checkout", "bag"], newsletter: ["subscribe", "subscription"], faq: ["question", "help"], pricing: ["price", "plans", "cost"], gallery: ["portfolio", "photos"],
    blog: ["article", "news", "post"], video: ["youtube", "vimeo"], map: ["location", "directions", "address"], language: ["english", "hindi", "translate"],
    freelancer: ["freelance", "professional", "talent"], gig: ["project", "job", "listing"], proposal: ["bid", "quote"]
  };
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function present(text, kw) {
    if (new RegExp("\\b" + escRe(kw)).test(text)) return true;
    return (SYN[kw] || []).some(function (alt) { return new RegExp("\\b" + escRe(alt)).test(text); });
  }
  var requirements = reqs.map(function (r) {
    var kws = (r.toLowerCase().match(/[a-z0-9]+/g) || []).filter(function (w) { return w.length > 2 && !STOP[w]; });
    kws = kws.filter(function (w, i) { return kws.indexOf(w) === i; });
    if (!kws.length) return { text: r, status: "unknown", score: 0, matched: [], missing: [], foundOn: [] };
    var all = corpora.map(function (c) { return c.text; }).join(" ");
    var matched = kws.filter(function (k) { return present(all, k); });
    var missing = kws.filter(function (k) { return matched.indexOf(k) === -1; });
    var pct = matched.length / kws.length;
    var foundOn = corpora.filter(function (c) { return kws.filter(function (k) { return present(c.text, k); }).length / kws.length >= 0.7; }).map(function (c) { return c.url; }).slice(0, 3);
    return { text: r, status: pct >= 0.7 ? "found" : pct >= 0.4 ? "partial" : "missing", score: Math.round(pct * 100), matched: matched, missing: missing, foundOn: foundOn };
  });
  requirements.forEach(function (q, i) {
    if (q.status === "found" || q.status === "unknown") {
      add("Requirements", "req-" + i, "Requirement: " + q.text, true, { detail: "Found (" + q.score + "% of keywords)." });
    } else {
      add("Requirements", "req-" + i, "Requirement: " + q.text, false, {
        severity: q.status === "missing" ? "high" : "medium", detail: (q.status === "missing" ? "Not found" : "Only partly found (" + q.score + "%)") +
          " on the scanned pages. Keywords not seen: " + q.missing.join(", ") + ". It may exist behind a login or on a route the scanner cannot open.",
        fix: "Build or expose this feature (or add clear content/links for it), then scan again."
      });
    }
  });

  /* ------------------------------ PAGE SUMMARY ------------------------------ */
  var heads2 = $$("h1,h2,h3").map(function (h) { return txt(h).slice(0, 70); }).filter(Boolean).slice(0, 25);
  var navLinks = $$("nav a, header a").map(function (a) { return txt(a).slice(0, 30); }).filter(Boolean).slice(0, 25);
  var buttons = $$("button, input[type=submit], [role=button]").map(function (b) { return (txt(b) || b.value || "").slice(0, 30); }).filter(Boolean).slice(0, 20);
  var forms = $$("form").slice(0, 6).map(function (f, i) {
    return "form" + (i + 1) + ": " + $$("input, select, textarea", f).map(function (x) { return (x.name || x.id || x.placeholder || x.type) + "(" + (x.type || x.tagName.toLowerCase()) + ")"; }).slice(0, 10).join(", ");
  });
  var footer = doc.querySelector("footer");
  var pageSummary = [
    "TITLE: " + title, "META DESCRIPTION: " + desc, "HEADINGS: " + heads2.join(" | "), "NAV/HEADER LINKS: " + navLinks.join(" | "),
    "BUTTONS: " + buttons.join(" | "), "FORMS: " + (forms.join(" ; ") || "none"), "FOOTER: " + (footer ? txt(footer).slice(0, 300) : "none"),
    "OTHER PAGES READ: " + (pagesScanned.join(", ") || "none"), "BODY START: " + bodyText.replace(/\s+/g, " ").slice(0, 900)
  ].join("\n").slice(0, 5000);

  /* -------------------------------- LINK LIST -------------------------------- */
  var linkMap = {};
  var linkList = [];
  $$("a[href]").forEach(function (a) {
    var h = a.href;
    if (!/^https?:/i.test(h)) return;
    var u = h.split("#")[0];
    if (linkMap[u]) return;
    linkMap[u] = 1;
    linkList.push({ href: u, text: txt(a).slice(0, 60), internal: a.origin === loc.origin });
  });
  linkList.sort(function (a, b) { return (b.internal ? 1 : 0) - (a.internal ? 1 : 0); });

  return {
    url: loc.href, host: loc.host, title: title, scannedAt: new Date().toISOString(),
    tests: tests, links: linkList.slice(0, 45), requirements: requirements, pagesScanned: pagesScanned, pageSummary: pageSummary,
    errorCapture: capture,
    stats: {
      elements: domSize, links: links.length, images: imgs.length, scripts: $$("script").length, forms: $$("form").length,
      loadMs: loadMs, ttfbMs: ttfb, lcpMs: vitals.lcp, cls: vitals.cls, requests: res.length, transferKB: Math.round(totalBytes / 1024)
    }
  };
};
