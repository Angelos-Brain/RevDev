/* RevDev: keep Generate enabled when OCR/preview text exists.
   Core app only unlocks Generate from state.extracted (Read files).
   OCR fills preview but never that list, so updateGenerationControls
   keeps resetting the button to "Read at least one file first". */
(function () {
  "use strict";

  function qs(id) {
    return document.getElementById(id);
  }

  function getPreviewText() {
    var preview = qs("preview");
    if (!preview) return "";
    return (preview.innerText || preview.textContent || "").trim();
  }

  function hasUsableSourceText() {
    var t =
      (window.__revdevExtractedText && String(window.__revdevExtractedText).trim()) ||
      (window.__revdevSourceText && String(window.__revdevSourceText).trim()) ||
      getPreviewText() ||
      "";
    if (!t || t.length < 20) return "";
    if (/Nothing extracted|Upload files and click/i.test(t)) return "";
    return t;
  }

  function syncGenerateReady(metaLabel) {
    var t = hasUsableSourceText();
    if (!t) return false;
    window.__revdevExtractedText = window.__revdevExtractedText || t;
    window.__revdevSourceText = window.__revdevSourceText || t;
    if (window.__revdevJob) window.__revdevJob.sourceText = window.__revdevSourceText;
    var gen = qs("generate-button");
    if (gen) gen.disabled = false;
    var genMeta = qs("generation-meta");
    if (genMeta) {
      var current = (genMeta.textContent || "").trim();
      if (/readable file/i.test(current) && !metaLabel) {
        /* keep Read-files wording */
      } else if (metaLabel) {
        genMeta.textContent = metaLabel;
      } else if (/Read at least one file first/i.test(current) || !current) {
        genMeta.textContent = "OCR / extracted text ready. Choose a study mode";
      }
    }
    return true;
  }

  window.__revdevSyncGenerateReady = syncGenerateReady;

  function install() {
    if (window.__revdevOcrGenerateGuard) return;
    window.__revdevOcrGenerateGuard = true;

    function tick() {
      try {
        syncGenerateReady();
      } catch (e) {}
    }

    setInterval(tick, 700);

    var genMeta = qs("generation-meta");
    if (genMeta && window.MutationObserver) {
      new MutationObserver(function () {
        if (!hasUsableSourceText()) return;
        var msg = (genMeta.textContent || "").trim();
        if (/Read at least one file first/i.test(msg)) tick();
      }).observe(genMeta, { childList: true, characterData: true, subtree: true });
    }

    var gen = qs("generate-button");
    if (gen && window.MutationObserver) {
      new MutationObserver(function () {
        if (gen.disabled && hasUsableSourceText()) tick();
      }).observe(gen, { attributes: true, attributeFilter: ["disabled"] });
    }

    document.addEventListener(
      "click",
      function (ev) {
        var t = ev.target;
        if (!t) return;
        var btn =
          t.id === "generate-button"
            ? t
            : t.closest && t.closest("#generate-button");
        if (!btn) return;
        var src = hasUsableSourceText();
        if (!src) return;
        window.__revdevExtractedText = window.__revdevExtractedText || src;
        window.__revdevSourceText = window.__revdevSourceText || src;
        if (window.__revdevJob) window.__revdevJob.sourceText = window.__revdevSourceText;
        syncGenerateReady();
      },
      true
    );

    var preview = qs("preview");
    if (preview && window.MutationObserver) {
      new MutationObserver(function () {
        setTimeout(tick, 50);
      }).observe(preview, { childList: true, characterData: true, subtree: true });
    }

    tick();
    setTimeout(tick, 500);
    setTimeout(tick, 2000);
    console.info("RevDev: generate-ready guard armed (OCR/preview unlocks Generate)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(install, 300);
      setTimeout(install, 1200);
    });
  } else {
    setTimeout(install, 300);
    setTimeout(install, 1200);
  }
})();
