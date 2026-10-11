/* RevDev loader: restore known-good UI patches, then hard quality filter */
const res = await fetch(
  "https://cdn.jsdelivr.net/gh/Angelos-Brain/RevDev@095496252f747461ad55fec3ae59413f76a6588d/docs/app.js"
);
if (!res.ok) throw new Error("Failed to load known-good RevDev app patches");
const code = await res.text();
const blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
await import(blobUrl);

await import("./hard-quality.js?v=hq2");
