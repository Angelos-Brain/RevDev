/* RevDev bootstrap — fetch gzip base64 parts and run */
async function inflateBase64Gzip(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}

const base = new URL("./", import.meta.url);
const parts = await Promise.all([
  fetch(new URL("app.payload.0.txt", base)).then((r) => r.text()),
  fetch(new URL("app.payload.1.txt", base)).then((r) => r.text())
]);
const source = await inflateBase64Gzip(parts.join("").replace(/\s+/g, ""));
const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
await import(url);
