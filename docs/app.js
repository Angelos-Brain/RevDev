/* RevDev — cloud AI bootstrap (Gemini / Groq). No local model download. */
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

/** Replace WebLLM panel with Gemini/Groq provider + API key fields the cloud app expects. */
function ensureCloudAiUi() {
  const aiCard = document.querySelector(".ai-card");
  if (!aiCard) return;

  if (!document.getElementById("provider-select")) {
    aiCard.innerHTML =
      '<div class="card-heading">' +
      '<div><span class="section-kicker">2 · CONNECT FREE AI</span>' +
      "<h2>Choose a provider</h2></div>" +
      '<span class="mini-note">No backend server</span></div>' +
      '<div class="settings-grid">' +
      '<label class="field"><span class="field-label">AI provider</span>' +
      '<select id="provider-select">' +
      '<option value="gemini">Google Gemini (default)</option>' +
      '<option value="groq">Groq</option></select></label>' +
      '<label class="field api-key-field"><span class="field-label">API key</span>' +
      '<div class="api-key-row">' +
      '<input id="api-key" type="password" placeholder="Paste your free API key" autocomplete="off" spellcheck="false">' +
      '<button class="button secondary small-button" id="toggle-key" type="button">Show</button>' +
      "</div></label></div>" +
      '<div id="gemini-help" class="provider-help">' +
      "<strong>Gemini</strong><p>Get a free key at Google AI Studio. Uses <code>gemini-3.5-flash-lite</code>. " +
      "If you hit a limit, wait a few minutes or switch to Groq.</p>" +
      '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Open Google AI Studio</a></div>' +
      '<div id="groq-help" class="provider-help" hidden>' +
      "<strong>Groq</strong><p>Get a free Groq API key for fast generation.</p>" +
      '<a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">Open Groq Console</a></div>' +
      '<p class="storage-note"><span class="dot"></span> ' +
      "The key is saved only in this browser. It is sent only to the provider you select.</p>";
  }

  const pill = document.querySelector(".status-pill");
  if (pill) pill.textContent = "Free AI · Gemini / Groq";

  const hero = document.querySelector(".hero-copy");
  if (hero) {
    hero.textContent =
      "Upload your files, keep the source text in your browser, then use your own free Gemini or Groq key to generate study material.";
  }

  const privacy = document.querySelector(".privacy-note p");
  if (privacy) {
    privacy.textContent =
      "Files are read in your browser. Only extracted text is sent to the AI provider you choose. Your API key stays in this browser.";
  }
}

const CDN_APP =
  "https://cdn.jsdelivr.net/gh/Angelos-Brain/RevDev@c151cf08a68250e6b1477b6f2c339246181b48f4/docs/app.js";

async function revdevLoadApp() {
  ensureCloudAiUi();
  const response = await fetch(CDN_APP);
  if (!response.ok) throw new Error("Could not load RevDev application module.");
  const source = await response.text();
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  await import(url);
}

await revdevLoadApp();
