/* RevDev loader: known-good app + quality + timer + review + session + OCR */
const res = await fetch(
  "https://raw.githubusercontent.com/Angelos-Brain/RevDev/ffb7eef/docs/app.js"
);
if (!res.ok) throw new Error("Failed to load known-good RevDev app (" + res.status + ")");
const code = await res.text();
const blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
await import(blobUrl);

await import("./hard-quality.js?v=hq13");
await import("./exam-timer.js?v=t15");
await import("./review-fix.js?v=rf16");
await import("./answer-key-fix.js?v=ak1");
await import("./force-full-grade.js?v=fg2");
await import("./session-persist.js?v=sp13");
await import("./ocr.js?v=ocr12");
await import("./per-question-grade.js?v=pq6");
await import("./generate-ready-guard.js?v=gr2");
