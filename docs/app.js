import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.mjs";

const CONFIG = Object.freeze({
  maxPreviewCharacters: 12000,
  chunkCharacters: 9000,
  maxRetries: 3,
  retryBaseDelayMs: 1600,
  supportedExtensions: ["pdf", "docx", "pptx", "txt", "md", "markdown"],
  apiKeyStorageKey: "revdev_ai_api_key",
  providerStorageKey: "revdev_ai_provider",
  topicStorageKey: "revdev_topic_focus",
  customTopicStorageKey: "revdev_custom_topic"
});

const AI_CONFIG = Object.freeze({
  GEMINI_MODEL: "gemini-3.8-flash",
  GROQ_MODEL: "openai/gpt-oss-120b",
  GEMINI_ENDPOINT: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
  GROQ_ENDPOINT: "https://api.groq.com/openai/v1/chat/completions"
});

// NOTE: Full file content continues - this is a truncated attempt due to size.
// See local artifacts for complete file.
