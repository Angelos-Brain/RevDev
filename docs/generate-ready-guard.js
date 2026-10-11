/* RevDev: OCR/preview text unlocks Generate (core only trusts Read files).
   v3 — capture sync + honest error when keys missing */
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

  function setStatus(msg, kind) {
    var el = qs("generation-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status-message" + (kind ? " " + kind : "");
  }

  function syncGlobals(src) {
    if (!src) return;
    window.__revdevExtractedText = src;
    window.__revdevSourceText = src;
    if (!window.__revdevJob) window.__revdevJob = {};
    window.__revdevJob.sourceText = src;
    try {
      localStorage.setItem("revdev_extracted_text_backup", src);
    } catch (e) {}
  }

  function syncGenerateReady(metaLabel) {
    var t = hasUsableSourceText();
    if (!t) return false;
    syncGlobals(t);
    var gen = qs("generate-button");
    if (gen) gen.disabled = false;
    var genMeta = qs("generation-meta");
    if (genMeta) {
      var current = (genMeta.textContent || "").trim();
      if (/readable file/i.test(current) && !metaLabel) {
        /* keep */
      } else if (metaLabel) {
        genMeta.textContent = metaLabel;
      } else if (/Read at least one file first/i.test(current) || !current) {
        genMeta.textContent = "OCR / extracted text ready. Choose a study mode";
      }
    }
    return true;
  }

  function getKeys() {
    try {
      if (typeof window.__revdevGetKeys === "function") {
        var k = window.__revdevGetKeys();
        if (k && ((k.gemini && String(k.gemini).trim()) || (k.groq && String(k.groq).trim()))) {
          return {
            gemini: String(k.gemini || "").trim(),
            groq: String(k.groq || "").trim()
          };
        }
      }
    } catch (e) {}
    var gem = "";
    var groq = "";
    try {
      gem = (qs("api-key-gemini") && qs("api-key-gemini").value) || "";
      groq = (qs("api-key-groq") && qs("api-key-groq").value) || "";
    } catch (e2) {}
    try {
      if (!gem) gem = localStorage.getItem("revdev_key_gemini") || localStorage.getItem("revdev_gemini_key") || "";
      if (!groq) groq = localStorage.getItem("revdev_key_groq") || localStorage.getItem("revdev_groq_key") || "";
    } catch (e3) {}
    return { gemini: String(gem || "").trim(), groq: String(groq || "").trim() };
  }

  function hasAnyKey() {
    var k = getKeys();
    return !!(k.gemini || k.groq);
  }

  window.__revdevSyncGenerateReady = syncGenerateReady;

  function install() {
    if (window.__revdevOcrGenerateGuardV3) return;
    window.__revdevOcrGenerateGuardV3 = true;

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

    var preview = qs("preview");
    if (preview && window.MutationObserver) {
      new MutationObserver(function () {
        setTimeout(tick, 50);
      }).observe(preview, { childList: true, characterData: true, subtree: true });
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
        if (src) {
          syncGlobals(src);
          syncGenerateReady();
        }
      },
      true
    );

    var statusEl = qs("generation-status");
    if (statusEl && window.MutationObserver) {
      new MutationObserver(function () {
        var msg = (statusEl.textContent || "").trim();
        if (!/Read at least one file before generating/i.test(msg)) return;

        var src = hasUsableSourceText();
        if (!src) return;

        if (!hasAnyKey()) {
          setStatus(
            "OCR text is ready. Paste a Gemini or Groq API key under Connect AI, then click Generate again.",
            "error"
          );
          return;
        }

        if (window.__revdevOcrRetrying) return;
        window.__revdevOcrRetrying = true;
        syncGlobals(src);
        setStatus("Starting generation from OCR text…", "");
        setTimeout(function () {
          try {
            var btn = qs("generate-button");
            if (btn) btn.click();
          } catch (e) {}
          setTimeout(function () {
            window.__revdevOcrRetrying = false;
            var st = qs("generation-status");
            var m2 = st ? (st.textContent || "").trim() : "";
            if (/Read at least one file before generating/i.test(m2) && hasUsableSourceText()) {
              if (!hasAnyKey()) {
                setStatus(
                  "OCR text is ready. Paste a Gemini or Groq API key under Connect AI, then click Generate again.",
                  "error"
                );
              } else {
                setStatus(
                  "OCR text is loaded but Generate still blocked. Hard-refresh the page (Ctrl+Shift+R), confirm your API key is saved, then try again.",
                  "error"
                );
              }
            }
          }, 400);
        }, 50);
      }).observe(statusEl, { childList: true, characterData: true, subtree: true });
    }

    tick();
    setTimeout(tick, 500);
    setTimeout(tick, 2000);
    console.info("RevDev: generate-ready guard v3 (OCR sync + key-aware errors)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(install, 300);
      setTimeout(install, 1200);
      setTimeout(install, 3000);
    });
  } else {
    setTimeout(install, 300);
    setTimeout(install, 1200);
    setTimeout(install, 3000);
  }
})();
