/* RevDev loader: dual-key app from known-good CDN commit + full-count fill */
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

/* After dual app loads: force full requested count by filling remaining items */
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
            "Create EXACTLY " + need + " exam questions from ONLY this source text.",
            "You MUST return exactly " + need + " questions. Do not return fewer.",
            "Cover the same facts from different angles if needed without inventing new facts.",
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
            "Create EXACTLY " + need + " flashcards from ONLY this source.",
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
            "Use ONLY the source text. Return valid JSON matching the schema. Never invent facts.",
            provider,
            function (msg) { setStatus(msg, ""); }
          );
          const data = result.data || {};
          const before = items.length;
          if (mode === "exam" && data.questions) {
            data.questions.forEach(function (q) {
              const key = String(q.question || "").trim().toLowerCase();
              if (!key || seen.has(key)) return;
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
        document.dispatchEvent(new CustomEvent("revdev-items-ready", { detail: { mode: mode, items: items } }));
        // Re-click internal render if dual exposed a job render path via status
        try {
          const form = document.getElementById("exam-form");
          const out = document.getElementById("exam-output");
          if (out) out.hidden = false;
          if (form && mode === "exam" && items.length && window.__revdevJob) {
            // dual app's renderBatchResult is not global; leave items in job for submit scoring
          }
        } catch (e) {}
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
