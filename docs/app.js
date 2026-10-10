/* RevDev cloud bootstrap v10 — green/red choices + explanation only */
(function () {
  const originalFetch = window.fetch.bind(window);
  const GEMINI_FREE_MODEL = "gemini-3.5-flash-lite";

  function stripAdditionalProperties(value) {
    if (Array.isArray(value)) return value.map(stripAdditionalProperties);
    if (!value || typeof value !== "object") return value;
    const cleaned = {};
    Object.keys(value).forEach(function (key) {
      if (key === "additionalProperties") return;
      cleaned[key] = stripAdditionalProperties(value[key]);
    });
    return cleaned;
  }

  function isRateLimitBody(body) {
    if (!body) return false;
    const text = JSON.stringify(body).toLowerCase();
    return (
      text.includes("resource_exhausted") ||
      text.includes("rate limit") ||
      text.includes("quota") ||
      text.includes("limit reached") ||
      text.includes("too many requests")
    );
  }

  window.fetch = async function (url, options) {
    var requestUrl = url;
    var requestOptions = options;
    if (typeof requestUrl === "string" && requestUrl.includes("generativelanguage.googleapis.com")) {
      requestUrl = requestUrl.replace(/models\/[^:]+/, "models/" + encodeURIComponent(GEMINI_FREE_MODEL));
      if (requestOptions && typeof requestOptions.body === "string") {
        try {
          const body = JSON.parse(requestOptions.body);
          if (body.generationConfig && body.generationConfig.responseSchema) {
            body.generationConfig.responseSchema = stripAdditionalProperties(
              body.generationConfig.responseSchema
            );
            requestOptions = Object.assign({}, requestOptions, {
              body: JSON.stringify(body)
            });
          }
        } catch (e) {}
      }
    }
    const response = await originalFetch(requestUrl, requestOptions);
    if (!response.ok) {
      try {
        const clone = response.clone();
        const errBody = await clone.json();
        if (isRateLimitBody(errBody) || response.status === 429) {
          throw new Error(
            "Free-tier limit reached. Wait a few minutes, try a smaller file, or switch to Groq."
          );
        }
      } catch (e) {
        if (e && e.message && e.message.includes("Free-tier")) throw e;
      }
    }
    return response;
  };
})();

function ensureCloudAiUi() {
  if (!document.querySelector('link[href*="exam-feedback.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "exam-feedback.css?v=10";
    document.head.appendChild(link);
  }
  const aiCard = document.querySelector(".ai-card");
  if (!aiCard) return;
  if (!document.getElementById("provider-select")) {
    aiCard.innerHTML =
      '<div class="card-heading"><div><span class="section-kicker">2 · CONNECT FREE AI</span>' +
      "<h2>Choose a provider</h2></div><span class=\"mini-note\">No backend server</span></div>" +
      '<div class="settings-grid">' +
      '<label class="field"><span class="field-label">AI provider</span>' +
      '<select id="provider-select"><option value="gemini">Google Gemini (default)</option>' +
      '<option value="groq">Groq</option></select></label>' +
      '<label class="field api-key-field"><span class="field-label">API key</span>' +
      '<div class="api-key-row">' +
      '<input id="api-key" type="password" placeholder="Paste your free API key" autocomplete="off" spellcheck="false">' +
      '<button class="button secondary small-button" id="toggle-key" type="button">Show</button>' +
      "</div></label></div>" +
      '<div id="gemini-help" class="provider-help"><strong>Gemini</strong>' +
      "<p>Get a free key at Google AI Studio. Uses <code>gemini-3.5-flash-lite</code>.</p>" +
      '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Open Google AI Studio</a></div>' +
      '<div id="groq-help" class="provider-help" hidden><strong>Groq</strong>' +
      "<p>Get a free Groq API key for fast generation.</p>" +
      '<a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">Open Groq Console</a></div>' +
      '<p class="storage-note"><span class="dot"></span> Key stays in this browser only.</p>';
  }
  const pill = document.querySelector(".status-pill");
  if (pill) pill.textContent = "Free AI · Gemini / Groq";
}

window.__revdevGetExamSettings = function () {
  const slider = document.getElementById("item-count-slider");
  const number = document.getElementById("item-count");
  let count = number ? Number(number.value) : slider ? Number(slider.value) : 20;
  if (!Number.isFinite(count)) count = 20;
  count = Math.max(1, Math.min(100, Math.round(count)));
  const checks = document.querySelectorAll('input[name="exam-type"]');
  let types = Array.from(checks)
    .filter(function (c) { return c.checked; })
    .map(function (c) { return c.value; });
  if (!types.length) {
    types = ["multiple_choice", "true_false", "identification", "short_answer"];
  }
  return { count: count, types: types };
};

window.__revdevDistributeTypes = function (total, types) {
  const result = {
    multiple_choice: 0,
    true_false: 0,
    identification: 0,
    short_answer: 0
  };
  if (!types.length || total < 1) return result;
  const base = Math.floor(total / types.length);
  let rem = total - base * types.length;
  types.forEach(function (t) {
    result[t] = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
  });
  return result;
};

function wireItemCountControls() {
  const slider = document.getElementById("item-count-slider");
  const number = document.getElementById("item-count");
  if (!slider && !number) return;

  function clamp(v) {
    v = Number(v);
    if (!Number.isFinite(v)) v = 20;
    return Math.max(1, Math.min(100, Math.round(v)));
  }

  function syncFrom(source) {
    const v = clamp(source.value);
    if (slider) slider.value = String(v);
    if (number) number.value = String(v);
    try { localStorage.setItem("revdev_item_count", String(v)); } catch (e) {}
  }

  if (slider) {
    slider.min = "1";
    slider.max = "100";
    slider.oninput = function () { syncFrom(slider); };
    slider.onchange = function () { syncFrom(slider); };
  }
  if (number) {
    number.min = "1";
    number.max = "100";
    number.oninput = function () { syncFrom(number); };
    number.onchange = function () { syncFrom(number); };
  }

  let saved = 20;
  try { saved = clamp(localStorage.getItem("revdev_item_count") || "20"); } catch (e) {}
  if (slider) slider.value = String(saved);
  if (number) number.value = String(saved);
}

function patchExamConfig(source) {
  source = source.replace(
    /function getExamQuota\(chunkIndex, totalChunks\) \{[\s\S]*?\n\}\n\nfunction buildPrompt/,
    "function getExamQuota(chunkIndex, totalChunks) {\n" +
      "  const settings = (window.__revdevGetExamSettings && window.__revdevGetExamSettings()) || { count: 20, types: [\"multiple_choice\",\"true_false\",\"identification\",\"short_answer\"] };\n" +
      "  const dist = window.__revdevDistributeTypes(settings.count, settings.types);\n" +
      "  return {\n" +
      "    multiple_choice: distributeExamQuota(dist.multiple_choice, chunkIndex, totalChunks),\n" +
      "    true_false: distributeExamQuota(dist.true_false, chunkIndex, totalChunks),\n" +
      "    identification: distributeExamQuota(dist.identification, chunkIndex, totalChunks),\n" +
      "    short_answer: distributeExamQuota(dist.short_answer, chunkIndex, totalChunks)\n" +
      "  };\n" +
      "}\n\nfunction buildPrompt"
  );

  source = source.replace(
    "multiple_choice: 10,\n    true_false: 5,\n    identification: 3,\n    short_answer: 2",
    "multiple_choice: (window.__revdevDistributeTypes((window.__revdevGetExamSettings&&window.__revdevGetExamSettings()).count||20, (window.__revdevGetExamSettings&&window.__revdevGetExamSettings()).types||[\"multiple_choice\"]).multiple_choice),\n" +
      "    true_false: (window.__revdevDistributeTypes((window.__revdevGetExamSettings&&window.__revdevGetExamSettings()).count||20, (window.__revdevGetExamSettings&&window.__revdevGetExamSettings()).types||[\"true_false\"]).true_false),\n" +
      "    identification: (window.__revdevDistributeTypes((window.__revdevGetExamSettings&&window.__revdevGetExamSettings()).count||20, (window.__revdevGetExamSettings&&window.__revdevGetExamSettings()).types||[\"identification\"]).identification),\n" +
      "    short_answer: (window.__revdevDistributeTypes((window.__revdevGetExamSettings&&window.__revdevGetExamSettings()).count||20, (window.__revdevGetExamSettings&&window.__revdevGetExamSettings()).types||[\"short_answer\"]).short_answer)"
  );

  source = source.replace(/counts\.multiple_choice !== 10/g, "false");
  source = source.replace(/counts\.true_false !== 5/g, "false");
  source = source.replace(/counts\.identification !== 3/g, "false");
  source = source.replace(/counts\.short_answer !== 2/g, "false");

  source = source.replace(
    /The AI generated fewer than 20 unique source-backed exam questions\. Try generating again or use a smaller topic focus\./g,
    "The AI could not generate enough unique source-backed exam questions from the file. Try again, lower the item count, or use a broader topic focus."
  );

  source = source.replace(/state\.exam\.length !== 20/g, "state.exam.length < 1");

  source = source.replace(/a 20-item mock exam/g, "a mock exam");
  source = source.replace(
    /exactly 10 multiple_choice, 5 true_false, 3 identification, and 2 short_answer questions/g,
    "the question counts listed in the EXACT QUOTA for this chunk"
  );
  source = source.replace(
    /Done\. Generated a 20-item mock exam with 10 multiple choice, 5 true\/false, 3 identification, and 2 short-answer questions\./g,
    "Done. Generated the mock exam from your selected item count and question types."
  );
  source = source.replace(/Answer all 20 questions\./g, "Answer all questions.");

  source = source.replace(
    "renderWeakTopics(outcomes);\n  renderAnswerReview(outcomes);",
    "renderWeakTopics(outcomes);\n  renderAnswerReview(outcomes);\n  if (window.__revdevMarkExamForm) window.__revdevMarkExamForm(outcomes);"
  );

  return source;
}

/** Mark each question on the form: green/red on choices; explanation only underneath. */
window.__revdevMarkExamForm = function (outcomes) {
  const form = document.getElementById("exam-form");
  if (!form || !outcomes || !outcomes.length) return;

  outcomes.forEach(function (outcome, index) {
    const fieldset =
      form.querySelector('.exam-question[data-index="' + index + '"]') ||
      form.querySelectorAll(".exam-question")[index];
    if (!fieldset) return;

    fieldset.classList.remove("is-correct", "is-incorrect");
    fieldset.classList.add(outcome.correct ? "is-correct" : "is-incorrect");

    fieldset.querySelectorAll("input, textarea, select").forEach(function (el) {
      el.disabled = true;
    });

    const name = "question-" + index;
    const selected = fieldset.querySelector('input[name="' + name + '"]:checked');
    if (selected) {
      const label = selected.closest(".choice-option");
      if (label) {
        label.classList.add(outcome.correct ? "is-user-correct" : "is-user-wrong");
      }
    }

    if (!outcome.correct && outcome.question && outcome.question.answers) {
      const accepted = outcome.question.answers.map(function (a) {
        return String(a).trim().toLowerCase();
      });
      fieldset.querySelectorAll('input[name="' + name + '"]').forEach(function (input) {
        if (accepted.indexOf(String(input.value).trim().toLowerCase()) !== -1) {
          const lab = input.closest(".choice-option");
          if (lab) lab.classList.add("is-right-answer");
        }
      });
    }

    let box = fieldset.querySelector(".exam-inline-result");
    const expl =
      outcome.question && outcome.question.explanation
        ? String(outcome.question.explanation).trim()
        : "";
    if (!expl) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement("div");
      box.className = "exam-inline-result";
      fieldset.appendChild(box);
    }
    box.innerHTML = "<strong>Explanation</strong>" + expl;
  });
};

function installSubmitFallback() {
  const btn = document.getElementById("submit-exam");
  const form = document.getElementById("exam-form");
  const results = document.getElementById("exam-results");
  if (!btn || !form) return;
  btn.addEventListener(
    "click",
    function () {
      setTimeout(function () {
        if (results && !results.hidden) return;
        console.warn("RevDev: submit produced no results panel; regenerate exam after hard refresh.");
      }, 80);
    },
    true
  );
}

const CDN_APP =
  "https://cdn.jsdelivr.net/gh/Angelos-Brain/RevDev@c151cf08a68250e6b1477b6f2c339246181b48f4/docs/app.js";

async function revdevLoadApp() {
  ensureCloudAiUi();
  wireItemCountControls();
  const response = await fetch(CDN_APP + "?v=examfix10");
  if (!response.ok) throw new Error("Could not load RevDev application module.");
  let source = await response.text();
  source = patchExamConfig(source);

  if (/state\.exam\.length !== 20/.test(source)) {
    console.error("RevDev: length!==20 still present after patch");
  } else {
    console.info("RevDev: inline exam feedback ready (v10)");
  }

  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  await import(url);
  wireItemCountControls();
  installSubmitFallback();
}

await revdevLoadApp();
