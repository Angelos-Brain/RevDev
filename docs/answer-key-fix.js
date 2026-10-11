/* Answer-key integrity: explanation overrides conflicting AI keys.
   Runs after generation and again right before grading. */
(function () {
  "use strict";

  function norm(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  /** Return option index uniquely supported by the explanation, or -1. */
  function repairFromExplanation(item) {
    if (!item || !Array.isArray(item.options) || item.options.length < 2) return -1;
    var expl = String(item.explanation || "");
    if (expl.trim().length < 8) return -1;
    var explLow = norm(expl);

    // 1) Full option text (or leading probe) appears in explanation
    var hits = [];
    for (var i = 0; i < item.options.length; i++) {
      var o = norm(item.options[i]);
      if (o.length < 6) continue;
      var probe = o.slice(0, Math.min(56, o.length));
      if (probe.length >= 6 && explLow.indexOf(probe) !== -1) hits.push(i);
    }
    if (hits.length === 1) return hits[0];

    // 2) "correct answer is X" / "answer is X" patterns matching one option
    var phraseRe = /(?:correct(?:\s+answer)?|answer)\s*(?:is|:)\s*([^\n.]+)/gi;
    var pm;
    var phraseHits = [];
    while ((pm = phraseRe.exec(expl)) !== null) {
      var phrase = norm(pm[1]).slice(0, 80);
      if (phrase.length < 4) continue;
      for (var p = 0; p < item.options.length; p++) {
        var op = norm(item.options[p]);
        if (op === phrase || op.indexOf(phrase) !== -1 || phrase.indexOf(op) !== -1) {
          phraseHits.push(p);
        }
      }
    }
    var puniq = [];
    phraseHits.forEach(function (x) {
      if (puniq.indexOf(x) === -1) puniq.push(x);
    });
    if (puniq.length === 1) return puniq[0];

    // 3) Status / HTTP codes in explanation → option containing that code
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

    // 4) Significant-word overlap with clear margin
    function words(s) {
      return norm(s)
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(function (w) {
          return (
            w.length > 4 &&
            !/^(which|where|their|there|these|those|about|would|could|should|being|after|before|under|over|while|during|system|systems|ability|between|correct|answer|option|because)$/.test(
              w
            )
          );
        });
    }
    function overlap(a, b) {
      var wa = words(a);
      var wb = words(b);
      if (!wa.length || !wb.length) return 0;
      var setB = Object.create(null);
      wb.forEach(function (w) {
        setB[w] = 1;
      });
      var hit = 0;
      wa.forEach(function (w) {
        if (setB[w]) hit++;
      });
      return hit / Math.max(wa.length, 1);
    }
    var scores = [];
    for (var s = 0; s < item.options.length; s++) {
      scores.push({ i: s, s: overlap(item.options[s], expl) });
    }
    scores.sort(function (a, b) {
      return b.s - a.s;
    });
    if (scores.length && scores[0].s >= 0.28) {
      if (scores.length === 1 || scores[0].s >= scores[1].s + 0.08) return scores[0].i;
    }
    return -1;
  }

  function fixItems(list) {
    if (!Array.isArray(list)) return { fixed: 0, total: 0 };
    var fixed = 0;
    list.forEach(function (q) {
      if (!q || !Array.isArray(q.options) || q.options.length < 2) return;
      var idx = repairFromExplanation(q);
      if (idx < 0) return;
      var correct = String(q.options[idx]);
      var current = Array.isArray(q.answers)
        ? String(q.answers[0] != null ? q.answers[0] : "")
        : String(q.answers || "");
      if (norm(current) !== norm(correct)) {
        q.answers = [correct];
        fixed++;
        if (typeof console !== "undefined" && console.info) {
          console.info(
            "[RevDev] answer-key-fix: corrected →",
            correct.slice(0, 70)
          );
        }
      } else {
        q.answers = [correct];
      }
    });
    return { fixed: fixed, total: list.length };
  }

  function allItemLists() {
    var lists = [];
    if (window.__revdevFinalExamItems && window.__revdevFinalExamItems.length)
      lists.push(window.__revdevFinalExamItems);
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

  /** Console helper: audit keys vs explanations */
  window.__revdevAuditKeys = function () {
    var list =
      (window.__revdevFinalExamItems && window.__revdevFinalExamItems.length && window.__revdevFinalExamItems) ||
      (window.__revdevPristineExamItems && window.__revdevPristineExamItems.length && window.__revdevPristineExamItems) ||
      [];
    console.group("[RevDev] Answer key audit (" + list.length + " items)");
    var issues = 0;
    list.forEach(function (q, i) {
      var ans = Array.isArray(q.answers) ? q.answers[0] : q.answers;
      var idx = repairFromExplanation(q);
      var suggested = idx >= 0 ? q.options[idx] : null;
      var match =
        suggested == null ||
        norm(ans) === norm(suggested) ||
        norm(String(ans)).indexOf(norm(String(suggested)).slice(0, 20)) >= 0;
      if (!match) {
        issues++;
        console.warn(
          "#" + (i + 1),
          "KEY:",
          String(ans).slice(0, 50),
          "| EXPL suggests:",
          String(suggested).slice(0, 50)
        );
      } else {
        console.log("#" + (i + 1), "OK →", String(ans).slice(0, 60));
      }
    });
    console.log("Issues:", issues, "/", list.length);
    console.groupEnd();
    return { total: list.length, issues: issues };
  };

  function install() {
    var tries = 0;
    (function wait() {
      fixAll();
      tries++;
      if (tries < 100) setTimeout(wait, 300);
    })();

    var statusEl = document.getElementById("generation-status");
    if (statusEl) {
      new MutationObserver(function () {
        var t = statusEl.textContent || "";
        if (!/Done\.|Generated \d+/i.test(t)) return;
        setTimeout(function () {
          var n = fixAll();
          if (n && typeof console !== "undefined") {
            console.info("[RevDev] answer-key-fix: fixed", n, "key(s) after generation");
          }
          try {
            window.__revdevAuditKeys();
          } catch (e) {}
        }, 500);
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
      "RevDev: answer-key-fix active — explanation overrides conflicting keys. Run __revdevAuditKeys() to inspect."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
