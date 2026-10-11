/* ============================================================
   RevDev OCR Phase 1 — optional image/scan text extraction
   Additive only. Does not change generation, keys, or failover.
   Lazy-loads Tesseract.js only when the user clicks Run OCR.
   ============================================================ */
(function installOcr() {
  "use strict";

  var TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  var MAX_PAGES = 20;
  var MIN_TEXT_HINT = 40;
  var tesseractLoading = null;
  var ocrBusy = false;
  var cancelFlag = false;

  function qs(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, kind) {
    var el = qs("status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status-message" + (kind ? " " + kind : "");
  }

  function ensureUi() {
    if (qs("ocr-panel")) return qs("ocr-panel");
    var uploadCard = document.querySelector(".upload-card");
    if (!uploadCard) return null;

    var panel = document.createElement("div");
    panel.id = "ocr-panel";
    panel.className = "ocr-panel";
    panel.hidden = true;
    panel.innerHTML =
      '<div class="ocr-banner">' +
      '<strong>No readable text detected</strong>' +
      '<p>This file may be a scan or image. Run OCR to convert it into words (runs in your browser).</p>' +
      '<div class="ocr-actions">' +
      '<button type="button" class="button primary" id="ocr-run-button">Run OCR</button>' +
      '<button type="button" class="button secondary" id="ocr-cancel-button" hidden>Cancel</button>' +
      '<span class="mini-note" id="ocr-progress-label"></span>' +
      "</div>" +
      '<div id="ocr-progress" class="progress" hidden><div id="ocr-progress-fill" class="progress-fill" style="width:0%"></div></div>' +
      "</div>";

    var status = qs("status");
    if (status && status.parentNode === uploadCard) {
      uploadCard.insertBefore(panel, status);
    } else {
      uploadCard.appendChild(panel);
    }

    var runBtn = qs("ocr-run-button");
    var cancelBtn = qs("ocr-cancel-button");
    if (runBtn) runBtn.addEventListener("click", function () { startOcr(); });
    if (cancelBtn) cancelBtn.addEventListener("click", function () { cancelFlag = true; });

    return panel;
  }

  function showPanel(show) {
    var panel = ensureUi();
    if (!panel) return;
    panel.hidden = !show;
  }

  function setProgress(pct, label) {
    var bar = qs("ocr-progress");
    var fill = qs("ocr-progress-fill");
    var lab = qs("ocr-progress-label");
    if (bar) bar.hidden = false;
    if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
    if (lab) lab.textContent = label || "";
  }

  function hideProgress() {
    var bar = qs("ocr-progress");
    var cancelBtn = qs("ocr-cancel-button");
    if (bar) bar.hidden = true;
    if (cancelBtn) cancelBtn.hidden = true;
  }

  function extendFileInputAccept() {
    var input = qs("file-input");
    if (!input) return;
    var accept = input.getAttribute("accept") || "";
    var extras = [".png", ".jpg", ".jpeg", ".webp", "image/png", "image/jpeg", "image/webp"];
    extras.forEach(function (x) {
      if (accept.indexOf(x) === -1) accept += (accept ? "," : "") + x;
    });
    input.setAttribute("accept", accept);
    var note = document.querySelector(".upload-card .mini-note");
    if (note && note.textContent && note.textContent.indexOf("PNG") === -1) {
      note.textContent = note.textContent.replace(/\s*$/, "") + " · PNG · JPG · WEBP";
    }
    var sub = document.querySelector(".dropzone-subtitle");
    if (sub && sub.textContent && sub.textContent.indexOf("image") === -1) {
      sub.textContent = "Multiple files are supported, including images. Your files stay in this browser.";
    }
  }

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractLoading) return tesseractLoading;
    tesseractLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = TESSERACT_CDN;
      s.async = true;
      s.onload = function () {
        if (window.Tesseract) resolve(window.Tesseract);
        else reject(new Error("Tesseract failed to load"));
      };
      s.onerror = function () {
        tesseractLoading = null;
        reject(new Error("Could not load OCR library (network)"));
      };
      document.head.appendChild(s);
    });
    return tesseractLoading;
  }

  function getSelectedFiles() {
    var input = qs("file-input");
    if (!input || !input.files || !input.files.length) return [];
    return Array.prototype.slice.call(input.files);
  }

  function isImageFile(file) {
    var n = (file.name || "").toLowerCase();
    var t = (file.type || "").toLowerCase();
    return (
      t.indexOf("image/") === 0 ||
      /\.(png|jpe?g|webp)$/i.test(n)
    );
  }

  function isPdfFile(file) {
    var n = (file.name || "").toLowerCase();
    var t = (file.type || "").toLowerCase();
    return t === "application/pdf" || n.endsWith(".pdf");
  }

  function getPreviewText() {
    var preview = qs("preview");
    if (!preview) return "";
    return (preview.innerText || preview.textContent || "").trim();
  }

  function injectText(text, metaLabel) {
    text = String(text || "").trim();
    if (!text) return false;

    var preview = qs("preview");
    if (preview) {
      preview.textContent = text;
      preview.classList.remove("empty-preview");
    }
    var meta = qs("preview-meta");
    if (meta) {
      meta.textContent =
        (metaLabel || "OCR") + " · " + text.length.toLocaleString() + " characters";
    }

    window.__revdevExtractedText = text;
    window.__revdevSourceText = text;
    if (window.__revdevJob) window.__revdevJob.sourceText = text;

    // Enable generate if present
    var gen = qs("generate-button");
    if (gen) gen.disabled = false;
    var readBtn = qs("read-button");
    // leave read button as-is

    var genMeta = qs("generation-meta");
    if (genMeta) genMeta.textContent = "OCR text ready — choose a study mode";

    return true;
  }

  function fileToImageBitmap(file) {
    return file.arrayBuffer().then(function (buf) {
      return createImageBitmap(new Blob([buf]));
    });
  }

  function canvasFromBitmap(bitmap) {
    var maxW = 1600;
    var scale = bitmap.width > maxW ? maxW / bitmap.width : 1;
    var w = Math.max(1, Math.round(bitmap.width * scale));
    var h = Math.max(1, Math.round(bitmap.height * scale));
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    try { bitmap.close(); } catch (e) {}
    return canvas;
  }

  async function ocrCanvas(Tesseract, canvas, onProgress) {
    var result = await Tesseract.recognize(canvas, "eng", {
      logger: function (m) {
        if (m && m.status === "recognizing text" && typeof m.progress === "number" && onProgress) {
          onProgress(m.progress);
        }
      }
    });
    return (result && result.data && result.data.text) || "";
  }

  async function ocrImageFile(Tesseract, file, pageIndex, total, onPage) {
    if (cancelFlag) throw new Error("OCR cancelled");
    onPage(pageIndex, total, 0);
    var bitmap = await fileToImageBitmap(file);
    var canvas = canvasFromBitmap(bitmap);
    var text = await ocrCanvas(Tesseract, canvas, function (p) {
      onPage(pageIndex, total, p);
    });
    return text;
  }

  async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    // Try dynamic import of PDF.js (same major family often used by the app)
    try {
      var mod = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
      var lib = mod.default || mod;
      if (lib && lib.GlobalWorkerOptions) {
        lib.GlobalWorkerOptions.workerSrc =
          "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
      }
      window.pdfjsLib = lib;
      return lib;
    } catch (e) {
      return null;
    }
  }

  async function ocrPdfFile(Tesseract, file, onPage) {
    var pdfjs = await loadPdfJs();
    if (!pdfjs || !pdfjs.getDocument) {
      throw new Error("PDF OCR needs PDF.js. Try exporting pages as images, or use a text PDF.");
    }
    var data = new Uint8Array(await file.arrayBuffer());
    var doc = await pdfjs.getDocument({ data: data }).promise;
    var n = Math.min(doc.numPages, MAX_PAGES);
    var parts = [];
    for (var i = 1; i <= n; i++) {
      if (cancelFlag) throw new Error("OCR cancelled");
      onPage(i, n, 0);
      var page = await doc.getPage(i);
      var viewport = page.getViewport({ scale: 1.5 });
      var canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      var ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      var text = await ocrCanvas(Tesseract, canvas, function (p) {
        onPage(i, n, p);
      });
      if (text && text.trim()) {
        parts.push("--- Page " + i + " ---\n" + text.trim());
      }
    }
    if (doc.numPages > MAX_PAGES) {
      parts.push("\n[OCR stopped after " + MAX_PAGES + " pages. Re-run on a smaller file for the rest.]");
    }
    return parts.join("\n\n");
  }

  async function startOcr() {
    if (ocrBusy) return;
    var files = getSelectedFiles();
    if (!files.length) {
      setStatus("Select a file first, then run OCR.", "error");
      showPanel(true);
      return;
    }

    var targets = files.filter(function (f) {
      return isImageFile(f) || isPdfFile(f);
    });
    if (!targets.length) {
      setStatus("OCR works on images (PNG/JPG/WEBP) and scanned PDFs.", "error");
      showPanel(true);
      return;
    }

    ocrBusy = true;
    cancelFlag = false;
    var runBtn = qs("ocr-run-button");
    var cancelBtn = qs("ocr-cancel-button");
    if (runBtn) runBtn.disabled = true;
    if (cancelBtn) cancelBtn.hidden = false;

    try {
      setStatus("Loading OCR engine…", "");
      setProgress(2, "Loading OCR…");
      var Tesseract = await loadTesseract();

      var allText = [];
      for (var fi = 0; fi < targets.length; fi++) {
        if (cancelFlag) throw new Error("OCR cancelled");
        var file = targets[fi];
        setStatus("OCR: " + file.name + " (" + (fi + 1) + "/" + targets.length + ")…", "");

        var text;
        if (isImageFile(file)) {
          text = await ocrImageFile(Tesseract, file, fi + 1, targets.length, function (page, total, p) {
            var pct = ((page - 1) / total) * 100 + (p * 100) / total;
            setProgress(pct, "Image " + page + "/" + total);
          });
        } else {
          text = await ocrPdfFile(Tesseract, file, function (page, total, p) {
            var pct = ((page - 1) / total) * 100 + (p * 100) / total;
            setProgress(pct, "Page " + page + "/" + total);
          });
        }
        if (text && text.trim()) {
          allText.push("### " + file.name + "\n\n" + text.trim());
        }
      }

      var combined = allText.join("\n\n");
      if (!combined.trim()) {
        setStatus("OCR finished but found no text. Try a clearer image.", "error");
        showPanel(true);
        return;
      }

      injectText(combined, targets.length + " OCR file(s)");
      setStatus("OCR complete. Text is ready for Generate.", "success");
      setProgress(100, "Done");
      showPanel(false);
    } catch (err) {
      var msg = (err && err.message) || String(err);
      if (/cancel/i.test(msg)) {
        setStatus("OCR cancelled.", "");
      } else {
        setStatus("OCR failed: " + msg, "error");
        showPanel(true);
      }
    } finally {
      ocrBusy = false;
      if (runBtn) runBtn.disabled = false;
      if (cancelBtn) cancelBtn.hidden = true;
      setTimeout(hideProgress, 1200);
    }
  }

  function looksLikeNeedsOcr() {
    var status = (qs("status") && qs("status").textContent) || "";
    var preview = getPreviewText();
    var lowPreview = preview.length < MIN_TEXT_HINT;
    var statusHit = /no readable|no text|image-only|scanned|could not extract|empty/i.test(status);
    var files = getSelectedFiles();
    var hasImage = files.some(isImageFile);
    var hasPdf = files.some(isPdfFile);
    return hasImage || ((hasPdf || files.length) && (statusHit || lowPreview));
  }

  function refreshPanelVisibility() {
    if (ocrBusy) return;
    // Always available when images selected; also when extraction looks empty
    var files = getSelectedFiles();
    var hasImage = files.some(isImageFile);
    if (hasImage || looksLikeNeedsOcr()) {
      showPanel(true);
    }
  }

  function bind() {
    extendFileInputAccept();
    ensureUi();

    var input = qs("file-input");
    if (input) {
      input.addEventListener("change", function () {
        setTimeout(refreshPanelVisibility, 300);
      });
    }
    var readBtn = qs("read-button");
    if (readBtn) {
      readBtn.addEventListener("click", function () {
        setTimeout(refreshPanelVisibility, 800);
        setTimeout(refreshPanelVisibility, 2000);
      });
    }

    var status = qs("status");
    if (status && window.MutationObserver) {
      var obs = new MutationObserver(function () {
        setTimeout(refreshPanelVisibility, 100);
      });
      obs.observe(status, { childList: true, characterData: true, subtree: true });
    }

    // Manual access
    window.__revdevRunOcr = startOcr;
    console.info("RevDev OCR: phase 1 armed (images + scanned PDFs)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(bind, 400);
    });
  } else {
    setTimeout(bind, 400);
  }
})();
