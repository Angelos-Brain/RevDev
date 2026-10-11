/* RevDev loader: backup core + UI patches + hard quality filter */
const src = await fetch("https://cdn.jsdelivr.net/gh/Angelos-Brain/RevDev@backup-before-grok-2026-10-10/docs/app.js");
if (!src.ok) throw new Error("Failed to load RevDev app.js from backup");
const code = await src.text();
const blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
await import(blobUrl);

await import("./fixCountAndSelection.js?v=1");
await import("./fixExamReviewMarkup.js?v=1");
await import("./fixExamRetake.js?v=1");
await import("./hard-quality.js?v=hq1");
