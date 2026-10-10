/* RevDev dual-key loader + legacy DOM stubs + key visibility toggles */
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

/* Always-on Show/Hide for API key fields (works even if payload wiring fails) */
(function wireKeyVisibilityToggles() {
  var pairs = [
    { btn: "toggle-key-gemini", input: "api-key-gemini" },
    { btn: "toggle-key-groq", input: "api-key-groq" },
    { btn: "toggle-gemini-key", input: "gemini-key" },
    { btn: "toggle-groq-key", input: "groq-key" },
    { btn: "toggle-key", input: "api-key" }
  ];

  function bindOne(btnId, inputId) {
    var btn = document.getElementById(btnId);
    var input = document.getElementById(inputId);
    if (!btn || !input || btn.dataset.revdevToggleBound === "1") return;
    btn.dataset.revdevToggleBound = "1";
    btn.type = "button";
    btn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
    });
  }

  function bindAll() {
    pairs.forEach(function (p) {
      bindOne(p.btn, p.input);
    });
  }

  bindAll();
  // Re-bind after async modules settle
  setTimeout(bindAll, 0);
  setTimeout(bindAll, 500);
  setTimeout(bindAll, 1500);

  // Event delegation fallback (handles late DOM swaps)
  document.addEventListener(
    "click",
    function (event) {
      var btn = event.target && event.target.closest
        ? event.target.closest(
            "#toggle-key-gemini, #toggle-key-groq, #toggle-gemini-key, #toggle-groq-key, #toggle-key"
          )
        : null;
      if (!btn) return;
      var map = {
        "toggle-key-gemini": "api-key-gemini",
        "toggle-key-groq": "api-key-groq",
        "toggle-gemini-key": "gemini-key",
        "toggle-groq-key": "groq-key",
        "toggle-key": "api-key"
      };
      var input = document.getElementById(map[btn.id]);
      if (!input) return;
      event.preventDefault();
      event.stopPropagation();
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
    },
    true
  );
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
  const res = await fetch("./dual_c" + i + ".txt?v=2");
  if (!res.ok) throw new Error("Missing dual_c" + i + ".txt");
  parts.push((await res.text()).replace(/\s+/g, ""));
}
const source = await inflateBase64Gzip(parts.join(""));
const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
await import(url);
