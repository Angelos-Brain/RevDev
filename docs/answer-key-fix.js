/* Prefer explanation when it uniquely names the correct option.
   Fixes AI answer keys that contradict their own explanation
   (e.g. key=302 Found, explanation says 419 Page Expired for CSRF). */
(function () {
  "use strict";

  function repairFromExplanation(item) {
    if (!item || !Array.isArray(item.options) || item.options.length < 2) return -1;
    var expl = String(item.explanation || "");
    if (expl.trim().length < 8) return -1;
    var explLow = expl.toLowerCase().replace(/\s+/g, " ");

    var hits = [];
    for (var i = 0; i < item.options.length; i++) {
      var o = String(item.options[i] || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (o.length < 6) continue;
      var probe = o.slice(0, Math.min(56, o.length));
      if (probe.length >= 6 && explLow.indexOf(probe) !== -1) hits.push(i);
    }
    if (hits.length === 1) return hits[0];

    var codes = {};
    var re = /(?:status\s*code|returns?|receives?|encounters?|gets?|is\s+)\s*(\d{3})\b/gi;
    var m;
    while ((m = re.exec(expl)) !== null) codes[m[1]] = 1;
    var codeHits = [];
    Object.keys(codes).forEach(function (code) {
      for (var j = 0; j < item.options.length; j++) {
        if (String(item.options[j] || "").indexOf(code) !== -1) codeHits.push(j);
      }
    });
    var uniq = [];
    codeHits.forEach(function (x) {
      if (uniq.indexOf(x) === -1) uniq.push(x);
    });
    if (uniq.length === 1) return uniq[0];
    return -1;
  }

  function wrapResolve() {
    function fixItems(list) {
      if (!Array.isArray(list)) return;
      list.forEach(function (q) {
        var idx = repairFromExplanation(q);
        if (idx >= 0 && q.options && q.options[idx] != null) {
          var current = Array.isArray(q.answers) ? String(q.answers[0] || "") : String(q.answers || "");
          var correct = String(q.options[idx]);
          if (current.toLowerCase().replace(/\s+/g, " ") !== correct.toLowerCase().replace(/\s+/g, " ")) {
            q.answers = [correct];
            console.info("[RevDev] answer-key-fix: corrected key from explanation →", correct.slice(0, 60));
          }
        }
      });
    }

    ["__revdevFinalExamItems", "__revdevPristineExamItems"].forEach(function (k) {
      if (window[k] && window[k].length) fixItems(window[k]);
    });
    if (window.__revdevJob && window.__revdevJob.collected) fixItems(window.__revdevJob.collected);
    if (window.__revdevLastResult && window.__revdevLastResult.items) fixItems(window.__revdevLastResult.items);

    var tries = 0;
    (function wait() {
      if (window.__revdevFinalExamItems && window.__revdevFinalExamItems.length) {
        fixItems(window.__revdevFinalExamItems);
      }
      if (window.__revdevPristineExamItems && window.__revdevPristineExamItems.length) {
        fixItems(window.__revdevPristineExamItems);
      }
      tries++;
      if (tries < 80) setTimeout(wait, 250);
    })();

    var statusEl = document.getElementById("generation-status");
    if (statusEl) {
      new MutationObserver(function () {
        var t = statusEl.textContent || "";
        if (!/Done\.|Generated \d+/i.test(t)) return;
        setTimeout(function () {
          if (window.__revdevFinalExamItems) fixItems(window.__revdevFinalExamItems);
          if (window.__revdevPristineExamItems) fixItems(window.__revdevPristineExamItems);
          if (window.__revdevJob && window.__revdevJob.collected) fixItems(window.__revdevJob.collected);
        }, 400);
      }).observe(statusEl, { childList: true, characterData: true, subtree: true });
    }

    document.addEventListener(
      "click",
      function (e) {
        var t = e.target;
        if (!t) return;
        var id = t.id || (t.closest && t.closest("button") && t.closest("button").id);
        if (id === "submit-exam" || id === "exam-timer-next") {
          if (window.__revdevFinalExamItems) fixItems(window.__revdevFinalExamItems);
          if (window.__revdevPristineExamItems) fixItems(window.__revdevPristineExamItems);
          if (window.__revdevJob && window.__revdevJob.collected) fixItems(window.__revdevJob.collected);
        }
      },
      true
    );

    console.info("RevDev: answer-key-fix active (explanation overrides conflicting keys)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wrapResolve);
  } else {
    wrapResolve();
  }
})();
