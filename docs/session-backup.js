/* Immediate text backup/restore — survives hard refresh without re-OCR */
(function () {
  "use strict";
  var KEY = "revdev_extracted_text_backup";
  var META = "revdev_extracted_meta_backup";

  function qs(id) { return document.getElementById(id); }

  function saveText(text) {
    text = String(text || "").trim();
    if (text.length < 20) return;
    try {
      localStorage.setItem(KEY, text);
      localStorage.setItem(META, JSON.stringify({ at: Date.now(), len: text.length }));
    } catch (e) {}
  }

  function loadText() {
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }

  function apply(text) {
    text = String(text || "").trim();
    if (text.length < 20) return false;
    var preview = qs("preview");
    if (preview) {
      preview.textContent = text;
      preview.classList.remove("empty-preview");
    }
    var meta = qs("preview-meta");
    if (meta) meta.textContent = "Restored · " + text.length.toLocaleString() + " characters";
    try {
      window.__revdevExtractedText = text;
      window.__revdevSourceText = text;
      if (window.__revdevJob) window.__revdevJob.sourceText = text;
    } catch (e) {}
    var gen = qs("generate-button");
    if (gen) gen.disabled = false;
    return true;
  }

  function restore() {
    var cur = "";
    var preview = qs("preview");
    if (preview) cur = (preview.innerText || preview.textContent || "").trim();
    if (cur.length > 40) return; // already has text
    var t = loadText();
    if (t && apply(t)) {
      console.info("[RevDev] restored extracted text from localStorage backup (" + t.length + " chars)");
    }
  }

  function watchPreview() {
    var preview = qs("preview");
    if (!preview) return;
    var save = function () {
      var t = (preview.innerText || preview.textContent || "").trim();
      if (t.length > 40) saveText(t);
    };
    new MutationObserver(save).observe(preview, { childList: true, characterData: true, subtree: true });
    setInterval(save, 5000);
  }

  function boot() {
    restore();
    setTimeout(restore, 800);
    setTimeout(restore, 2000);
    setTimeout(restore, 4000);
    watchPreview();
  }

  window.__revdevTextBackup = { save: saveText, restore: restore, load: loadText };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 50); });
  } else {
    setTimeout(boot, 50);
  }
})();
