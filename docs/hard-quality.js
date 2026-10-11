/* ============================================================
   HARD exam quality: prompt rules + blocklist + near-dup filter
   + source-text cleaning + post-filter top-up to requested count
   + randomized correct-answer positions
   ============================================================ */
(function installHardQuestionQuality() {
  "use strict";

  var BLOCKLIST = [
    "according to",
    "the text",
    "the passage",
    "the document",
    "the file",
    "files",
    "course file",
    "the material",
    "materials",
    "study guide",
    "the guide",
    "the author",
    "the slides",
    "uploaded",
    "provided",
    "chapter",
    "section",
    "appendix",
    "table of contents",
    "glossary",
    "review questions",
    "page number",
    "page numbers",
    "preface",
    "bibliography",
    "citation",
    "how-to-use",
    "supplemental"
  ];
  window.__REVDEV_QUESTION_BLOCKLIST = BLOCKLIST;

  var QUALITY_RULES = [
    "ROLE: You are a university exam writer for a HARD, high-stakes exam on the SUBJECT in the text.",
    "",
    "CONTENT RULES (MUST):",
    "- Test the subject itself: concepts, mechanisms, definitions, rules, formulas, processes, trade-offs, causes and effects.",
    "- Every question MUST stand alone. A student who never saw the source file must understand it.",
    "- NEVER mention or imply the source. Forbidden in questions, options, AND explanations:",
    "  according to, the text, the passage, the document, the file(s), course files, the material(s),",
    "  study guide, the guide, the author, the slides, uploaded, provided, chapter, section, appendix,",
    "  table of contents, page, glossary, review questions, bibliography, preface.",
    "- Ignore front/back matter (TOC, preface, how-to-use, citations, appendices, glossary listings, reference lists).",
    "- Never ask about layout, order of sections, or what the document contains.",
    "",
    "DIFFICULTY RULES (MUST):",
    "- At least 70% require application, analysis, or evaluation: scenarios, best approach, compare/contrast,",
    "  cause-effect, edge cases, troubleshooting, multi-step reasoning, calculations when content supports them.",
    "- Remaining questions may test precise important recall only — never trivial facts.",
    "- Cover DIFFERENT topics across the batch. Do NOT repeat the same concept with rephrased wording.",
    "- Each question must test a DISTINCT idea. If two questions would have the same answer concept, keep only one.",
    "",
    "PER TYPE:",
    "- Multiple choice: 4 options, one best answer. Wrong options MUST be plausible domain concepts or common",
    "  misconceptions — similar length, no absurd/off-topic distractors, no all/none of the above.",
    "- CRITICAL: Randomize the position of the correct answer. Across a batch, correct answers must be",
    "  roughly evenly split among A, B, C, and D. NEVER put the correct answer as A for every question.",
    "  Do not follow any fixed pattern (all A, alternating A/B, etc.).",
    "- True/False: precise statement wrong only on a meaningful detail.",
    "- Identification: describe by characteristics without naming it.",
    "- Short answer: 1–3 sentences of reasoning; include key points a correct answer must contain.",
    "- Explanations: why the answer is right and why the strongest wrong option is wrong. Never mention the source."
  ].join("\n");

  /* ---------- Source text cleaning (preview left untouched) ---------- */
  function isTocLine(line) {
    var t = String(line || "");
    // dotted leaders + page number: "2.4 Network-Bound Workloads ........ 7"
    if (/\.{4,}\s*\d+\s*$/.test(t)) return true;
    if (/\u2026{2,}|\.{3,}\s*\d+\s*$/.test(t)) return true;
    // "Chapter 3 - Metrics ........ 9"
    if (/^\s*chapter\s+\d+/i.test(t) && /\d+\s*$/.test(t) && t.length < 120) return true;
    return false;
  }

  function isPageHeaderLine(line) {
    var t = String(line || "").trim();
    if (/^study\s+guide\s+page\s+\d+/i.test(t)) return true;
    if (/^page\s+\d+\s+of\s+\d+/i.test(t)) return true;
    if (/^\d+\s+of\s+\d+$/i.test(t)) return true;
    return false;
  }

  function isBibliographyBlockStart(line) {
    var t = String(line || "").trim().toLowerCase();
    return /^(references|bibliography|works cited|reference list|further reading)\s*$/.test(t);
  }

  function cleanSourceText(raw) {
    var text = String(raw || "");
    if (!text) return text;
    var lines = text.split(/\r?\n/);
    var out = [];
    var inBib = false;
    var dropped = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (isBibliographyBlockStart(line)) {
        inBib = true;
        dropped++;
        continue;
      }
      // End bibliography if we hit a clear new major heading that is not a ref line
      if (inBib) {
        if (/^\s*chapter\s+\d+/i.test(line) || /^\s*\d+\.\d+\s+\S/.test(line)) {
          inBib = false;
        } else {
          dropped++;
          continue;
        }
      }
      if (isTocLine(line) || isPageHeaderLine(line)) {
        dropped++;
        continue;
      }
      out.push(line);
    }
    if (dropped > 0) {
      console.info("[RevDev] cleanSourceText removed " + dropped + " structural line(s)");
    }
    return out.join("\n");
  }

  window.__revdevCleanSourceText = cleanSourceText;

  function textHitsBlocklist(s) {
    var t = String(s || "").toLowerCase();
    if (!t) return false;
    for (var i = 0; i < BLOCKLIST.length; i++) {
      if (t.indexOf(BLOCKLIST[i]) !== -1) return true;
    }
    return false;
  }

  function questionFailsBlocklist(q) {
    if (!q) return true;
    if (textHitsBlocklist(q.question)) return true;
    if (textHitsBlocklist(q.explanation)) return true;
    if (textHitsBlocklist(q.front) || textHitsBlocklist(q.back) || textHitsBlocklist(q.topic)) return true;
    var opts = q.options || [];
    for (var i = 0; i < opts.length; i++) {
      if (textHitsBlocklist(opts[i])) return true;
    }
    var ans = q.answers || [];
    for (var j = 0; j < ans.length; j++) {
      if (textHitsBlocklist(ans[j])) return true;
    }
    return false;
  }

  function tokenize(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(function (w) {
        return w.length > 3 &&
          !/^(this|that|with|from|when|what|which|where|while|during|about|their|there|these|those|into|than|then|also|only|most|more|some|such|have|been|being|will|would|could|should|does|each|both|other|after|before|under|over)$/.test(w);
      });
  }

  function fingerprint(q) {
    var text = String((q && (q.question || q.front || q.topic)) || "");
    var tokens = tokenize(text).sort();
    var uniq = [];
    var seen = Object.create(null);
    for (var i = 0; i < tokens.length; i++) {
      if (seen[tokens[i]]) continue;
      seen[tokens[i]] = 1;
      uniq.push(tokens[i]);
      if (uniq.length >= 12) break;
    }
    return uniq.join(" ");
  }

  function jaccard(a, b) {
    var sa = tokenize(a);
    var sb = tokenize(b);
    if (!sa.length || !sb.length) return 0;
    var setA = Object.create(null);
    var setB = Object.create(null);
    sa.forEach(function (w) { setA[w] = 1; });
    sb.forEach(function (w) { setB[w] = 1; });
    var inter = 0;
    var union = 0;
    Object.keys(setA).forEach(function (w) {
      union++;
      if (setB[w]) inter++;
    });
    Object.keys(setB).forEach(function (w) {
      if (!setA[w]) union++;
    });
    return union ? inter / union : 0;
  }

  function isNearDuplicate(q, accepted) {
    var text = String((q && (q.question || q.front || q.topic)) || "");
    var fp = fingerprint(q);
    for (var i = 0; i < accepted.length; i++) {
      var other = String((accepted[i].question || accepted[i].front || accepted[i].topic) || "");
      if (jaccard(text, other) >= 0.55) return true;
      if (fp && fingerprint(accepted[i]) === fp) return true;
      var aAns = String(((q.answers || [])[0]) || "").toLowerCase().trim();
      var bAns = String(((accepted[i].answers || [])[0]) || "").toLowerCase().trim();
      if (aAns && bAns && aAns === bAns && jaccard(text, other) >= 0.35) return true;
    }
    return false;
  }

  function normalizeAnswerKey(s) {
    return String(s || "").trim().toLowerCase();
  }

  function dropReason(q, accepted) {
    if (!q) return "empty";
    if (questionFailsBlocklist(q)) return "blocklist";
    if (isNearDuplicate(q, accepted)) return "duplicate";
    return null;
  }

  function shuffleQuestionOptions(q) {
    if (!q || !Array.isArray(q.options) || q.options.length < 2) return q;
    var type = String(q.type || "").toLowerCase().replace(/\s+/g, "_");
    if (type !== "multiple_choice" && type !== "true_false") return q;
    var opts = q.options.slice();
    for (var i = opts.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = opts[i];
      opts[i] = opts[j];
      opts[j] = tmp;
    }
    q.options = opts;
    return q;
  }

  function balanceCorrectPositions(items) {
    if (!Array.isArray(items) || !items.length) return items;
    var mc = [];
    items.forEach(function (q, idx) {
      var type = String(q.type || "").toLowerCase().replace(/\s+/g, "_");
      if ((type === "multiple_choice" || type === "true_false") && Array.isArray(q.options) && q.options.length >= 2) {
        mc.push(idx);
      }
    });
    if (mc.length < 2) return items;
    mc.forEach(function (idx) { shuffleQuestionOptions(items[idx]); });
    function correctIndex(q) {
      var answers = (q.answers || []).map(normalizeAnswerKey).filter(Boolean);
      if (!answers.length) return -1;
      for (var i = 0; i < q.options.length; i++) {
        if (answers.indexOf(normalizeAnswerKey(q.options[i])) !== -1) return i;
      }
      for (var a = 0; a < answers.length; a++) {
        if (/^[a-d]$/.test(answers[a])) return answers[a].charCodeAt(0) - 97;
      }
      return -1;
    }
    var atZero = 0;
    mc.forEach(function (idx) {
      if (correctIndex(items[idx]) === 0) atZero++;
    });
    if (atZero / mc.length > 0.45) {
      mc.forEach(function (idx) {
        if (correctIndex(items[idx]) !== 0) return;
        var tries = 0;
        while (correctIndex(items[idx]) === 0 && tries < 8) {
          shuffleQuestionOptions(items[idx]);
          tries++;
        }
      });
    }
    return items;
  }

  function filterItems(items) {
    var out = [];
    var rejected = 0;
    var log = [];
    (items || []).forEach(function (q, i) {
      var reason = dropReason(q, out);
      if (reason) {
        rejected++;
        log.push({
          index: i,
          reason: reason,
          question: String((q && (q.question || q.front || q.topic)) || "").slice(0, 120)
        });
        return;
      }
      out.push(q);
    });
    out.forEach(function (q) { shuffleQuestionOptions(q); });
    balanceCorrectPositions(out);
    if (log.length) {
      console.info("[RevDev] filter dropped " + log.length + " item(s):", log);
    }
    window.__revdevLastFilterLog = log;
    return { items: out, rejected: rejected, log: log };
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
    return list;
  }

  function setStatus(msg, kind) {
    var el = document.getElementById("generation-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status-message" + (kind ? " " + kind : "");
  }

  function ensureMissingButton(missing) {
    var row =
      document.querySelector(".generate-card .action-row") ||
      (document.getElementById("generate-button") &&
        document.getElementById("generate-button").parentNode);
    if (!row) return;
    var btn = document.getElementById("generate-missing");
    if (missing <= 0) {
      if (btn) btn.hidden = true;
      return;
    }
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "generate-missing";
      btn.type = "button";
      btn.className = "button secondary";
      btn.style.marginLeft = "8px";
      row.appendChild(btn);
      btn.addEventListener("click", function () {
        var gen = document.getElementById("generate-button");
        if (gen && !gen.disabled) gen.click();
      });
    }
    btn.hidden = false;
    btn.textContent = "Generate missing " + missing;
  }

  function syncExamUI(items, requested) {
    var n = items.length;
    var countEl = document.getElementById("exam-count");
    if (countEl) countEl.textContent = n + " questions";
    if (typeof window.__revdevRenderExamClean === "function") {
      try { window.__revdevRenderExamClean(items); } catch (e) {}
    }
    var provider = (window.__revdevJob && window.__revdevJob.provider === "groq") ? "Groq" : "Gemini";
    if (n >= requested && requested > 0) {
      setStatus("Done. Generated " + n + " item(s) using " + provider + ".", "success");
      ensureMissingButton(0);
    } else if (n > 0) {
      setStatus("Generated " + n + " of " + requested + " requested.", "error");
      ensureMissingButton(Math.max(0, requested - n));
    }
    if (typeof window.__revdevAssertCountsMatch === "function") {
      try { window.__revdevAssertCountsMatch(); } catch (e) {}
    }
  }

  /* ---------- Top-up after quality filter ---------- */
  var toppingUp = false;

  async function topUpToRequested(requested) {
    if (toppingUp) return;
    var job = window.__revdevJob;
    if (!job || job.mode !== "exam") return;
    var items = (job.collected || []).slice();
    if (items.length >= requested) return;

    toppingUp = true;
    window.__revdevExamReady = false;
    try {
      var rounds = 0;
      while (items.length < requested && rounds < 3) {
        rounds++;
        var missing = requested - items.length;
        var ask = Math.min(requested, Math.ceil(missing * 1.2) || missing);
        setStatus(
          "Top-up round " + rounds + ": generating " + ask + " more (have " + items.length + "/" + requested + ")…",
          ""
        );
        var avoid = items.map(function (q) {
          return String(q.question || "").trim();
        }).filter(Boolean).slice(-40);

        var cleaned = cleanSourceText(job.sourceText || window.__revdevExtractedText || "");
        var dist = null;
        if (typeof window.__revdevDistributeTypes === "function") {
          try { dist = window.__revdevDistributeTypes(ask, job.types); } catch (e) {}
        }
        var prompt = [
          "Create exactly the exam questions requested below from ONLY this source text.",
          dist ? "QUOTA for this batch: " + JSON.stringify(dist) : "Create exactly " + ask + " questions.",
          "Use type values: multiple_choice, true_false, identification, short_answer.",
          "For multiple_choice: exactly 4 options and 1 correct answer.",
          "For true_false: options True and False, 1 correct answer.",
          "For identification/short_answer: options empty array, answers with acceptable answers.",
          "Every question must be answerable from the source. Include a short explanation.",
          avoid.length ? "Do NOT repeat any of these existing questions: " + JSON.stringify(avoid) : "",
          "",
          "SOURCE:",
          cleaned || job.sourceText || ""
        ].join("\n");

        var schema = {
          type: "object",
          additionalProperties: false,
          required: ["questions"],
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["type", "question", "options", "answers", "explanation"],
                properties: {
                  type: { type: "string" },
                  topic: { type: "string" },
                  question: { type: "string" },
                  options: { type: "array", items: { type: "string" } },
                  answers: { type: "array", items: { type: "string" } },
                  explanation: { type: "string" }
                }
              }
            }
          }
        };

        if (typeof window.__revdevRunBatch !== "function") break;
        var result;
        try {
          result = await window.__revdevRunBatch(
            prompt,
            schema,
            "Write HARD university-exam questions on the subject only. Never mention documents, chapters, guides, files, or materials.",
            job.provider,
            function (msg) { setStatus(msg, ""); }
          );
        } catch (err) {
          console.error("[RevDev] top-up failed", err);
          break;
        }
        var fresh = (result && result.data && result.data.questions) || [];
        // filterItems already applied inside wrapped runBatch, but filter again against accepted
        var filtered = filterItems(fresh);
        filtered.items.forEach(function (q) {
          var key = String(q.question || "").trim().toLowerCase();
          if (!key) return;
          if (job.seen && job.seen.has && job.seen.has(key)) return;
          if (isNearDuplicate(q, items)) return;
          if (job.seen && job.seen.add) job.seen.add(key);
          items.push(q);
        });
        if (result && result.provider) job.provider = result.provider;
      }

      // Trim to requested
      if (items.length > requested) items = items.slice(0, requested);
      job.collected = items;
      publishFinal(items);
      syncExamUI(items, requested);
    } finally {
      toppingUp = false;
      window.__revdevExamReady = true;
    }
  }

  function applyFilterToJob() {
    var job = window.__revdevJob;
    var last = window.__revdevLastResult;
    var items = null;
    if (job && Array.isArray(job.collected)) items = job.collected;
    else if (last && Array.isArray(last.items)) items = last.items;
    if (!items || !items.length) return null;

    var result = filterItems(items);
    if (job) {
      job.collected = result.items;
      if (job.seen && typeof job.seen.clear === "function") {
        try {
          job.seen.clear();
          result.items.forEach(function (q) {
            var key = String(q.question || q.front || q.topic || "").trim().toLowerCase();
            if (key) job.seen.add(key);
          });
        } catch (e) {}
      }
    }
    if (last) last.items = result.items;
    publishFinal(result.items);

    var mode = (job && job.mode) || (last && last.mode) || "exam";
    if (typeof window.__revdevRenderExamClean === "function" && mode === "exam") {
      try { window.__revdevRenderExamClean(result.items); } catch (e) {}
    }

    var requested = (job && job.totalWanted) || result.items.length;
    if (mode === "exam" && result.items.length < requested && result.rejected > 0) {
      // Kick off top-up asynchronously
      topUpToRequested(requested);
    } else if (mode === "exam") {
      syncExamUI(result.items, requested);
      window.__revdevExamReady = true;
    }

    return result;
  }

  function tryWrapRunBatch() {
    if (typeof window.__revdevRunBatch !== "function") return false;
    if (window.__revdevRunBatch.__hardQualityWrapped) return true;
    var original = window.__revdevRunBatch;
    window.__revdevRunBatch = async function (prompt, schema, systemText, preferredProvider, onStatus) {
      var p = String(prompt || "");
      var isStudy =
        /exam questions|QUOTA|multiple_choice|flashcards|topic review|summary/i.test(p);

      // Clean SOURCE: section in the prompt
      if (isStudy && /SOURCE:/i.test(p)) {
        var parts = p.split(/SOURCE:/i);
        if (parts.length >= 2) {
          var head = parts[0];
          var body = parts.slice(1).join("SOURCE:");
          body = cleanSourceText(body);
          p = head + "SOURCE:\n" + body;
        }
      }

      // Also clean job.sourceText once
      if (window.__revdevJob && window.__revdevJob.sourceText && !window.__revdevJob.__sourceCleaned) {
        window.__revdevJob.sourceText = cleanSourceText(window.__revdevJob.sourceText);
        window.__revdevJob.__sourceCleaned = true;
      }
      if (window.__revdevExtractedText && !window.__revdevExtractedCleaned) {
        // keep original for preview; store cleaned separately for generation
        window.__revdevExtractedTextClean = cleanSourceText(window.__revdevExtractedText);
        window.__revdevExtractedCleaned = true;
      }

      if (isStudy) {
        p = QUALITY_RULES + "\n\n" + p;
        var job = window.__revdevJob;
        if (job && Array.isArray(job.collected) && job.collected.length) {
          var avoid = job.collected.map(function (q) {
            return String(q.question || q.front || "").trim();
          }).filter(Boolean).slice(-30);
          if (avoid.length) {
            p += "\n\nALREADY GENERATED — do NOT rephrase or repeat these topics/questions:\n" +
              JSON.stringify(avoid);
          }
        }
      }
      var sys =
        String(systemText || "") +
        " Write HARD university-exam questions on the subject only. " +
        "Never mention documents, chapters, guides, files, or materials. " +
        "No near-duplicate questions. Wrong options must be plausible domain misconceptions. " +
        "Randomize correct-answer positions across A/B/C/D — never all A. " +
        "Ignore table of contents, page numbers, prefaces, appendices, glossaries, and reference lists.";
      var result = await original.call(this, p, schema, sys, preferredProvider, onStatus);
      try {
        if (result && result.data) {
          if (Array.isArray(result.data.questions)) {
            result.data.questions = filterItems(result.data.questions).items;
          }
          if (Array.isArray(result.data.cards)) {
            result.data.cards = filterItems(result.data.cards).items;
          }
          if (Array.isArray(result.data.topics)) {
            result.data.topics = filterItems(result.data.topics).items;
          }
        }
      } catch (e) {}
      return result;
    };
    window.__revdevRunBatch.__hardQualityWrapped = true;
    console.info("RevDev: hard quality + source clean + top-up armed");
    return true;
  }

  var tries = 0;
  (function waitWrap() {
    if (tryWrapRunBatch()) return;
    tries++;
    if (tries < 40) setTimeout(waitWrap, 250);
  })();

  // Also clean extracted text as soon as it appears (for job.sourceText later)
  var previewEl = document.getElementById("preview");
  if (previewEl) {
    new MutationObserver(function () {
      if (window.__revdevExtractedText && !window.__revdevExtractedCleaned) {
        window.__revdevExtractedTextClean = cleanSourceText(window.__revdevExtractedText);
        window.__revdevExtractedCleaned = true;
      }
    }).observe(previewEl, { childList: true, characterData: true, subtree: true });
  }

  var statusEl = document.getElementById("generation-status");
  if (statusEl) {
    var t = null;
    new MutationObserver(function () {
      var text = statusEl.textContent || "";
      if (!/Done\.|Generated \d+|source supported/i.test(text)) return;
      // Skip our own top-up status lines
      if (/Top-up round/i.test(text)) return;
      if (t) clearTimeout(t);
      t = setTimeout(function () {
        if (toppingUp) return;
        var r = applyFilterToJob();
        if (!r) return;
        // applyFilterToJob handles top-up + syncExamUI
      }, 250);
    }).observe(statusEl, { childList: true, characterData: true, subtree: true });
  }
})();
