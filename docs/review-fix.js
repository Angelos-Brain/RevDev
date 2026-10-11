/* review-fix loader: known-good markForm only.
   Does NOT override keys from explanation (answer-key-fix +
   exam-integrity own that path; valid keys must never be flipped). */
(async function () {
  "use strict";
  var res = await fetch(
    "https://raw.githubusercontent.com/Angelos-Brain/RevDev/06664540a3b6d5377a22b2a549d072e1669d792d/docs/review-fix.js"
  );
  if (!res.ok) throw new Error("review-fix load failed " + res.status);
  var code = await res.text();
  var blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  await import(blobUrl);

  // After remote installs markForm, wrap resolveCorrectOptionIndex if exposed
  // so a key that already matches exactly one option is never rewritten.
  function protectValidKeys() {
    var orig = window.__revdevResolveCorrectOptionIndex;
    if (typeof orig !== "function" || orig.__keyProtected) return;

    function norm(s) {
      return String(s || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    }

    window.__revdevResolveCorrectOptionIndex = function (item) {
      if (item && Array.isArray(item.options) && item.options.length) {
        var ans = Array.isArray(item.answers)
          ? String(item.answers[0] != null ? item.answers[0] : "")
          : String(item.answers || "");
        if (ans) {
          var hits = [];
          for (var i = 0; i < item.options.length; i++) {
            if (norm(item.options[i]) === norm(ans)) hits.push(i);
          }
          if (hits.length === 1) return hits[0];
        }
      }
      return orig(item);
    };
    window.__revdevResolveCorrectOptionIndex.__keyProtected = true;
  }

  protectValidKeys();
  setTimeout(protectValidKeys, 500);
  setTimeout(protectValidKeys, 2000);

  console.info("RevDev: review-fix loaded (valid keys protected from explanation rewrite)");
})();
