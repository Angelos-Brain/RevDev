/* RevDev loader: dual-key app + quality exam prompts + full-count top-up + retake */
(function ensureLegacyElements() {
  const stubs = [
    { id: "toggle-key", tag: "button", type: "button" },
    { id: "load-model-button", tag: "button", type: "button" },
    { id: "model-select", tag: "select" },
    { id: "model-status", tag: "div" },
    { id: "model-progress", tag: "div" },
    { id: "model-progress-fill", tag: "div" },
    { id: "model-meta", tag: "div" },
    { id: "auto-fallback", tag: "input", type: "checkbox" }
  ];
  const host = document.createElement("div");
  host.id = "revdev-legacy-stubs";
  host.hidden = true;
  host.setAttribute("aria-hidden", "true");
  stubs.forEach(function (s) {
    if (document.getElementById(s.id)) return;
    const el = document.createElement(s.tag);
    el.id = s.id;
    if (s.type) el.type = s.type;
    host.appendChild(el);
  });
  document.body.appendChild(host);
})();

(function wireKeyVisibilityToggles() {
  var pairs = [
    { btn: "toggle-key-gemini", input: "api-key-gemini" },
    { btn: "toggle-key-groq", input: "api-key-groq" },
    { btn: "toggle-gemini-key", input: "gemini-key" },
    { btn: "toggle-groq-key", input: "groq-key" },
    { btn: "toggle-key", input: "api-key" }
  ];
  function bindOne(btnId, inputId) {
    var btn = document.getElementById(btnId);
    var input = document.getElementById(inputId);
    if (!btn || !input || btn.dataset.revdevToggleBound === "1") return;
    btn.dataset.revdevToggleBound = "1";
    btn.type = "button";
    btn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
    });
  }
  function bindAll() { pairs.forEach(function (p) { bindOne(p.btn, p.input); }); }
  bindAll();
  setTimeout(bindAll, 0);
  setTimeout(bindAll, 500);
  setTimeout(bindAll, 1500);
  document.addEventListener("click", function (event) {
    var btn = event.target && event.target.closest
      ? event.target.closest("#toggle-key-gemini, #toggle-key-groq, #toggle-gemini-key, #toggle-groq-key, #toggle-key")
      : null;
    if (!btn) return;
    var map = {
      "toggle-key-gemini": "api-key-gemini",
      "toggle-key-groq": "api-key-groq",
      "toggle-gemini-key": "gemini-key",
      "toggle-groq-key": "groq-key",
      "toggle-key": "api-key"
    };
    var input = document.getElementById(map[btn.id]);
    if (!input) return;
    event.preventDefault();
    event.stopPropagation();
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Hide" : "Show";
  }, true);
})();

async function inflateBase64Gzip(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}

const QUALITY_RULES = [
  "QUALITY RULES (mandatory — follow every rule):",
  "GOAL: Write HARD, concept-focused exam questions that test deep understanding of the subject.",
  "",
  "BANNED phrasing — never use these in question stems or options:",
  "- according to the course files / according to the file(s) / according to the material / according to the study guide",
  "- study guide, course file, document, handout, chapter, section, appendix, preface, table of contents",
  "- supplemental materials, exam preparation resources, provided at the end of the guide",
  "- how many pages, which chapter covers, on which page, prepared for, publication date",
  "",
  "BANNED question types:",
  "- Document structure or navigation (TOC, chapters, page counts, appendices)",
  "- Meta questions about the guide itself or how the course is organized",
  "- Trivial recall of headings, titles, or what is listed at the end",
  "- Soft/easy dictionary-style one-word definition dumps when deeper reasoning is possible",
  "",
  "REQUIRED difficulty (HARD):",
  "- Prefer application, analysis, comparison, cause-effect, what happens if, multi-step reasoning",
  "- Require understanding of relationships between concepts, not just naming a term",
  "- Wrong options must be close, technical, and tempting (common misconceptions)",
  "- Avoid questions a student could answer without studying the real content",
  "",
  "GOOD stems (examples of style, not content to copy):",
  "- What is the primary reason X is used instead of Y?",
  "- If condition A fails, which outcome is most likely?",
  "- Which statement best distinguishes X from Y?",
  "- Why does process Z require step N before step M?",
  "",
  "Write questions as a real subject exam. Never mention files, guides, or materials in the stem.",
  "Each explanation must teach the underlying concept in 1-2 sentences."
].join("\n");

const CDN = "https://cdn.jsdelivr.net/gh/Angelos-Brain/RevDev@3e34207/docs/";
const parts = [];
for (let i = 0; i < 4; i++) {
  const res = await fetch(CDN + "dual_c" + i + ".txt");
  if (!res.ok) throw new Error("Missing dual_c" + i + ".txt from CDN");
  parts.push((await res.text()).replace(/\s+/g, ""));
}
const source = await inflateBase64Gzip(parts.join(""));
const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
await import(url);

(function patchPromptQuality() {
  if (typeof window.__revdevRunBatch !== "function") return;
  const original = window.__revdevRunBatch;
  window.__revdevRunBatch = async function (prompt, schema, systemText, preferredProvider, onStatus) {
    let p = String(prompt || "");
    const isExam = /exam questions|QUOTA for this batch|multiple_choice/i.test(p);
    const isCards = /flashcards/i.test(p);
    if (isExam || isCards) {
      p = QUALITY_RULES + "\n\n" + p;
    }
    const sys = String(systemText || "") +
      " Write HARD subject-matter exam questions only. Never mention study guides, files, materials, chapters, pages, or document structure. Test concepts, reasoning, and application.";
    return original.call(this, p, schema, sys, preferredProvider, onStatus);
  };
  console.info("RevDev: quality prompt filter armed");
})();

function isMetaQuestion(q) {
  return /according to the (course )?file|according to the material|according to the study guide|study guide|course file|supplemental material|exam preparation|end of the guide|how many (total )?pages|which chapter covers|table of contents|prepared for|publication date|page markers|how many chapters|document states|file name|in the (preface|appendix)|provided at the end|handout|course material/i.test(q);
}

(function installFullCountFill() {
  function setStatus(msg, kind) {
    const el = document.getElementById("generation-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status-message" + (kind ? " " + kind : "");
  }
  function setProgress(pct) {
    const bar = document.getElementById("progress");
    const fill = document.getElementById("progress-fill");
    if (bar) bar.hidden = false;
    if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
  }

  const statusEl = document.getElementById("generation-status");
  if (!statusEl) return;

  let topping = false;
  const observer = new MutationObserver(async function () {
    if (topping) return;
    const text = statusEl.textContent || "";
    const m = text.match(/requested\s+(\d+).*supported\s+(\d+)/i);
    if (!m) return;
    const requested = parseInt(m[1], 10);
    const got = parseInt(m[2], 10);
    if (!requested || !got || got >= requested) return;
    if (!window.__revdevRunBatch || !window.__revdevLastResult) return;

    topping = true;
    try {
      const job = window.__revdevJob || {};
      const mode = (window.__revdevLastResult && window.__revdevLastResult.mode) || job.mode || "exam";
      let items = (window.__revdevLastResult && window.__revdevLastResult.items) || job.collected || [];
      const seen = new Set(items.map(function (q) {
        return String(q.question || q.front || q.topic || "").trim().toLowerCase();
      }).filter(Boolean));
      const sourceText = (job.sourceText || window.__revdevSourceText || "").slice(0, 120000);
      if (!sourceText) {
        setStatus("Generated " + items.length + " of " + requested + ". Cannot top up without source text.", "error");
        return;
      }

      const types = job.types || ["multiple_choice"];
      const provider = job.provider || "gemini";
      let emptyStreak = 0;
      let round = 0;

      while (items.length < requested && round < 12 && emptyStreak < 4) {
        round++;
        const need = Math.min(20, requested - items.length);
        setStatus("Filling remaining items: " + items.length + "/" + requested + " (pass " + round + ")…", "");
        setProgress((items.length / requested) * 100);

        const avoidList = Array.from(seen).slice(-50);
        let prompt, schema;
        if (mode === "exam") {
          schema = {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    question: { type: "string" },
                    options: { type: "array", items: { type: "string" } },
                    answers: { type: "array", items: { type: "string" } },
                    explanation: { type: "string" },
                    topic: { type: "string" }
                  },
                  required: ["type", "question", "answers", "explanation"]
                }
              }
            },
            required: ["questions"]
          };
          const dist = window.__revdevDistributeTypes
            ? window.__revdevDistributeTypes(need, types)
            : { multiple_choice: need };
          prompt = [
            QUALITY_RULES,
            "Create EXACTLY " + need + " HARD concept-focused exam questions from ONLY this source text.",
            "You MUST return exactly " + need + " questions. Do not return fewer.",
            "Never mention study guides, files, materials, chapters, or pages in the stems.",
            "QUOTA: " + JSON.stringify(dist),
            "Types: multiple_choice, true_false, identification, short_answer.",
            avoidList.length ? "Do NOT repeat: " + JSON.stringify(avoidList) : "",
            "",
            "SOURCE:",
            sourceText
          ].join("\n");
        } else if (mode === "flashcards") {
          schema = {
            type: "object",
            properties: {
              cards: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    front: { type: "string" },
                    back: { type: "string" },
                    topic: { type: "string" }
                  },
                  required: ["front", "back"]
                }
              }
            },
            required: ["cards"]
          };
          prompt = [
            QUALITY_RULES,
            "Create EXACTLY " + need + " conceptual flashcards from ONLY this source.",
            "Front = term or challenging question; back = clear definition or answer. No page/chapter/file trivia.",
            "You MUST return exactly " + need + " cards.",
            avoidList.length ? "Do NOT repeat fronts: " + JSON.stringify(avoidList) : "",
            "",
            "SOURCE:",
            sourceText
          ].join("\n");
        } else {
          break;
        }

        try {
          const result = await window.__revdevRunBatch(
            prompt,
            schema,
            "Use ONLY the source text. Return valid JSON. Never invent facts. Never test document layout. Write HARD questions.",
            provider,
            function (msg) { setStatus(msg, ""); }
          );
          const data = result.data || {};
          const before = items.length;
          if (mode === "exam" && data.questions) {
            data.questions.forEach(function (q) {
              const key = String(q.question || "").trim().toLowerCase();
              if (!key || seen.has(key)) return;
              if (isMetaQuestion(key)) return;
              seen.add(key);
              items.push(q);
            });
          } else if (mode === "flashcards" && data.cards) {
            data.cards.forEach(function (c) {
              const key = String(c.front || "").trim().toLowerCase();
              if (!key || seen.has(key)) return;
              seen.add(key);
              items.push(c);
            });
          }
          if (items.length > requested) items = items.slice(0, requested);
          if (items.length === before) emptyStreak++;
          else emptyStreak = 0;

          window.__revdevLastResult = { mode: mode, items: items };
          if (window.__revdevJob) {
            window.__revdevJob.collected = items;
            window.__revdevJob.seen = seen;
          }
          const count = document.getElementById("exam-count");
          if (count && mode === "exam") count.textContent = items.length + " questions";
        } catch (err) {
          console.error("top-up failed", err);
          emptyStreak++;
          if (String(err.message || err).match(/429|quota|rate limit/i)) break;
        }
      }

      if (items.length >= requested) {
        setStatus("Done. Generated " + items.length + " item(s).", "success");
        setProgress(100);
        if (window.__revdevJob) window.__revdevJob.collected = items;
      } else {
        setStatus(
          "Generated " + items.length + " of " + requested +
            " after extra attempts. Try Generate again.",
          "error"
        );
      }
    } finally {
      topping = false;
    }
  });
  observer.observe(statusEl, { childList: true, characterData: true, subtree: true });
  console.info("RevDev: full-count top-up armed");
})();

(function installRetakeExam() {
  function resetExamForm() {
    const form = document.getElementById("exam-form");
    const results = document.getElementById("exam-results");
    const submitBtn = document.getElementById("submit-exam");
    const retakeBtn = document.getElementById("retake-exam");
    const answerReview = document.getElementById("answer-review");
    const weakTopics = document.getElementById("weak-topics");
    const scoreEl = document.getElementById("exam-score");
    const percentEl = document.getElementById("exam-percent");

    if (form) {
      form.querySelectorAll(".exam-question").forEach(function (fs) {
        fs.classList.remove("is-correct", "is-incorrect");
        fs.querySelectorAll(".choice-option").forEach(function (opt) {
          opt.classList.remove("is-correct", "is-user-wrong", "is-right-answer");
        });
        fs.querySelectorAll("input, textarea, select").forEach(function (el) {
          el.disabled = false;
          if (el.type === "radio" || el.type === "checkbox") el.checked = false;
          else el.value = "";
        });
        fs.querySelectorAll(".explanation-box, .exam-explanation, .answer-feedback").forEach(function (box) {
          box.remove();
        });
      });
    }

    if (results) results.hidden = true;
    if (answerReview) answerReview.innerHTML = "";
    if (weakTopics) weakTopics.innerHTML = "";
    if (scoreEl) scoreEl.textContent = "0 / 0";
    if (percentEl) percentEl.textContent = "0%";
    if (submitBtn) {
      submitBtn.hidden = false;
      submitBtn.disabled = false;
    }
    if (retakeBtn) retakeBtn.hidden = true;

    if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function bindRetake() {
    const retakeBtn = document.getElementById("retake-exam");
    if (!retakeBtn || retakeBtn.dataset.revdevRetakeBound === "1") return;
    retakeBtn.dataset.revdevRetakeBound = "1";
    retakeBtn.type = "button";
    retakeBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      resetExamForm();
    });
  }

  bindRetake();
  setTimeout(bindRetake, 500);
  setTimeout(bindRetake, 1500);

  document.addEventListener(
    "click",
    function (event) {
      const btn = event.target && event.target.closest
        ? event.target.closest("#retake-exam")
        : null;
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      resetExamForm();
    },
    true
  );

  console.info("RevDev: exam retake armed");
})();
