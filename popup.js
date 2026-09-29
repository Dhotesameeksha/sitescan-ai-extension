(function () {
  var $ = function (id) { return document.getElementById(id); };
  var tab = null;

  function show(id, on) { $(id).classList.toggle("hidden", !on); }

  async function init() {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
    try { $("site").textContent = tab && tab.url ? new URL(tab.url).host || tab.url : "No tab"; } catch (e) { $("site").textContent = "No tab"; }

    var store = await chrome.storage.local.get(["settings", "lastReport"]);
    var s = store.settings || {};
    $("reqs").value = (s.requirements || []).join("\n");
    $("useAI").checked = !!s.useAI;
    $("apiKey").value = s.apiKey || "";
    $("model").value = s.model || "";
    if (store.lastReport) show("openLast", true);
  }

  function readSettings() {
    return {
      requirements: $("reqs").value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean),
      useAI: $("useAI").checked,
      apiKey: $("apiKey").value.trim(),
      model: $("model").value.trim()
    };
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === "PROGRESS") {
      $("progressMsg").textContent = msg.msg;
      $("bar").style.width = Math.max(5, msg.pct || 0) + "%";
    }
  });

  $("scanBtn").addEventListener("click", async function () {
    if (!tab) return;
    var settings = readSettings();
    await chrome.storage.local.set({ settings: settings });
    if (settings.useAI && !settings.apiKey) {
      show("errorBox", true); $("errorBox").textContent = "Add your Anthropic API key, or turn off the Claude AI option.";
      return;
    }
    show("errorBox", false); show("doneBox", false); show("progressWrap", true);
    $("bar").style.width = "5%"; $("progressMsg").textContent = "Starting…";
    $("scanBtn").disabled = true; $("scanBtn").textContent = "Scanning…";

    var res;
    try { res = await chrome.runtime.sendMessage({ type: "SCAN", tabId: tab.id, settings: settings }); }
    catch (e) { res = { ok: false, error: String((e && e.message) || e) }; }

    $("scanBtn").disabled = false; $("scanBtn").textContent = "Scan again";
    show("progressWrap", false);
    if (!res || !res.ok) {
      show("errorBox", true); $("errorBox").textContent = (res && res.error) || "Scan failed.";
    } else {
      show("doneBox", true);
      $("doneBox").textContent = "Done. Score " + res.score + "/100, " + res.failed + " issues. The report opened in a new tab." +
        (res.aiError ? " (AI report failed: " + res.aiError + ")" : "");
      show("openLast", true);
    }
  });

  $("openLast").addEventListener("click", function () { chrome.tabs.create({ url: chrome.runtime.getURL("report.html") }); });

  init();
})();
