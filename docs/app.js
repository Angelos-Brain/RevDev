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
        try { errorBody = await cloned.json(); } catch (e) {}
        if (response.status === 429 || isRateLimitBody(errorBody)) {
          var provider = String(requestUrl).includes("generativelanguage.googleapis.com")
            ? "Gemini" : String(requestUrl).includes("api.groq.com") ? "Groq" : "AI provider";
          return new Response(JSON.stringify({
            error: { message: friendlyRateLimitMessage(provider), status: "RESOURCE_EXHAUSTED", code: 429 }
          }), { status: 429, statusText: "Too Many Requests", headers: { "Content-Type": "application/json" } });
        }
      }
    } catch (e) {}
    return response;
  };
})();

const CDN_APP =
  "https://cdn.jsdelivr.net/gh/Angelos-Brain/RevDev@c151cf08a68250e6b1477b6f2c339246181b48f4/docs/app.js";

function applyExamOptionsPatch(source) {
  source = source.replace(
    'customTopicStorageKey: "revdev_custom_topic"\n});',
    'customTopicStorageKey: "revdev_custom_topic",\n  examCountStorageKey: "revdev_exam_count",\n  examTypesStorageKey: "revdev_exam_types",\n  examMinItems: 1,\n  examMaxItems: 50,\n  examDefaultItems: 20,\n  examTypeOrder: ["multiple_choice","true_false","identification","short_answer"]\n});'
  );

  source = source.replace(
    'modeSelect: document.getElementById("mode-select"),\n  topicSelect:',
    'modeSelect: document.getElementById("mode-select"),\n  examOptions: document.getElementById("exam-options"),\n  examItemCount: document.getElementById("exam-item-count"),\n  examTypeChecks: document.querySelectorAll(\'input[name="exam-type"]\'),\n  topicSelect:'
  );

  source = source.replace(
'function distributeExamQuota(total, chunkIndex, totalChunks) {\n  const base = Math.floor(total / totalChunks);\n  const remainder = total % totalChunks;\n  return base + (chunkIndex <= remainder ? 1 : 0);\n}\n\nfunction getExamQuota(chunkIndex, totalChunks) {\n  return {\n    multiple_choice: distributeExamQuota(10, chunkIndex, totalChunks),\n    true_false: distributeExamQuota(5, chunkIndex, totalChunks),\n    identification: distributeExamQuota(3, chunkIndex, totalChunks),\n    short_answer: distributeExamQuota(2, chunkIndex, totalChunks)\n  };\n}\n',
'function distributeExamQuota(total, chunkIndex, totalChunks) {\n  if (totalChunks <= 1) return total;\n  const base = Math.floor(total / totalChunks);\n  const remainder = total % totalChunks;\n  return base + (chunkIndex <= remainder ? 1 : 0);\n}\nfunction getExamSettings() {\n  const rawCount = elements.examItemCount ? Number(elements.examItemCount.value) : CONFIG.examDefaultItems;\n  let totalItems = Number.isFinite(rawCount) ? Math.round(rawCount) : CONFIG.examDefaultItems;\n  totalItems = Math.max(CONFIG.examMinItems, Math.min(CONFIG.examMaxItems, totalItems));\n  const selectedTypes = [];\n  if (elements.examTypeChecks && elements.examTypeChecks.length) {\n    elements.examTypeChecks.forEach(function (input) { if (input.checked) selectedTypes.push(input.value); });\n  }\n  const orderedTypes = CONFIG.examTypeOrder.filter(function (type) { return selectedTypes.indexOf(type) !== -1; });\n  const types = orderedTypes.length > 0 ? orderedTypes : CONFIG.examTypeOrder.slice();\n  return { totalItems: totalItems, types: types, targets: distributeTotalsAcrossTypes(totalItems, types) };\n}\nfunction distributeTotalsAcrossTypes(totalItems, types) {\n  const targets = { multiple_choice: 0, true_false: 0, identification: 0, short_answer: 0 };\n  if (!types.length || totalItems <= 0) return targets;\n  const base = Math.floor(totalItems / types.length);\n  let remainder = totalItems % types.length;\n  types.forEach(function (type) { targets[type] = base + (remainder > 0 ? 1 : 0); if (remainder > 0) remainder -= 1; });\n  return targets;\n}\nfunction getExamQuota(chunkIndex, totalChunks, settings) {\n  const examSettings = settings || getExamSettings();\n  const quota = { multiple_choice: 0, true_false: 0, identification: 0, short_answer: 0 };\n  Object.keys(examSettings.targets).forEach(function (type) {\n    quota[type] = distributeExamQuota(examSettings.targets[type], chunkIndex, totalChunks);\n  });\n  return quota;\n}\nfunction describeExamTargets(targets) {\n  const labels = { multiple_choice: "multiple choice", true_false: "true/false", identification: "identification", short_answer: "short-answer" };\n  return CONFIG.examTypeOrder.filter(function (type) { return (targets[type] || 0) > 0; })\n    .map(function (type) { return targets[type] + " " + labels[type]; }).join(", ");\n}\n'
  );

  source = source.replace(
    'function buildPrompt(mode, chunk, chunkIndex, totalChunks) {',
    'function buildPrompt(mode, chunk, chunkIndex, totalChunks, examSettings) {'
  );

  source = source.replace(
    '"Create a candidate section of a 20-item mock exam from only this source chunk.",\n            "The full exam must contain exactly 10 multiple_choice, 5 true_false, 3 identification, and 2 short_answer questions.",\n            "For this chunk, create exactly the quota stated below.",',
    '"Create a candidate section of a mock exam from only this source chunk.",\n            "The full exam targets are controlled by the quota object below.",\n            "For this chunk, create exactly the quota stated below for each type. Use 0 for types with quota 0.",'
  );

  source = source.replace(
    'const quota = getExamQuota(chunkIndex, totalChunks);\n    return [\n      SYSTEM_INSTRUCTION,\n      "",\n      "TASK:",\n      modeRules,\n      topicFocus,\n      "This is chunk " + chunkIndex + " of " + totalChunks + ".",\n      "EXACT QUOTA FOR THIS CHUNK:",\n      JSON.stringify(quota),\n      "Use question type values exactly: multiple_choice, true_false, identification, short_answer.",',
    'const quota = getExamQuota(chunkIndex, totalChunks, examSettings);\n    const allowedTypes = (examSettings && examSettings.types) || CONFIG.examTypeOrder;\n    return [\n      SYSTEM_INSTRUCTION,\n      "",\n      "TASK:",\n      modeRules,\n      topicFocus,\n      "This is chunk " + chunkIndex + " of " + totalChunks + ".",\n      "FULL EXAM TARGETS:",\n      JSON.stringify((examSettings && examSettings.targets) || {}),\n      "EXACT QUOTA FOR THIS CHUNK:",\n      JSON.stringify(quota),\n      "Only use these question type values: " + allowedTypes.join(", ") + ".",'
  );

  source = source.replace(
    'function mergeExams(partials) {',
    'function mergeExams(partials, settings) {'
  );

  source = source.replace(
    '  const targetCounts = {\n    multiple_choice: 10,\n    true_false: 5,\n    identification: 3,\n    short_answer: 2\n  };\n\n  const chosen = [];\n  const counts = {\n    multiple_choice: 0,\n    true_false: 0,\n    identification: 0,\n    short_answer: 0\n  };\n\n  Object.keys(targetCounts).forEach(function (type) {\n    merged.forEach(function (question) {\n      if (question.type === type && counts[type] < targetCounts[type]) {\n        chosen.push(question);\n        counts[type] += 1;\n      }\n    });\n  });\n\n  if (\n    counts.multiple_choice !== 10 ||\n    counts.true_false !== 5 ||\n    counts.identification !== 3 ||\n    counts.short_answer !== 2\n  ) {\n    throw new Error(\n      "The AI generated fewer than 20 unique source-backed exam questions. Try generating again or use a smaller topic focus."\n    );\n  }\n\n  return chosen;\n}',
    '  const examSettings = settings || getExamSettings();\n  const targetCounts = examSettings.targets;\n  const allowedTypes = examSettings.types;\n  const chosen = [];\n  const counts = { multiple_choice: 0, true_false: 0, identification: 0, short_answer: 0 };\n  const filtered = merged.filter(function (q) { return allowedTypes.indexOf(q.type) !== -1; });\n  allowedTypes.forEach(function (type) {\n    filtered.forEach(function (question) {\n      if (question.type === type && counts[type] < targetCounts[type]) {\n        chosen.push(question);\n        counts[type] += 1;\n      }\n    });\n  });\n  if (chosen.length === 0) {\n    throw new Error("The AI generated no unique source-backed exam questions for the selected types. Try again or change types/topic focus.");\n  }\n  return chosen;\n}'
  );

  source = source.replace(
    'elements.examIntro.textContent =\n    "Answer all 20 questions. Unanswered questions are scored as incorrect.";',
    'elements.examIntro.textContent =\n    "Answer all " + state.exam.length + " question" + (state.exam.length === 1 ? "" : "s") + ". Unanswered questions are scored as incorrect.";'
  );

  source = source.replace(
    'const mode = elements.modeSelect.value;\n  const source = getCombinedSource();',
    'const mode = elements.modeSelect.value;\n  const examSettings = mode === "exam" ? getExamSettings() : null;\n  if (mode === "exam") {\n    if (!examSettings.types.length) {\n      setGenerationStatus("Select at least one question type for the mock exam.", "error");\n      return;\n    }\n    if (elements.examItemCount) elements.examItemCount.value = String(examSettings.totalItems);\n  }\n  const source = getCombinedSource();'
  );

  source = source.replace(
    'const prompt = buildPrompt(\n        mode,\n        chunks[index],\n        index + 1,\n        chunks.length\n      );',
    'const prompt = buildPrompt(\n        mode,\n        chunks[index],\n        index + 1,\n        chunks.length,\n        examSettings\n      );'
  );

  source = source.replace(
    'validateExam(result, getExamQuota(index + 1, chunks.length))',
    'validateExam(result, getExamQuota(index + 1, chunks.length, examSettings))'
  );

  source = source.replace(
    'const questions = mergeExams(partials);\n      renderExam(questions);\n      setGenerationStatus(\n        "Done. Generated a 20-item mock exam with 10 multiple choice, 5 true/false, 3 identification, and 2 short-answer questions.",\n        "success"\n      );',
    'const questions = mergeExams(partials, examSettings);\n      renderExam(questions);\n      const actualCounts = { multiple_choice: 0, true_false: 0, identification: 0, short_answer: 0 };\n      questions.forEach(function (q) { actualCounts[q.type] = (actualCounts[q.type] || 0) + 1; });\n      setGenerationStatus(\n        "Done. Generated a " + questions.length + "-item mock exam (" + describeExamTargets(actualCounts) + ").",\n        "success"\n      );'
  );

  source = source.replace(
    'if (counts[type] !== expectedQuota[type])',
    'if (counts[type] > expectedQuota[type])'
  );
  source = source.replace(
    'questions, but " +\n            expectedQuota[type] +\n            " were required."',
    'questions, but at most " +\n            expectedQuota[type] +\n            " were allowed."'
  );

  source = source.replace(
    'elements.modeSelect.addEventListener("change", function () {\n  resetGeneratedOutput();\n});',
    'elements.modeSelect.addEventListener("change", function () {\n  resetGeneratedOutput();\n  updateExamOptionsVisibility();\n});\nfunction updateExamOptionsVisibility() {\n  if (!elements.examOptions) return;\n  elements.examOptions.hidden = elements.modeSelect.value !== "exam";\n}\nfunction saveExamSettings() {\n  if (!elements.examItemCount) return;\n  const settings = getExamSettings();\n  localStorage.setItem(CONFIG.examCountStorageKey, String(settings.totalItems));\n  localStorage.setItem(CONFIG.examTypesStorageKey, JSON.stringify(settings.types));\n  elements.examItemCount.value = String(settings.totalItems);\n}\nfunction loadExamSettings() {\n  if (!elements.examItemCount) return;\n  const savedCount = Number(localStorage.getItem(CONFIG.examCountStorageKey));\n  if (Number.isFinite(savedCount) && savedCount > 0) {\n    elements.examItemCount.value = String(Math.max(CONFIG.examMinItems, Math.min(CONFIG.examMaxItems, Math.round(savedCount))));\n  } else {\n    elements.examItemCount.value = String(CONFIG.examDefaultItems);\n  }\n  let savedTypes = null;\n  try { savedTypes = JSON.parse(localStorage.getItem(CONFIG.examTypesStorageKey) || "null"); } catch (e) { savedTypes = null; }\n  if (Array.isArray(savedTypes) && savedTypes.length > 0 && elements.examTypeChecks) {\n    elements.examTypeChecks.forEach(function (input) { input.checked = savedTypes.indexOf(input.value) !== -1; });\n  }\n  if (elements.examTypeChecks) {\n    const anyChecked = Array.from(elements.examTypeChecks).some(function (input) { return input.checked; });\n    if (!anyChecked) elements.examTypeChecks.forEach(function (input) { input.checked = true; });\n  }\n}\nif (elements.examItemCount) {\n  elements.examItemCount.addEventListener("change", saveExamSettings);\n  elements.examItemCount.addEventListener("blur", saveExamSettings);\n}\nif (elements.examTypeChecks) {\n  elements.examTypeChecks.forEach(function (input) {\n    input.addEventListener("change", function () {\n      const anyChecked = Array.from(elements.examTypeChecks).some(function (box) { return box.checked; });\n      if (!anyChecked) {\n        input.checked = true;\n        setGenerationStatus("Select at least one question type for the mock exam.", "error");\n      } else setGenerationStatus("");\n      saveExamSettings();\n    });\n  });\n}\nloadExamSettings();\nupdateExamOptionsVisibility();'
  );

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
