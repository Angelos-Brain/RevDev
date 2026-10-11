/* ============================================================
   HARD exam quality: prompt rules + blocklist + near-dup filter
   ============================================================ */
(function installHardQuestionQuality() {
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
    "- Ignore front/back matter (TOC, preface, how-to-use, citations, appendices, glossary listings).",
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
    "- True/False: precise statement wrong only on a meaningful detail.",
    "- Identification: describe by characteristics without naming it.",
    "- Short answer: 1–3 sentences of reasoning; include key points a correct answer must contain.",
    "- Explanations: why the answer is right and why the strongest wrong option is wrong. Never mention the source."
  ].join("\n");

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

  function filterItems(items) {
    var out = [];
    var rejected = 0;
    (items || []).forEach(function (q) {
      if (questionFailsBlocklist(q)) {
        rejected++;
        return;
      }
      if (isNearDuplicate(q, out)) {
        rejected++;
        return;
      }
      out.push(q);
    });
    return { items: out, rejected: rejected };
  }

  function applyFilterToJob() {
    var job = window.__revdevJob;
    var last = window.__revdevLastResult;
    var items = null;
    if (job && Array.isArray(job.collected)) items = job.collected;
    else if (last && Array.isArray(last.items)) items = last.items;
    if (!items || !items.length) return null;

    var result = filterItems(items);
    if (result.rejected === 0 && result.items.length === items.length) return result;

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
    window.__revdevPristineExamItems = result.items.map(function (q) {
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

    if (typeof window.__revdevRenderExamClean === "function" && (job && job.mode === "exam" || last && last.mode === "exam")) {
      try { window.__revdevRenderExamClean(result.items); } catch (e) {}
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
        "No near-duplicate questions. Wrong options must be plausible domain misconceptions.";
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
    console.info("RevDev: hard question quality + near-dup filter armed");
    return true;
  }

  var tries = 0;
  (function waitWrap() {
    if (tryWrapRunBatch()) return;
    tries++;
    if (tries < 40) setTimeout(waitWrap, 250);
  })();

  var statusEl = document.getElementById("generation-status");
  if (statusEl) {
    var t = null;
    new MutationObserver(function () {
      var text = statusEl.textContent || "";
      if (!/Done\.|Generated \d+/i.test(text)) return;
      if (t) clearTimeout(t);
      t = setTimeout(function () {
        var r = applyFilterToJob();
        if (!r) return;
        if (r.rejected > 0) {
          var n = r.items.length;
          var job = window.__revdevJob || {};
          var requested = job.totalWanted || n;
          var provider = job.provider === "groq" ? "Groq" : "Gemini";
          if (n >= requested) {
            statusEl.textContent = "Done. Generated " + n + " item(s) using " + provider + ".";
            statusEl.className = "status-message success";
          } else {
            statusEl.textContent =
              "Generated " + n + " of " + requested +
              " after removing " + r.rejected + " weak/duplicate item(s).";
            statusEl.className = "status-message error";
          }
          var countEl = document.getElementById("exam-count");
          if (countEl && (job.mode === "exam" || !job.mode)) {
            countEl.textContent = n + " questions";
          }
        }
      }, 200);
    }).observe(statusEl, { childList: true, characterData: true, subtree: true });
  }
})();
