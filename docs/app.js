/* RevDev loader: known-good UI patches + hard quality + exam timer + review fix */
const res = await fetch(
  "https://raw.githubusercontent.com/Angelos-Brain/RevDev/ffb7eef/docs/app.js"
);
if (!res.ok) throw new Error("Failed to load known-good RevDev app (" + res.status + ")");
const code = await res.text();
const blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
await import(blobUrl);

await import("./hard-quality.js?v=hq8");
await import("./exam-timer.js?v=t5");
await import("./review-fix.js?v=rf3");
