/* review-fix: load base + hard answer-key resolution (explanation wins over wrong letters) */
(async function () {
  "use strict";
  var res = await fetch(
    "https://raw.githubusercontent.com/Angelos-Brain/RevDev/06664540a3b6d5377a22b2a549d072e1669d792d/docs/review-fix.js"
  );
  if (!res.ok) throw new Error("review-fix load failed " + res.status);
  var code = await res.text();
  var blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  await import(blobUrl);

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
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
          !/^(which|where|their|there|these|those|about|would|could|should|being|after|before|under|over|while|during|system|systems|ability|between|correct|answer|option|because|other|distractors|describe|impossible|irrelevant|outcomes|matching)$/.test(
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

  /** Longest unique option substring found inside the explanation. */
  function indexFromExplanation(item) {
    if (!item || !Array.isArray(item.options) || item.options.length < 2) return -1;
    var expl = norm(item.explanation || "");
    if (expl.length < 12) return -1;

    var best = [];
    for (var i = 0; i < item.options.length; i++) {
      var o = norm(item.options[i]);
      if (o.length < 12) continue;
      // Try progressively shorter probes; require a meaningful chunk
      var foundLen = 0;
      for (var len = Math.min(o.length, 80); len >= 18; len -= 4) {
        var probe = o.slice(0, len);
        if (expl.indexOf(probe) !== -1) {
          foundLen = len;
          break;
        }
      }
      // Also try a mid-slice for options that start with shared "it ..."
      if (!foundLen && o.length >= 24) {
        var mid = o.slice(8, Math.min(o.length, 60));
        if (mid.length >= 16 && expl.indexOf(mid) !== -1) foundLen = mid.length;
      }
      if (foundLen) best.push({ i: i, len: foundLen });
    }
    if (!best.length) {
      // Word-overlap fallback with clear margin
      var scores = [];
      for (var s = 0; s < item.options.length; s++) {
        scores.push({ i: s, s: scoreOverlap(item.options[s], expl) });
      }
      scores.sort(function (a, b) {
        return b.s - a.s;
      });
      if (scores[0] && scores[0].s >= 0.3) {
        if (scores.length === 1 || scores[0].s >= (scores[1] ? scores[1].s : 0) + 0.12) {
          return scores[0].i;
        }
      }
      return -1;
    }
    best.sort(function (a, b) {
      return b.len - a.len;
    });
    // Unique longest match wins
    if (best.length === 1 || best[0].len > best[1].len + 4) return best[0].i;
    // Tie: prefer higher overlap score among tied
    var topLen = best[0].len;
    var tied = best.filter(function (x) {
      return x.len >= topLen - 2;
    });
    if (tied.length === 1) return tied[0].i;
    var ranked = tied
      .map(function (t) {
        return { i: t.i, s: scoreOverlap(item.options[t.i], expl) };
      })
      .sort(function (a, b) {
        return b.s - a.s;
      });
    if (ranked[0].s > ranked[1].s + 0.05) return ranked[0].i;
    return -1;
  }

  function indexFromAnswerText(item) {
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
      if (!ans || ans.length < 2) continue;
      // Letter-only is unreliable after shuffle — skip here
      if (/^[a-d]$/.test(ans)) continue;
      var hits = [];
      for (var i = 0; i < item.options.length; i++) {
        var o = norm(item.options[i]);
        if (!o) continue;
        if (o === ans || (ans.length >= 10 && (o.indexOf(ans) !== -1 || ans.indexOf(o) !== -1))) {
          hits.push(i);
        }
      }
      if (hits.length === 1) return hits[0];
    }
    return -1;
  }

  function resolveKeyIndex(item) {
    // 1) Explanation is ground truth when it embeds an option
    var fromExpl = indexFromExplanation(item);
    if (fromExpl >= 0) return fromExpl;
    // 2) Full answer text
    var fromText = indexFromAnswerText(item);
    if (fromText >= 0) return fromText;
    // 3) Letter only as last resort
    var raw = Array.isArray(item.answers) ? String(item.answers[0] || "") : String(item.answers || "");
    var m = raw.trim().match(/^(?:option\s*)?([a-d])\.?$/i);
    if (m && Array.isArray(item.options)) {
      var idx = m[1].toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < item.options.length) return idx;
    }
    return -1;
  }

  function reconcileItem(q) {
    if (!q || !Array.isArray(q.options) || !q.options.length) return;
    var i = resolveKeyIndex(q);
    if (i >= 0) {
      q.answers = [String(q.options[i])];
      q.__revdevKeyIndex = i;
    }
  }

  function reconcileAllLists() {
    var lists = [];
    if (window.__revdevFinalExamItems) lists.push(window.__revdevFinalExamItems);
    if (window.__revdevPristineExamItems) lists.push(window.__revdevPristineExamItems);
    if (window.__revdevJob && window.__revdevJob.collected) lists.push(window.__revdevJob.collected);
    if (window.__revdevLastResult && window.__revdevLastResult.items) lists.push(window.__revdevLastResult.items);
    lists.forEach(function (list) {
      if (!Array.isArray(list)) return;
      list.forEach(reconcileItem);
    });
  }

  // Wrap markForm so keys are reconciled immediately before paint
  function wrapMarkForm() {
    var original = window.__revdevMarkExamForm;
    if (!original || original.__revdevKeyWrap) return;
    function wrapped(outcomes) {
      reconcileAllLists();
      // Also reconcile questions embedded in outcomes
      if (Array.isArray(outcomes)) {
        outcomes.forEach(function (o) {
          if (o && o.question) reconcileItem(o.question);
        });
      }
      return original.apply(this, arguments);
    }
    wrapped.__revdevKeyWrap = true;
    window.__revdevMarkExamForm = wrapped;
  }

  wrapMarkForm();
  [200, 600, 1500, 3000].forEach(function (ms) {
    setTimeout(wrapMarkForm, ms);
  });

  // Before submit / finish, force reconcile
  document.addEventListener(
    "click",
    function (e) {
      var t = e.target;
      if (!t) return;
      var btn = t.id ? t : t.closest && t.closest("button");
      var id = btn && btn.id;
      if (id === "submit-exam" || id === "exam-timer-next" || id === "retake-exam") {
        reconcileAllLists();
        wrapMarkForm();
      }
    },
    true
  );

  // After mark paints, if explanation disagrees with green option, re-mark once
  function auditAndRemark() {
    var form = document.getElementById("exam-form");
    if (!form || !form.querySelector(".is-correct, .is-incorrect, .is-correct-answer")) return;
    var items =
      (window.__revdevFinalExamItems && window.__revdevFinalExamItems.length && window.__revdevFinalExamItems) ||
      (window.__revdevPristineExamItems && window.__revdevPristineExamItems.length && window.__revdevPristineExamItems) ||
      (window.__revdevJob && window.__revdevJob.collected) ||
      [];
    if (!items.length) return;
    var fieldsets = form.querySelectorAll(".exam-question");
    var needRemark = false;
    fieldsets.forEach(function (fs, index) {
      var q = items[index];
      if (!q) return;
      var want = resolveKeyIndex(q);
      if (want < 0) return;
      var greens = fs.querySelectorAll(".choice-option.is-correct-answer, .choice-option.is-right-answer");
      if (greens.length !== 1) {
        needRemark = true;
        return;
      }
      var radios = fs.querySelectorAll('input[type="radio"]');
      var greenIdx = -1;
      radios.forEach(function (r, ri) {
        var lab = r.closest(".choice-option");
        if (lab && (lab.classList.contains("is-correct-answer") || lab.classList.contains("is-right-answer"))) {
          greenIdx = ri;
        }
      });
      if (greenIdx >= 0 && greenIdx !== want) needRemark = true;
    });
    if (needRemark && typeof window.__revdevMarkExamForm === "function") {
      reconcileAllLists();
      try {
        window.__revdevMarkExamForm();
      } catch (err) {
        console.warn("[RevDev] remark failed", err);
      }
    }
  }

  document.addEventListener(
    "click",
    function (e) {
      var t = e.target;
      if (!t) return;
      var btn = t.id ? t : t.closest && t.closest("button");
      if (btn && (btn.id === "submit-exam" || btn.id === "exam-timer-next")) {
        setTimeout(auditAndRemark, 250);
        setTimeout(auditAndRemark, 700);
      }
    },
    false
  );

  window.__revdevResolveKeyIndex = resolveKeyIndex;
  console.info("RevDev: answer-key fix active (explanation longest-match wins)");
})();
