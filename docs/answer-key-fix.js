/* Answer-key integrity: repair ONLY when answers[0] matches NO option.
   Never override a key that already equals exactly one option text. */
(function () {
  "use strict";

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  /** True when answers[0] equals exactly one option. */
  function keyMatchesExactlyOneOption(item) {
    if (!item || !Array.isArray(item.options) || item.options.length < 2) return false;
    var ans = Array.isArray(item.answers)
      ? String(item.answers[0] != null ? item.answers[0] : "")
      : String(item.answers || "");
    if (!ans) return false;
    var hits = 0;
    var exact = null;
    for (var i = 0; i < item.options.length; i++) {
      if (norm(item.options[i]) === norm(ans)) {
        hits++;
        exact = String(item.options[i]);
      }
    }
    if (hits === 1) {
      item.answers = [exact];
      return true;
    }
    return false;
  }

  /** Return option index uniquely supported by the explanation, or -1. */
  function repairFromExplanation(item) {
    if (!item || !Array.isArray(item.options) || item.options.length < 2) return -1;
    var expl = String(item.explanation || "");
    if (expl.trim().length < 8) return -1;
    var explLow = norm(expl);

    // Prefer "Correct: <text>" prefix
    var correctPrefix = /^correct:\s*([^\n.]+)/i.exec(expl);
    if (correctPrefix) {
      var phrase = norm(correctPrefix[1]);
      var prefixHits = [];
      for (var pi = 0; pi < item.options.length; pi++) {
        var op0 = norm(item.options[pi]);
        if (op0 === phrase || op0.indexOf(phrase) !== -1 || phrase.indexOf(op0) !== -1) {
          prefixHits.push(pi);
        }
      }
      if (prefixHits.length === 1) return prefixHits[0];
    }

    var hits = [];
    for (var i = 0; i < item.options.length; i++) {
      var o = norm(item.options[i]);
      if (o.length < 6) continue;
      var probe = o.slice(0, Math.min(56, o.length));
      if (probe.length >= 6 && explLow.indexOf(probe) !== -1) hits.push(i);
    }
    if (hits.length === 1) return hits[0];

    var phraseRe = /(?:correct(?:\s+answer)?|answer)\s*(?:is|:)\s*([^\n.]+)/gi;
    var pm;
    var phraseHits = [];
    while ((pm = phraseRe.exec(expl)) !== null) {
      var phrase2 = norm(pm[1]).slice(0, 80);
      if (phrase2.length < 4) continue;
      for (var p = 0; p < item.options.length; p++) {
        var op = norm(item.options[p]);
        if (op === phrase2 || op.indexOf(phrase2) !== -1 || phrase2.indexOf(op) !== -1) {
          phraseHits.push(p);
        }
      }
    }
    var puniq = [];
    phraseHits.forEach(function (x) {
      if (puniq.indexOf(x) === -1) puniq.push(x);
    });
    if (puniq.length === 1) return puniq[0];

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

  function fixItems(list) {
    if (!Array.isArray(list)) return { fixed: 0, total: 0 };
    var fixed = 0;
    list.forEach(function (q) {
      if (!q || !Array.isArray(q.options) || q.options.length < 2) return;

      // ONLY act when answers[0] matches NO option
      if (keyMatchesExactlyOneOption(q)) return;

      var idx = repairFromExplanation(q);
      if (idx < 0) return;
      var correct = String(q.options[idx]);
      q.answers = [correct];
      fixed++;
      if (typeof console !== "undefined" && console.info) {
        console.info("[RevDev] answer-key-fix: filled missing key →", correct.slice(0, 70));
      }
    });
    return { fixed: fixed, total: list.length };
  }

  function allItemLists() {
    var lists = [];
    // Prefer the shared committed array only
    if (window.__revdevFinalExamItems && window.__revdevFinalExamItems.length) {
      lists.push(window.__revdevFinalExamItems);
      return lists;
    }
    if (window.__revdevPristineExamItems && window.__revdevPristineExamItems.length)
      lists.push(window.__revdevPristineExamItems);
    if (window.__revdevJob && window.__revdevJob.collected && window.__revdevJob.collected.length)
      lists.push(window.__revdevJob.collected);
    if (window.__revdevLastResult && window.__revdevLastResult.items && window.__revdevLastResult.items.length)
      lists.push(window.__revdevLastResult.items);
    return lists;
  }

  function fixAll() {
    var totalFixed = 0;
    allItemLists().forEach(function (list) {
      totalFixed += fixItems(list).fixed;
    });
    return totalFixed;
  }

  window.__revdevAuditKeys = function () {
    var list =
      (window.__revdevFinalExamItems && window.__revdevFinalExamItems.length && window.__revdevFinalExamItems) ||
      (window.__revdevPristineExamItems && window.__revdevPristineExamItems.length && window.__revdevPristineExamItems) ||
      [];
    console.group("[RevDev] Answer key audit (" + list.length + " items)");
    var issues = 0;
    list.forEach(function (q, i) {
      var ans = Array.isArray(q.answers) ? q.answers[0] : q.answers;
      var ok = keyMatchesExactlyOneOption(q);
      if (!ok) {
        issues++;
        console.warn("#" + (i + 1), "KEY matches no option:", String(ans).slice(0, 50));
      } else {
        console.log("#" + (i + 1), "OK →", String(ans).slice(0, 60));
      }
    });
    console.log("Issues:", issues, "/", list.length);
    console.groupEnd();
    return { total: list.length, issues: issues };
  };

  function install() {
    var statusEl = document.getElementById("generation-status");
    if (statusEl) {
      new MutationObserver(function () {
        var t = statusEl.textContent || "";
        if (!/\bDone\./i.test(t)) return;
        setTimeout(function () {
          var n = fixAll();
          if (n && typeof console !== "undefined") {
            console.info("[RevDev] answer-key-fix: filled", n, "missing key(s)");
          }
        }, 600);
      }).observe(statusEl, { childList: true, characterData: true, subtree: true });
    }

    document.addEventListener(
      "click",
      function (e) {
        var t = e.target;
        if (!t) return;
        var btn = t.id ? t : t.closest && t.closest("button");
        var id = btn && btn.id;
        if (id === "submit-exam" || id === "exam-timer-next" || id === "retake-exam") {
          fixAll();
        }
      },
      true
    );

    console.info(
      "RevDev: answer-key-fix active — only fills keys that match NO option. Run __revdevAuditKeys()."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
