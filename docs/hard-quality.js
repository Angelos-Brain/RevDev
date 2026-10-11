/* ============================================================
   HARD exam quality (STABILIZED): prompt rules + option shuffle
   - Does NOT drop generated items (no silent count shrink)
   - Soft in-place cleaning only; safety valve keeps original text
   ============================================================ */
(function installHardQuestionQuality() {
  "use strict";

  var BLOCKLIST = [
    "according to the text",
    "according to the passage",
    "according to the document",
    "according to the file",
    "according to the guide",
    "according to the material",
    "table of contents",
    "study guide page"
  ];
  window.__REVDEV_QUESTION_BLOCKLIST = BLOCKLIST;

  var QUALITY_RULES = [
    "ROLE: You are a university exam writer for a HARD, high-stakes exam on the SUBJECT in the text.",
    "",
    "CONTENT RULES (MUST):",
    "- Test the subject itself: concepts, mechanisms, definitions, rules, formulas, processes, trade-offs.",
    "- Every question MUST stand alone. Never mention the source, files, chapters, guides, or page numbers.",
    "- Ignore table of contents, prefaces, appendices, glossaries, and reference lists.",
    "- Never ask about document structure or layout.",
    "",
    "DIFFICULTY: Prefer application and analysis over trivial recall.",
    "MULTIPLE CHOICE: 4 plausible options; randomize correct-answer position (not always A).",
    "True/False, identification, short answer: precise and non-trivial."
  ].join("\n");

  /** Soft clean: replace dot-leader runs and page-header phrases in place. Never delete lines. */
  function softCleanSourceText(raw) {
    var original = String(raw || "");
    if (!original) return original;
    var cleaned = original
      // dotted leaders + page number (keep surrounding words)
      .replace(/\.{4,}\s*\d+/g, " ")
      .replace(/\u2026{2,}\s*\d+/g, " ")
      // page header phrase only
      .replace(/Study\s+Guide\s+Page\s+\d+\s+of\s+\d+/gi, " ")
      .replace(/Page\s+\d+\s+of\s+\d+/gi, " ");
    // Safety valve
    if (cleaned.length < original.length * 0.6 || cleaned.trim().length < 2000) {
      console.warn("[RevDev] softCleanSourceText: cleaned text too short; using ORIGINAL");
      return original;
    }
    return cleaned;
  }
  window.__revdevCleanSourceText = softCleanSourceText;

  function normalizeAnswerKey(s) {
    return String(s || "").trim().toLowerCase();
  }

  /** Resolve answers to option TEXT before shuffle so letter keys stay valid. */
  function lockAnswerAsOptionText(q) {
    if (!q || !Array.isArray(q.options) || !q.options.length) return;
    var answers = Array.isArray(q.answers) ? q.answers : (q.answers != null ? [q.answers] : []);
    if (!answers.length) return;
    var opts = q.options;
    // Exact or contains match against option text
    for (var a = 0; a < answers.length; a++) {
      var ans = String(answers[a] || "").trim().toLowerCase().replace(/\s+/g, " ");
      if (!ans) continue;
      var hits = [];
      for (var i = 0; i < opts.length; i++) {
        var o = String(opts[i] || "").trim().toLowerCase().replace(/\s+/g, " ");
        if (!o) continue;
        if (o === ans || (ans.length >= 8 && (o.indexOf(ans) !== -1 || ans.indexOf(o) !== -1))) {
          hits.push(i);
        }
      }
      if (hits.length === 1) {
        q.answers = [String(opts[hits[0]])];
        return;
      }
    }
    // Letter form: A/B/C/D or Option A etc.
    for (var a2 = 0; a2 < answers.length; a2++) {
      var s = String(answers[a2] || "").trim();
      var m = s.match(/^(?:option\s*|answer\s*:?\s*|\()?([a-d])\)?\.?$/i);
      if (m) {
        var idx = m[1].toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < opts.length) {
          q.answers = [String(opts[idx])];
          return;
        }
      }
      // numeric index
      if (/^\d+$/.test(s)) {
        var n = parseInt(s, 10);
        if (n >= 0 && n < opts.length) { q.answers = [String(opts[n])]; return; }
        if (n >= 1 && n <= opts.length) { q.answers = [String(opts[n - 1])]; return; }
      }
    }
    // True/False
    for (var a3 = 0; a3 < answers.length; a3++) {
      var low = String(answers[a3] || "").trim().toLowerCase();
      if (low === "true" || low === "t" || low === "yes") {
        for (var t = 0; t < opts.length; t++) {
          if (/^true$/i.test(String(opts[t]).trim())) { q.answers = [String(opts[t])]; return; }
        }
      }
      if (low === "false" || low === "f" || low === "no") {
        for (var f = 0; f < opts.length; f++) {
          if (/^false$/i.test(String(opts[f]).trim())) { q.answers = [String(opts[f])]; return; }
        }
      }
    }
  }

  function shuffleQuestionOptions(q) {
    if (!q || !Array.isArray(q.options) || q.options.length < 2) return q;
    var type = String(q.type || "").toLowerCase().replace(/\s+/g, "_");
    if (type !== "multiple_choice" && type !== "true_false") return q;
    // CRITICAL: lock correct answer as full option text BEFORE shuffle
    lockAnswerAsOptionText(q);
    var opts = q.options.slice();
    for (var i = opts.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = opts[i];
      opts[i] = opts[j];
      opts[j] = tmp;
    }
    q.options = opts;
    // Re-lock text in case of whitespace differences
    lockAnswerAsOptionText(q);
    return q;
  }

  function shuffleAll(items) {
    (items || []).forEach(shuffleQuestionOptions);
    return items || [];
  }

  function publishFinal(items) {
    var list = (items || []).map(function (q) {
      return {
        type: q.type,
        question: q.question,
        options: Array.isArray(q.options) ? q.options.slice() : q.options,
        answers: Array.isArray(q.answers) ? q.answers.slice() : q.answers,
        explanation: q.explanation,
        front: q.front,
        back: q.back,
        topic: q.topic
      };
    });
    window.__revdevFinalExamItems = list;
    window.__revdevPristineExamItems = list;
    if (window.__revdevJob) window.__revdevJob.collected = list;
    if (window.__revdevLastResult) window.__revdevLastResult.items = list;
    if (typeof window.__revdevPublishFinalItems === "function") {
      try { window.__revdevPublishFinalItems(list); } catch (e) {}
    }
    var countEl = document.getElementById("exam-count");
    if (countEl && list.length) countEl.textContent = list.length + " questions";
    window.__revdevExamReady = true;
    return list;
  }

  function tryWrapRunBatch() {
    if (typeof window.__revdevRunBatch !== "function") return false;
    if (window.__revdevRunBatch.__hardQualityWrapped) return true;
    var original = window.__revdevRunBatch;
    window.__revdevRunBatch = async function (prompt, schema, systemText, preferredProvider, onStatus) {
      var p = String(prompt || "");
      var isStudy = /exam questions|QUOTA|multiple_choice|flashcards|topic review|summary/i.test(p);

      // Soft-clean SOURCE section in place (never empty the prompt)
      if (isStudy && /SOURCE:/i.test(p)) {
        var parts = p.split(/SOURCE:/i);
        if (parts.length >= 2) {
          var head = parts[0];
          var body = softCleanSourceText(parts.slice(1).join("SOURCE:"));
          if (body && body.trim().length >= 40) {
            p = head + "SOURCE:\n" + body;
          }
        }
      }
      if (window.__revdevJob && window.__revdevJob.sourceText && !window.__revdevJob.__sourceCleaned) {
        var cleaned = softCleanSourceText(window.__revdevJob.sourceText);
        if (cleaned && cleaned.trim().length >= 40) {
          window.__revdevJob.sourceText = cleaned;
        }
        window.__revdevJob.__sourceCleaned = true;
      }

      if (isStudy) {
        p = QUALITY_RULES + "\n\n" + p;
      }
      var sys =
        String(systemText || "") +
        " Write HARD university-exam questions on the subject only. " +
        "Never mention documents, chapters, guides, files, or materials. " +
        "Randomize correct-answer positions across A/B/C/D.";

      var result = await original.call(this, p, schema, sys, preferredProvider, onStatus);

      // Shuffle only — do NOT drop items (drops caused silent count mismatches)
      try {
        if (result && result.data) {
          if (Array.isArray(result.data.questions)) {
            result.data.questions = shuffleAll(result.data.questions);
          }
          if (Array.isArray(result.data.cards)) {
            result.data.cards = shuffleAll(result.data.cards);
          }
          if (Array.isArray(result.data.topics)) {
            result.data.topics = shuffleAll(result.data.topics);
          }
        }
      } catch (e) {}
      return result;
    };
    window.__revdevRunBatch.__hardQualityWrapped = true;
    console.info("RevDev: stabilized quality (prompt + shuffle only, soft clean, no drops)");
    return true;
  }

  var tries = 0;
  (function waitWrap() {
    if (tryWrapRunBatch()) return;
    tries++;
    if (tries < 40) setTimeout(waitWrap, 250);
  })();

  // On Done: publish final items from job.collected as-is (no second filter pass)
  var statusEl = document.getElementById("generation-status");
  if (statusEl) {
    var t = null;
    new MutationObserver(function () {
      var text = statusEl.textContent || "";
      if (!/Done\.|Generated \d+/i.test(text)) return;
      if (t) clearTimeout(t);
      t = setTimeout(function () {
        var job = window.__revdevJob;
        var items =
          (job && Array.isArray(job.collected) && job.collected) ||
          (window.__revdevLastResult && window.__revdevLastResult.items) ||
          [];
        if (!items.length) {
          window.__revdevExamReady = true;
          return;
        }
        // Lock every MC/TF answer as option text, then shuffle
        items.forEach(function (q) {
          if (typeof lockAnswerAsOptionText === "function") lockAnswerAsOptionText(q);
        });
        shuffleAll(items);
        items.forEach(function (q) {
          if (typeof lockAnswerAsOptionText === "function") lockAnswerAsOptionText(q);
        });
        window.__revdevFinalExamItems = items;
        window.__revdevPristineExamItems = items.slice();
        publishFinal(items);
        if (typeof window.__revdevRenderExamClean === "function" && (!job || job.mode === "exam" || !job.mode)) {
          try { window.__revdevRenderExamClean(items); } catch (e) {}
        }
        if (typeof window.__revdevAssertCountsMatch === "function") {
          try { window.__revdevAssertCountsMatch(); } catch (e) {}
        }
      }, 200);
    }).observe(statusEl, { childList: true, characterData: true, subtree: true });
  }
})();
