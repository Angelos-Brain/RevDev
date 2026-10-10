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
const names = ["pl.0.txt","pl.1.txt","pl.2.txt","pl.3.txt","pl.4.txt","pl.5.txt","pl.6.txt"];
const parts = await Promise.all(
  names.map((n) => fetch(new URL(n, base)).then((r) => {
    if (!r.ok) throw new Error("Missing " + n);
    return r.text();
  }))
);
const source = await inflateBase64Gzip(parts.join("").replace(/\s+/g, ""));
const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
await import(url);
