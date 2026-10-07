// RevDev bootstrap
// 1) Patch Gemini requests so responseSchema never includes unsupported "additionalProperties".
// 2) Load the last known-good full application module from this repository.
(function () {
  const originalFetch = window.fetch.bind(window);

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

  window.fetch = async function (url, options) {
    if (
      typeof url === "string" &&
      url.includes("generativelanguage.googleapis.com") &&
      options &&
      typeof options.body === "string"
    ) {
      try {
        const body = JSON.parse(options.body);
        if (body.generationConfig && body.generationConfig.responseSchema) {
          body.generationConfig.responseSchema = stripAdditionalProperties(
            body.generationConfig.responseSchema
          );
          options = Object.assign({}, options, {
            body: JSON.stringify(body)
          });
        }
      } catch (error) {
        // Keep the original request if parsing fails.
      }
    }
    return originalFetch(url, options);
  };
})();

await import(
  "https://cdn.jsdelivr.net/gh/Angelos-Brain/RevDev@c151cf08a68250e6b1477b6f2c339246181b48f4/docs/app.js"
);
