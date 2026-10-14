/* Answer-key integrity v5
   - Only trust explanation when it relates to THIS question's stem
   - Prefer answer text that matches an option related to the stem
   - Never paint green from a mismatched (swapped) explanation */
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

  var STOP = /^(which|where|their|there|these|those|about|would|could|should|being|after|before|under|over|while|during|system|systems|ability|between|correct|answer|option|because|other|primary|benefit|following|best|described|represented|what|when|than|with|from|that|this|into|such|like|using|across|without|among|above|below|each|only|more|most|also|into|over|under)$/;

  function significantWords(s) {
    return norm(s)
      .split(" ")
      .filter(function (w) {
        return w.length > 3 && !STOP.test(w);
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

  function stemText(item) {
    return String(item.question || item.stem || item.prompt || "");
  }

  /** Explanation is usable only if it shares real content with the question stem. */
  function explanationFitsStem(item) {
    var stem = stemText(item);
    var expl = item.explanation || "";
    if (stem.length < 12 || String(expl).length < 12) return false;
    var s = scoreOverlap(stem, expl);
    // Also check shared distinctive tokens (length > 5)
    var sw = significantWords(stem).filter(function (w) {
      return w.length > 5;
    });
    var ew = Object.create(null);
    significantWords(expl).forEach(function (w) {
      ew[w] = 1;
    });
    var shared = 0;
    sw.forEach(function (w) {
      if (ew[w]) shared++;
    });
    return s >= 0.18 || shared >= 2;
  }

  function indexFromExplanation(item) {
    if (!explanationFitsStem(item)) return -1;
    if (!Array.isArray(item.options) || item.options.length < 2) return -1;
    var expl = norm(item.explanation || "");
    if (expl.length < 12) return -1;

    var best = [];
    for (var i = 0; i < item.options.length; i++) {
      var o = norm(item.options[i]);
      if (o.length < 10) continue;
      var foundLen = 0;
      for (var len = Math.min(o.length, 90); len >= 18; len -= 3) {
        if (expl.indexOf(o.slice(0, len)) !== -1) {
          foundLen = len;
          break;
        }
      }
      if (!foundLen && o.length >= 20) {
        var mid = o.slice(5, Math.min(o.length, 65));
        if (mid.length >= 14 && expl.indexOf(mid) !== -1) foundLen = mid.length;
      }
      // Short options like "TPC-H"
      if (!foundLen && o.length >= 4 && o.length <= 24 && expl.indexOf(o) !== -1) {
        foundLen = o.length + 10; // boost exact short tokens
      }
      if (foundLen) best.push({ i: i, len: foundLen });
    }
    if (best.length) {
      best.sort(function (a, b) {
        return b.len - a.len;
      });
      if (best.length === 1 || best[0].len >= best[1].len + 4) return best[0].i;
    }

    var scores = [];
    for (var s = 0; s < item.options.length; s++) {
      scores.push({ i: s, s: scoreOverlap(item.options[s], item.explanation) });
    }
    scores.sort(function (a, b) {
      return b.s - a.s;
    });
    if (scores[0] && scores[0].s >= 0.35 && scores[0].s >= (scores[1] ? scores[1].s : 0) + 0.12) {
      return scores[0].i;
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
      if (/^[a-d]$/.test(ans)) continue; // letter handled later
      var hits = [];
      for (var i = 0; i < item.options.length; i++) {
        var o = norm(item.options[i]);
        if (!o) continue;
        if (o === ans || (ans.length >= 4 && (o.indexOf(ans) !== -1 || ans.indexOf(o) !== -1))) {
          hits.push(i);
        }
      }
      if (hits.length === 1) return hits[0];
    }

    for (var c2 = 0; c2 < candidates.length; c2++) {
      var m = String(candidates[c2] || "").trim().match(/^(?:option\s*)?([a-d])\)?\.?$/i);
      if (m) {
        var idx = m[1].toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < item.options.length) return idx;
      }
    }
    return -1;
  }

  /** Prefer option that best matches the question stem (when keys conflict). */
  function indexBestStemOption(item) {
    if (!item || !Array.isArray(item.options)) return -1;
    var stem = stemText(item);
    if (stem.length < 12) return -1;
    var scores = [];
    for (var i = 0; i < item.options.length; i++) {
      scores.push({ i: i, s: scoreOverlap(item.options[i], stem) });
    }
    scores.sort(function (a, b) {
      return b.s - a.s;
    });
    // Only use if clearly related — distractors are designed to be plausible so be strict
    if (scores[0] && scores[0].s >= 0.25 && scores[0].s >= (scores[1] ? scores[1].s : 0) + 0.1) {
      return scores[0].i;
    }
    return -1;
  }

  function fixItem(q) {
    if (!q || !Array.isArray(q.options) || q.options.length < 2) return false;
    var type = String(q.type || "").toLowerCase().replace(/\s+/g, "_");
    if (type && type !== "multiple_choice" && type !== "true_false" && type !== "mcq") {
      // still try if options present
    }

    var fromExpl = indexFromExplanation(q);
    var fromAns = indexFromAnswers(q);
    var idx = -1;

    // If explanation fits the stem and points to an option, trust it
    if (fromExpl >= 0) idx = fromExpl;
    else if (fromAns >= 0) idx = fromAns;
    // If explanation clearly does NOT fit the stem, ignore it entirely
    // and keep answer text / letter only

    if (idx < 0) return false;
    var text = String(q.options[idx]);
    var prev = Array.isArray(q.answers) ? String(q.answers[0] || "") : String(q.answers || "");
    q.answers = [text];
    q.__revdevKeyIndex = idx;
    // Mark when explanation was ignored due to mismatch
    if (!explanationFitsStem(q) && String(q.explanation || "").length > 20) {
      q.__revdevExplMismatch = true;
    }
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
    var n = 0;
    allLists().forEach(function (list) {
      list.forEach(function (q) {
        if (fixItem(q)) n++;
      });
    });
    return n;
  }

  function wrapMark() {
    var cur = window.__revdevMarkExamForm;
    if (!cur || cur.__akWrap5) return;
    function wrapped(outcomes) {
      fixAll();
      if (Array.isArray(outcomes)) {
        outcomes.forEach(function (o) {
          if (o && o.question) fixItem(o.question);
        });
      }
      return cur.apply(this, arguments);
    }
    wrapped.__akWrap5 = true;
    if (!window.__revdevMarkExamFormRaw) window.__revdevMarkExamFormRaw = cur;
    window.__revdevMarkExamForm = wrapped;
  }

  var status = document.getElementById("generation-status");
  if (status) {
    new MutationObserver(function () {
      var t = status.textContent || "";
      if (/Done\.|Generated \d+/i.test(t)) {
        setTimeout(fixAll, 300);
        setTimeout(fixAll, 1200);
      }
    }).observe(status, { childList: true, characterData: true, subtree: true });
  }

  document.addEventListener(
    "click",
    function (e) {
      var t = e.target;
      if (!t) return;
      var btn = t.id ? t : t.closest && t.closest("button");
      if (btn && (btn.id === "submit-exam" || btn.id === "exam-timer-next" || btn.id === "retake-exam")) {
        fixAll();
        wrapMark();
      }
    },
    true
  );

  wrapMark();
  [100, 500, 2000].forEach(function (ms) {
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
  window.__revdevExplanationFitsStem = explanationFitsStem;

  console.info("RevDev: answer-key-fix v5 (stem-aware explanation trust)");
})();
