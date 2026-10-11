/* RevDev loader: dual-key app from backup + count/selection/review/retake v3 */
const src = await fetch("https://cdn.jsdelivr.net/gh/Angelos-Brain/RevDev@backup-before-grok-2026-10-10/docs/app.js");
if (!src.ok) throw new Error("Failed to load RevDev app.js from backup");
const code = await src.text();
const blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
await import(blobUrl);

await import("./hard-quality.js?v=hq1");
