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

  function friendlyRateLimitMessage(provider) {
    return (
      "The " + provider +
      " free-tier limit was reached for this project. " +
      "Wait a few minutes (or until midnight Pacific for daily quotas), " +
      "try a smaller file, or switch provider to Groq and use a free Groq key."
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
          const provider = String(requestUrl).includes("googleapis") ? "Gemini" : "provider";
          throw new Error(friendlyRateLimitMessage(provider));
        }
      } catch (e) {
        if (e && e.message && e.message.includes("free-tier limit")) throw e;
      }
    }
    return response;
  };
})();

const CDN_APP =
  "https://cdn.jsdelivr.net/gh/Angelos-Brain/RevDev@c151cf08a68250e6b1477b6f2c339246181b48f4/docs/app.js";

function applyExamOptionsPatch(source) {
  if (source.indexOf("getExamSettings") !== -1) return source;

  source = source.replace(
    /const CONFIG = Object\.freeze\(\{/,
    "const CONFIG = Object.freeze({\n  examCountStorageKey: \"revdev_exam_count\",\n  examTypesStorageKey: \"revdev_exam_types\",\n  itemMin: 1,\n  itemMax: 50,"
  );

  // Minimal patch: expose exam settings helpers after CONFIG if not present
  const helpers = `\nfunction getExamSettings() {\n  const countInput = document.getElementById("item-count");\n  let count = countInput ? Number(countInput.value) : 20;\n  if (!Number.isFinite(count)) count = 20;\n  count = Math.max(1, Math.min(50, Math.round(count)));\n  const checks = document.querySelectorAll('input[name="exam-type"]');\n  let types = Array.from(checks).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });\n  if (!types.length) types = ["multiple_choice", "true_false", "identification", "short_answer"];\n  return { count: count, types: types };\n}\nfunction updateExamOptionsVisibility() {\n  const mode = document.getElementById("mode-select");\n  const panel = document.getElementById("exam-options");\n  if (panel && mode) panel.hidden = mode.value !== "exam";\n}\n`;

  if (source.indexOf("function getExamSettings") === -1) {
    source = source.replace("const state = {", helpers + "\nconst state = {");
  }
  return source;
}

async function revdevLoadApp() {
  const response = await fetch(CDN_APP);
  if (!response.ok) throw new Error("Could not load RevDev application module.");
  let source = await response.text();
  source = applyExamOptionsPatch(source);
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  await import(url);
}

await revdevLoadApp();
