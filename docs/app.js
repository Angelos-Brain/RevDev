// RevDev bootstrap
// 1) Use Gemini Flash-Lite free-tier model currently available to new users.
// 2) Strip unsupported "additionalProperties" from Gemini responseSchema.
// 3) Rewrite rate-limit / quota errors into clear student-friendly messages.
// 4) Load the last known-good full application module.
(function () {
  const originalFetch = window.fetch.bind(window);

  const GEMINI_FREE_MODEL = "gemini-3.5-flash-lite";

  function stripAdditionalProperties(value) {
    if (Array.isArray(value)) {
      return value.map(stripAdditionalProperties);
    }
    if (!value || typeof value !== "object") {
      return value;
    }
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
      "The " +
      provider +
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
        } catch (error) {}
      }
    }

    var response = await originalFetch(requestUrl, requestOptions);

    try {
      if (!response.ok && (response.status === 429 || response.status === 403)) {
        var cloned = response.clone();
        var errorBody = null;
        try {
          errorBody = await cloned.json();
        } catch (parseError) {
          errorBody = null;
        }

        if (response.status === 429 || isRateLimitBody(errorBody)) {
          var provider = requestUrl.includes("generativelanguage.googleapis.com")
            ? "Gemini"
            : requestUrl.includes("api.groq.com")
              ? "Groq"
              : "AI provider";

          var payload = {
            error: {
              message: friendlyRateLimitMessage(provider),
              status: "RESOURCE_EXHAUSTED",
              code: 429
            }
          };

          return new Response(JSON.stringify(payload), {
            status: 429,
            statusText: "Too Many Requests",
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    } catch (rewriteError) {}

    return response;
  };
})();

await import(
  "https://cdn.jsdelivr.net/gh/Angelos-Brain/RevDev@c151cf08a68250e6b1477b6f2c339246181b48f4/docs/app.js"
);
