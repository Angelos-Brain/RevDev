// RevDev bootstrap — configurable mock exam + Gemini free-tier fixes
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
          var body = JSON.parse(requestOptions.body);
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

    var response = await originalFetch(requestUrl, requestOptions);

    try {
      if (!response.ok && (response.status === 429 || response.status === 403)) {
        var cloned = response.clone();
        var errorBody = null;
        try { errorBody = await cloned.json(); } catch (e) { errorBody = null; }
        if (response.status === 429 || isRateLimitBody(errorBody)) {
          var provider = String(requestUrl).includes("generativelanguage.googleapis.com")
            ? "Gemini"
            : String(requestUrl).includes("api.groq.com")
              ? "Groq"
              : "AI provider";
          return new Response(
            JSON.stringify({
              error: {
                message: friendlyRateLimitMessage(provider),
                status: "RESOURCE_EXHAUSTED",
                code: 429
              }
            }),
            {
              status: 429,
              statusText: "Too Many Requests",
              headers: { "Content-Type": "application/json" }
            }
          );
        }
      }
    } catch (e) {}

    return response;
  };
})();

import { REVDEV_CHUNKS } from "./app.data.js";

async function revdevLoadApp() {
  const b64 = REVDEV_CHUNKS.join("");
  const binary = Uint8Array.from(atob(b64), function (c) {
    return c.charCodeAt(0);
  });
  const stream = new Response(binary).body.pipeThrough(new DecompressionStream("gzip"));
  const source = await new Response(stream).text();
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  await import(url);
}

await revdevLoadApp();
