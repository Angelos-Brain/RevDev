/* RevDev dual-key loader + legacy DOM stubs */
(function ensureLegacyElements() {
  const stubs = [
    { id: "toggle-key", tag: "button", type: "button" },
    { id: "load-model-button", tag: "button", type: "button" },
    { id: "model-select", tag: "select" },
    { id: "model-status", tag: "div" },
    { id: "model-progress", tag: "div" },
    { id: "model-progress-fill", tag: "div" },
    { id: "model-meta", tag: "div" },
    { id: "auto-fallback", tag: "input", type: "checkbox" }
  ];
  const host = document.createElement("div");
  host.id = "revdev-legacy-stubs";
  host.hidden = true;
  host.setAttribute("aria-hidden", "true");
  stubs.forEach(function (s) {
    if (document.getElementById(s.id)) return;
    const el = document.createElement(s.tag);
    el.id = s.id;
    if (s.type) el.type = s.type;
    host.appendChild(el);
  });
  document.body.appendChild(host);
})();

async function inflateBase64Gzip(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}

const parts = [];
for (let i = 0; i < 4; i++) {
  const res = await fetch("./dual_c" + i + ".txt?v=1");
  if (!res.ok) throw new Error("Missing dual_c" + i + ".txt");
  parts.push((await res.text()).replace(/\s+/g, ""));
}
const source = await inflateBase64Gzip(parts.join(""));
const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
await import(url);
