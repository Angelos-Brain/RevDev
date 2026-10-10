/* RevDev bootstrap — load known-good gzip payload, repair packing artifact, run */
async function inflateBase64Gzip(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}

function repairPackedSource(source) {
  // Packing leftover: import was partially inlined but this remnant remained.
  return source.replace(
    /\s*MODELS_CATALOG,\s*getDefaultFallbackOrder,\s*getModelById\s*\}\s*from\s*["']\.\/models-catalog\.js["'];\s*/g,
    "\n"
  );
}

// Pin to last known-good payload commit (avoids corrupted local pl.0/pl.1).
const PAYLOAD_BASE =
  "https://raw.githubusercontent.com/Angelos-Brain/RevDev/7128c143/docs/";
const names = ["pl.0.txt","pl.1.txt","pl.2.txt","pl.3.txt","pl.4.txt","pl.5.txt","pl.6.txt"];
const parts = await Promise.all(
  names.map((n) => fetch(PAYLOAD_BASE + n).then((r) => {
    if (!r.ok) throw new Error("Missing payload " + n + " (" + r.status + ")");
    return r.text();
  }))
);
const source = repairPackedSource(
  await inflateBase64Gzip(parts.join("").replace(/\s+/g, ""))
);
const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
await import(url);
