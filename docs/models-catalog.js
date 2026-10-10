/**
 * RevDev in-browser model catalog (WebLLM / MLC prebuilt models).
 * Edit this file to add or remove models. Rank is strongest-first for auto-fallback.
 *
 * modelId must match a WebLLM prebuiltAppConfig model_id.
 * downloadMB / vramMB are approximate guides for the user.
 */
export const MODELS_CATALOG = Object.freeze([
  {
    id: "Hermes-3-Llama-3.2-3B-q4f16_1-MLC",
    displayName: "Hermes 3 · Llama 3.2 3B",
    family: "Hermes",
    downloadMB: 1760,
    vramMB: 2264,
    contextTokens: 4096,
    description: "Strong instruction following; good for structured study output.",
    rank: 1,
    lowResource: true,
    requiresShaderF16: true
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    displayName: "Llama 3.2 3B Instruct",
    family: "Llama",
    downloadMB: 1760,
    vramMB: 2264,
    contextTokens: 4096,
    description: "Balanced quality and speed for exams, flashcards, and summaries.",
    rank: 2,
    lowResource: true,
    requiresShaderF16: true
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    displayName: "Phi 3.5 Mini",
    family: "Phi",
    downloadMB: 2100,
    vramMB: 3672,
    contextTokens: 4096,
    description: "Strong reasoning in a compact package.",
    rank: 3,
    lowResource: false,
    requiresShaderF16: false
  },
  {
    id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    displayName: "Qwen 2.5 3B Instruct",
    family: "Qwen",
    downloadMB: 1700,
    vramMB: 2200,
    contextTokens: 4096,
    description: "High-quality multilingual model; solid JSON discipline.",
    rank: 4,
    lowResource: true,
    requiresShaderF16: true
  },
  {
    id: "gemma-2-2b-it-q4f16_1-MLC",
    displayName: "Gemma 2 2B Instruct",
    family: "Gemma",
    downloadMB: 1440,
    vramMB: 1895,
    contextTokens: 4096,
    description: "Google Gemma 2 — efficient and capable on modest GPUs.",
    rank: 5,
    lowResource: false,
    requiresShaderF16: true
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    displayName: "Llama 3.2 1B Instruct",
    family: "Llama",
    downloadMB: 712,
    vramMB: 879,
    contextTokens: 4096,
    description: "Fast and light; good fallback when larger models fail.",
    rank: 6,
    lowResource: true,
    requiresShaderF16: true
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    displayName: "Qwen 2.5 1.5B Instruct",
    family: "Qwen",
    downloadMB: 868,
    vramMB: 1100,
    contextTokens: 4096,
    description: "Small multilingual model for lower-end devices.",
    rank: 7,
    lowResource: true,
    requiresShaderF16: true
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    displayName: "Qwen 2.5 0.5B Instruct",
    family: "Qwen",
    downloadMB: 278,
    vramMB: 940,
    contextTokens: 4096,
    description: "Tiny and fast; last-resort fallback on constrained hardware.",
    rank: 8,
    lowResource: true,
    requiresShaderF16: true
  },
  {
    id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    displayName: "SmolLM2 360M Instruct",
    family: "SmolLM",
    downloadMB: 210,
    vramMB: 376,
    contextTokens: 2048,
    description: "Very small model for basic devices; quality is limited.",
    rank: 9,
    lowResource: true,
    requiresShaderF16: true
  },
  {
    id: "Hermes-3-Llama-3.1-8B-q4f16_1-MLC",
    displayName: "Hermes 3 · Llama 3.1 8B",
    family: "Hermes",
    downloadMB: 4900,
    vramMB: 4976,
    contextTokens: 4096,
    description: "Highest-quality Hermes option; needs a strong GPU.",
    rank: 0,
    lowResource: false,
    requiresShaderF16: true
  },
  {
    id: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
    displayName: "Llama 3.1 8B Instruct",
    family: "Llama",
    downloadMB: 4500,
    vramMB: 5001,
    contextTokens: 4096,
    description: "Strong general model; desktop-class GPU recommended.",
    rank: 0.5,
    lowResource: false,
    requiresShaderF16: true
  },
  {
    id: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
    displayName: "Mistral 7B Instruct v0.3",
    family: "Mistral",
    downloadMB: 4000,
    vramMB: 4573,
    contextTokens: 4096,
    description: "Strong general-purpose 7B; needs shader-f16 and ample VRAM.",
    rank: 0.7,
    lowResource: false,
    requiresShaderF16: true
  }
]);

/** Default fallback order: lower rank number = preferred (stronger first). */
export function getDefaultFallbackOrder() {
  return MODELS_CATALOG.slice()
    .sort(function (a, b) {
      return a.rank - b.rank;
    })
    .map(function (m) {
      return m.id;
    });
}

export function getModelById(id) {
  return MODELS_CATALOG.find(function (m) {
    return m.id === id;
  }) || null;
}

export function formatSizeMB(mb) {
  if (mb < 1000) return Math.round(mb) + " MB";
  return (mb / 1000).toFixed(1) + " GB";
}

export function listCatalog() {
  return MODELS_CATALOG.slice().sort(function (a, b) {
    return a.rank - b.rank;
  });
}
