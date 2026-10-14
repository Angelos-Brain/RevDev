/* Answer-key integrity: every MC/TF key becomes exact option text before grading.
   Explanation wins when it uniquely embeds an option. Letters only map before any
   position change — we never trust a bare letter against shuffled options. */
(function () {
  "use strict";

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function significantWords(s) {
    return norm(s)
      .split(" ")
      .filter(function (w) {
        return (
          w.length > 4 &&
          !/^(which|where|their|there|these|those|about|would|could|should|being|after|before|under|over|while|during|system|systems|ability|between|correct|answer|option|because|other|distractors|describe|impossible|irrelevant|outcomes|matching|primary|benefit)$/.test(
            w
          )
        );
      });
  }

  function scoreOverlap(a, b) {
    var wa = significantWords(a);
    var wb = significantWords(b);
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

  function indexFromExplanation(item) {
    if (!item || !Array.isArray(item.options) || item.options.length < 2) return -1;
    var expl = norm(item.explanation || "");
    if (expl.length < 12) return -1;

    var best = [];
    for (var i = 0; i < item.options.length; i++) {
      var o = norm(item.options[i]);
      if (o.length < 12) continue;
      var foundLen = 0;
      for (var len = Math.min(o.length, 90); len >= 18; len -= 3) {
        if (expl.indexOf(o.slice(0, len)) !== -1) {
          foundLen = len;
          break;
        }
      }
      if (!foundLen && o.length >= 24) {
        var mid = o.slice(6, Math.min(o.length, 70));
        if (mid.length >= 16 && expl.indexOf(mid) !== -1) foundLen = mid.length;
      }
      if (foundLen) best.push({ i: i, len: foundLen });
    }
    if (best.length) {
      best.sort(function (a, b) {
        return b.len - a.len;
      });
      if (best.length === 1 || best[0].len >= best[1].len + 6) return best[0].i;
      // Tied probes: use overlap
      var tied = best.filter(function (x) {
        return x.len >= best[0].len - 3;
      });
      var ranked = tied
        .map(function (t) {
          return { i: t.i, s: scoreOverlap(item.options[t.i], expl) };
        })
        .sort(function (a, b) {
          return b.s - a.s;
        });
      if (ranked[0].s >= ranked[1].s + 0.08) return ranked[0].i;
      if (ranked[0].s >= 0.35) return ranked[0].i;
    }

    var scores = [];
    for (var s = 0; s < item.options.length; s++) {
      scores.push({ i: s, s: scoreOverlap(item.options[s], expl) });
    }
    scores.sort(function (a, b) {
      return b.s - a.s;
    });
    if (scores[0] && scores[0].s >= 0.35) {
      if (scores.length === 1 || scores[0].s >= scores[1].s + 0.12) return scores[0].i;
    }
    return -1;
  }

  function indexFromAnswers(item) {
    if (!item || !Array.isArray(item.options)) return -1;
    var raw = item.answers;
    var candidates = [];
    if (raw == null) return -1;
    if (Array.isArray(raw)) {
      raw.forEach(function (x) {
        if (x == null) return;
        if (Array.isArray(x)) x.forEach(function (y) { if (y != null) candidates.push(String(y)); });
        else candidates.push(String(x));
      });
    } else candidates.push(String(raw));

    for (var c = 0; c < candidates.length; c++) {
      var ans = norm(candidates[c]);
      if (!ans) continue;
      // Exact / contains against option text
      if (ans.length >= 8 && !/^[a-d]$/.test(ans)) {
        var hits = [];
        for (var i = 0; i < item.options.length; i++) {
          var o = norm(item.options[i]);
          if (!o) continue;
          if (o === ans || o.indexOf(ans) !== -1 || ans.indexOf(o) !== -1) hits.push(i);
        }
        if (hits.length === 1) return hits[0];
      }
    }
    // Letter only if options were NOT shuffled (stable order) — still convert to text
    for (var c2 = 0; c2 < candidates.length; c2++) {
      var m = String(candidates[c2] || "").trim().match(/^(?:option\s*)?([a-d])\)?\.?$/i);
      if (m) {
        var idx = m[1].toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < item.options.length) return idx;
      }
    }
    return -1;
  }

  function fixItem(q) {
    if (!q || !Array.isArray(q.options) || !q.options.length) return false;
    var type = String(q.type || "").toLowerCase().replace(/\s+/g, "_");
    var isChoice =
      type === "multiple_choice" ||
      type === "true_false" ||
      (Array.isArray(q.options) && q.options.length >= 2);
    if (!isChoice) return false;

    // Prefer explanation when it clearly names one option
    var fromExpl = indexFromExplanation(q);
    var fromAns = indexFromAnswers(q);
    var idx = -1;
    if (fromExpl >= 0) idx = fromExpl;
    else if (fromAns >= 0) idx = fromAns;
    if (idx < 0) return false;

    var text = String(q.options[idx]);
    var prev = Array.isArray(q.answers) ? String(q.answers[0] || "") : String(q.answers || "");
    q.answers = [text];
    q.__revdevKeyIndex = idx;
    return norm(prev) !== norm(text);
  }

  function allLists() {
    var out = [];
    if (Array.isArray(window.__revdevFinalExamItems)) out.push(window.__revdevFinalExamItems);
    if (Array.isArray(window.__revdevPristineExamItems)) out.push(window.__revdevPristineExamItems);
    if (window.__revdevJob && Array.isArray(window.__revdevJob.collected)) out.push(window.__revdevJob.collected);
    if (window.__revdevLastResult && Array.isArray(window.__revdevLastResult.items))
      out.push(window.__revdevLastResult.items);
    return out;
  }

  function fixAll() {
    var changed = 0;
    allLists().forEach(function (list) {
      list.forEach(function (q) {
        if (fixItem(q)) changed++;
      });
    });
    return changed;
  }

  function wrapMark() {
    var cur = window.__revdevMarkExamForm;
    if (!cur || cur.__akWrap) return;
    function wrapped(outcomes) {
      fixAll();
      if (Array.isArray(outcomes)) {
        outcomes.forEach(function (o) {
          if (o && o.question) fixItem(o.question);
        });
      }
      return cur.apply(this, arguments);
    }
    wrapped.__akWrap = true;
    // Keep raw reference for other modules
    if (!window.__revdevMarkExamFormRaw) window.__revdevMarkExamFormRaw = cur;
    window.__revdevMarkExamForm = wrapped;
  }

  // After generation finishes, lock keys
  var status = document.getElementById("generation-status");
  if (status) {
    new MutationObserver(function () {
      var t = status.textContent || "";
      if (/Done\.|Generated \d+/i.test(t)) {
        setTimeout(fixAll, 300);
        setTimeout(fixAll, 1000);
        setTimeout(fixAll, 2500);
      }
    }).observe(status, { childList: true, characterData: true, subtree: true });
  }

  document.addEventListener(
    "click",
    function (e) {
      var t = e.target;
      if (!t) return;
      var btn = t.id ? t : t.closest && t.closest("button");
      if (!btn) return;
      if (btn.id === "submit-exam" || btn.id === "exam-timer-next" || btn.id === "retake-exam") {
        fixAll();
        wrapMark();
      }
    },
    true
  );

  wrapMark();
  [100, 500, 1500, 4000].forEach(function (ms) {
    setTimeout(function () {
      wrapMark();
      fixAll();
    }, ms);
  });

  window.__revdevFixAnswerKeys = fixAll;
  window.__revdevResolveKeyIndex = function (q) {
    var i = indexFromExplanation(q);
    if (i >= 0) return i;
    return indexFromAnswers(q);
  };

  console.info("RevDev: answer-key-fix active (text keys, explanation override, no letter trap)");
})();
