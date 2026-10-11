/* ============================================================
   HARD exam quality: prompt rules + validation + single commit.
   Shuffle lives ONLY in exam-integrity commitExam (once).
   Does NOT drop generated items (no silent count shrink).
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
    "ROLE: You are a university exam writer for a HARD exam on the SUBJECT in the SOURCE text.",
    "CONTENT: Test concepts, mechanisms, rules, formulas, processes, trade-offs. Every question MUST stand alone: never mention the source, files, chapters, guides, or page numbers. Ignore tables of contents, prefaces, appendices, and reference lists. Use ONLY facts in SOURCE; if a fact is missing write [not in the files].",
    "DIFFICULTY: Prefer application and analysis over recall.",
    "OPTIONS: Multiple choice has exactly 4 options. Exactly one is true per SOURCE. The other three MUST be real, believable concepts, versions, or syntax that a half-prepared student would confuse with it. NEVER invent versions, tools, or features that do not exist; NEVER use joke or off-topic options. All four options MUST be similar in length (within about 25% in word count); the correct option MUST NOT be the longest or most detailed one. Randomize the correct position.",
    "KEY: answers is an array with ONE string: the exact copy of the correct option. NEVER a letter.",
    "EXPLANATION: MUST start with \"Correct: \" followed by the exact correct option text and a period. Then 1-2 plain-language sentences about THIS question only, with the formal term in parentheses if it appears in SOURCE, then one sentence on why the most tempting wrong option is wrong. NEVER mention another question or topic.",
    "CHECK before returning each item: answers[0] equals exactly one option; the explanation starts with that option; question, options, answer and explanation all concern the same concept."
  ].join("\n");

  function softCleanSourceText(raw) {
    var original = String(raw || "");
    if (!original) return original;
    var cleaned = original
      .replace(/\.{4,}\s*\d+/g, " ")
      .replace(/\u2026{2,}\s*\d+/g, " ")
      .replace(/Study\s+Guide\s+Page\s+\d+\s+of\s+\d+/gi, " ")
      .replace(/Page\s+\d+\s+of\s+\d+/gi, " ");
    if (cleaned.length < original.length * 0.6 || cleaned.trim().length < 2000) {
      console.warn("[RevDev] softCleanSourceText: cleaned text too short; using ORIGINAL");
      return original;
    }
    return cleaned;
  }
  window.__revdevCleanSourceText = softCleanSourceText;

  function norm(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function lockAnswerAsOptionText(q) {
    if (!q || !Array.isArray(q.options) || !q.options.length) return;
    var answers = Array.isArray(q.answers) ? q.answers : q.answers != null ? [q.answers] : [];
    if (!answers.length) return;
    var opts = q.options;
    for (var a = 0; a < answers.length; a++) {
      var ans = norm(answers[a]);
      if (!ans) continue;
      var hits = [];
      for (var i = 0; i < opts.length; i++) {
        var o = norm(opts[i]);
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
      if (/^\d+$/.test(s)) {
        var n = parseInt(s, 10);
        if (n >= 0 && n < opts.length) {
          q.answers = [String(opts[n])];
          return;
        }
        if (n >= 1 && n <= opts.length) {
          q.answers = [String(opts[n - 1])];
          return;
        }
      }
    }
    for (var a3 = 0; a3 < answers.length; a3++) {
      var low = String(answers[a3] || "")
        .trim()
        .toLowerCase();
      if (low === "true" || low === "t" || low === "yes") {
        for (var t = 0; t < opts.length; t++) {
          if (/^true$/i.test(String(opts[t]).trim())) {
            q.answers = [String(opts[t])];
            return;
          }
        }
      }
      if (low === "false" || low === "f" || low === "no") {
        for (var f = 0; f < opts.length; f++) {
          if (/^false$/i.test(String(opts[f]).trim())) {
            q.answers = [String(opts[f])];
            return;
          }
        }
      }
    }
  }

  /** Valid only if answers[0] equals exactly one option; explanation starts with "Correct: " + that text; MC has exactly 4 options. */
  function isValidItem(q) {
    if (!q) return false;
    var type = String(q.type || "").toLowerCase().replace(/\s+/g, "_");
    lockAnswerAsOptionText(q);

    if (type === "multiple_choice") {
      if (!Array.isArray(q.options) || q.options.length !== 4) return false;
    }

    if (!Array.isArray(q.options) || q.options.length < 2) {
      if (type === "identification" || type === "short_answer") return true;
      return false;
    }

    var ans = Array.isArray(q.answers)
      ? String(q.answers[0] != null ? q.answers[0] : "")
      : String(q.answers || "");
    if (!ans) return false;

    var hits = 0;
    for (var i = 0; i < q.options.length; i++) {
      if (norm(q.options[i]) === norm(ans)) hits++;
    }
    if (hits !== 1) return false;

    for (var j = 0; j < q.options.length; j++) {
      if (norm(q.options[j]) === norm(ans)) {
        q.answers = [String(q.options[j])];
        ans = String(q.options[j]);
        break;
      }
    }

    var expl = String(q.explanation || "");
    var prefix = "Correct: " + ans;
    if (expl.indexOf(prefix) !== 0) return false;
    return true;
  }

  function sanitizeExplanation(q) {
    lockAnswerAsOptionText(q);
    var ans = Array.isArray(q.answers)
      ? String(q.answers[0] != null ? q.answers[0] : "")
      : String(q.answers || "");
    if (!ans && Array.isArray(q.options) && q.options.length) {
      return;
    }
    q.explanation = "Correct: " + ans + ".";
  }

  function tryWrapRunBatch() {
    if (typeof window.__revdevRunBatch !== "function") return false;
    if (window.__revdevRunBatch.__hardQualityWrapped) return true;
    var original = window.__revdevRunBatch;

    window.__revdevRunBatch = async function (prompt, schema, systemText, preferredProvider, onStatus) {
      var p = String(prompt || "");
      var isStudy = /exam questions|QUOTA|multiple_choice|flashcards|topic review|summary/i.test(p);

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
        "answers must be the exact full text of the correct option; " +
        'explanation MUST start with "Correct: " followed by that exact option text and a period.';

      var result = await original.call(this, p, schema, sys, preferredProvider, onStatus);

      // Validate + repair items; NO shuffle here (commitExam does the only shuffle)
      try {
        if (result && result.data && Array.isArray(result.data.questions)) {
          var questions = result.data.questions;
          for (var qi = 0; qi < questions.length; qi++) {
            var q = questions[qi];
            lockAnswerAsOptionText(q);
            if (isValidItem(q)) continue;

            var repaired = false;
            for (var attempt = 0; attempt < 2 && !repaired; attempt++) {
              try {
                var repairPrompt =
                  QUALITY_RULES +
                  "\n\nRepair this single exam item. Return JSON with one question object only.\n" +
                  "Question: " +
                  String(q.question || "") +
                  "\nOptions: " +
                  JSON.stringify(q.options || []) +
                  "\nCurrent answers: " +
                  JSON.stringify(q.answers || []) +
                  "\nCurrent explanation: " +
                  String(q.explanation || "") +
                  "\n\nFix so answers[0] is the exact correct option text and explanation starts with \"Correct: \" + that text.";
                var rr = await original.call(
                  this,
                  repairPrompt,
                  schema,
                  sys,
                  preferredProvider,
                  onStatus
                );
                var candidate = null;
                if (rr && rr.data) {
                  if (Array.isArray(rr.data.questions) && rr.data.questions[0]) {
                    candidate = rr.data.questions[0];
                  } else if (rr.data.question) {
                    candidate = rr.data;
                  }
                }
                if (candidate) {
                  if (candidate.answers) q.answers = candidate.answers;
                  if (candidate.explanation) q.explanation = candidate.explanation;
                  if (Array.isArray(candidate.options) && candidate.options.length) {
                    q.options = candidate.options;
                  }
                  lockAnswerAsOptionText(q);
                  if (isValidItem(q)) repaired = true;
                }
              } catch (re) {
                console.warn("[RevDev] repair attempt failed", re);
              }
            }

            if (!repaired) {
              sanitizeExplanation(q);
              console.warn(
                "[RevDev] item kept with sanitized explanation:",
                String(q.question || "").slice(0, 60)
              );
            }
          }
          result.data.questions = questions;
        }
      } catch (e) {
        console.warn("[RevDev] post-batch validate", e);
      }

      return result;
    };
    window.__revdevRunBatch.__hardQualityWrapped = true;
    console.info("RevDev: quality rules + item validation (no per-batch shuffle)");
    return true;
  }

  var tries = 0;
  (function waitWrap() {
    if (tryWrapRunBatch()) return;
    tries++;
    if (tries < 40) setTimeout(waitWrap, 250);
  })();

  // Commit ONLY on final "Done." — never on "Generated N of M"
  var statusEl = document.getElementById("generation-status");
  if (statusEl) {
    var t = null;
    new MutationObserver(function () {
      var text = statusEl.textContent || "";
      // Final only
      if (!/\bDone\./i.test(text)) return;
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

        items.forEach(function (q) {
          lockAnswerAsOptionText(q);
          if (!isValidItem(q)) sanitizeExplanation(q);
        });

        // Single commit path: shuffle once + shared array + one render
        if (typeof window.__revdevCommitExam === "function") {
          window.__revdevCommitExam(items);
        } else {
          window.__revdevFinalExamItems = items;
          window.__revdevPristineExamItems = items;
          window.__revdevTimerExamItems = items;
          if (job) job.collected = items;
          if (window.__revdevLastResult) window.__revdevLastResult.items = items;
          window.__revdevExamReady = true;
          if (typeof window.__revdevRenderExamClean === "function") {
            try {
              window.__revdevRenderExamClean(items);
            } catch (e) {}
          }
        }

        if (typeof window.__revdevAssertCountsMatch === "function") {
          try {
            window.__revdevAssertCountsMatch();
          } catch (e) {}
        }
      }, 200);
    }).observe(statusEl, { childList: true, characterData: true, subtree: true });
  }
})();
