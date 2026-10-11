/* ============================================================
   RevDev OCR — Phase 2 (quality + UX)
   Additive only. Lazy-loads Tesseract.js on Run OCR.
   Phase 2: preprocessing, language select, session cache,
   size/page warnings, clearer errors, better PDF scale/PSM.
   ============================================================ */
(function installOcr() {
  "use strict";

  var TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  var MAX_PAGES = 30;
  var MAX_FILE_MB = 15;
  var MIN_TEXT_HINT = 40;
  var MIN_IMAGE_EDGE = 80;
  var PDF_SCALE = 2.0;
  var MAX_CANVAS_W = 2000;

  var tesseractLoading = null;
  var ocrBusy = false;
  var cancelFlag = false;
  /** @type {Map<string, {text: string, at: number}>} */
  var ocrCache = new Map();

  function qs(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, kind) {
    var el = qs("status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status-message" + (kind ? " " + kind : "");
  }

  function fileCacheKey(file) {
    return [file.name, file.size, file.lastModified || 0].join("::");
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
      "<strong>OCR — convert scans and images to text</strong>" +
      "<p>Runs in your browser. Accuracy depends on image clarity; always skim the preview before Generate.</p>" +
      '<div class="ocr-controls">' +
      '<label class="field ocr-lang-field">' +
      '<span class="field-label">OCR language</span>' +
      '<select id="ocr-lang-select" aria-label="OCR language">' +
      '<option value="eng" selected>English</option>' +
      '<option value="eng+fil">English + Filipino</option>' +
      '<option value="fil">Filipino</option>' +
      '<option value="spa">Spanish</option>' +
      "</select>" +
      "</label>" +
      "</div>" +
      '<div class="ocr-actions">' +
      '<button type="button" class="button primary" id="ocr-run-button">Run OCR</button>' +
      '<button type="button" class="button secondary" id="ocr-cancel-button" hidden>Cancel</button>' +
      '<button type="button" class="button secondary small-button" id="ocr-clear-cache-button" title="Clear cached OCR results for this session">Clear OCR cache</button>' +
      '<span class="mini-note" id="ocr-progress-label"></span>' +
      "</div>" +
      '<div id="ocr-progress" class="progress" hidden><div id="ocr-progress-fill" class="progress-fill" style="width:0%"></div></div>' +
      '<p class="field-hint" id="ocr-hint"></p>' +
      "</div>";

    var status = qs("status");
    if (status && status.parentNode === uploadCard) {
      uploadCard.insertBefore(panel, status);
    } else {
      uploadCard.appendChild(panel);
    }

    var runBtn = qs("ocr-run-button");
    var cancelBtn = qs("ocr-cancel-button");
    var clearBtn = qs("ocr-clear-cache-button");
    if (runBtn) runBtn.addEventListener("click", function () { startOcr(false); });
    if (cancelBtn) cancelBtn.addEventListener("click", function () { cancelFlag = true; });
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        ocrCache.clear();
        setHint("OCR session cache cleared.");
        setStatus("OCR cache cleared.", "success");
      });
    }

    return panel;
  }

  function setHint(msg) {
    var el = qs("ocr-hint");
    if (el) el.textContent = msg || "";
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
        reject(new Error("Could not load OCR library. Check your network and try again."));
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
    return t.indexOf("image/") === 0 || /\.(png|jpe?g|webp)$/i.test(n);
  }

  function isPdfFile(file) {
    var n = (file.name || "").toLowerCase();
    var t = (file.type || "").toLowerCase();
    return t === "application/pdf" || n.endsWith(".pdf");
  }

  function getSelectedLang() {
    var sel = qs("ocr-lang-select");
    return (sel && sel.value) || "eng";
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

    var gen = qs("generate-button");
    if (gen) gen.disabled = false;

    var genMeta = qs("generation-meta");
    if (genMeta) genMeta.textContent = "OCR text ready — choose a study mode";

    return true;
  }

  /** Grayscale + mild contrast stretch for cleaner Tesseract input */
  function preprocessCanvas(sourceCanvas) {
    var w = sourceCanvas.width;
    var h = sourceCanvas.height;
    var out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    var ctx = out.getContext("2d");
    ctx.drawImage(sourceCanvas, 0, 0);
    var imageData;
    try {
      imageData = ctx.getImageData(0, 0, w, h);
    } catch (e) {
      return sourceCanvas;
    }
    var d = imageData.data;
    var i, min = 255, max = 0, g;
    for (i = 0; i < d.length; i += 4) {
      g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      if (g < min) min = g;
      if (g > max) max = g;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    var range = max - min || 1;
    for (i = 0; i < d.length; i += 4) {
      g = ((d[i] - min) / range) * 255;
      // mild contrast around mid
      g = (g - 128) * 1.15 + 128;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      d[i] = d[i + 1] = d[i + 2] = g | 0;
    }
    ctx.putImageData(imageData, 0, 0);
    return out;
  }

  function fileToImageBitmap(file) {
    return file.arrayBuffer().then(function (buf) {
      return createImageBitmap(new Blob([buf]));
    });
  }

  function canvasFromBitmap(bitmap) {
    var scale = bitmap.width > MAX_CANVAS_W ? MAX_CANVAS_W / bitmap.width : 1;
    // Upscale very small images slightly for OCR
    if (bitmap.width < 600 && bitmap.width > 0) {
      scale = Math.min(2, 900 / bitmap.width);
    }
    var w = Math.max(1, Math.round(bitmap.width * scale));
    var h = Math.max(1, Math.round(bitmap.height * scale));
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    try {
      bitmap.close();
    } catch (e) {}
    return preprocessCanvas(canvas);
  }

  async function ocrCanvas(Tesseract, canvas, lang, onProgress) {
    var result = await Tesseract.recognize(canvas, lang, {
      logger: function (m) {
        if (m && m.status === "recognizing text" && typeof m.progress === "number" && onProgress) {
          onProgress(m.progress);
        }
      }
    });
    return (result && result.data && result.data.text) || "";
  }

  function validateImageSize(bitmap, fileName) {
    if (bitmap.width < MIN_IMAGE_EDGE || bitmap.height < MIN_IMAGE_EDGE) {
      throw new Error(
        "Image too small (" +
          bitmap.width +
          "×" +
          bitmap.height +
          ") in " +
          fileName +
          ". Use a clearer, higher-resolution image."
      );
    }
  }

  async function ocrImageFile(Tesseract, file, lang, pageIndex, total, onPage) {
    if (cancelFlag) throw new Error("OCR cancelled");
    onPage(pageIndex, total, 0);
    var bitmap = await fileToImageBitmap(file);
    validateImageSize(bitmap, file.name);
    var canvas = canvasFromBitmap(bitmap);
    var text = await ocrCanvas(Tesseract, canvas, lang, function (p) {
      onPage(pageIndex, total, p);
    });
    return text;
  }

  async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
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

  async function ocrPdfFile(Tesseract, file, lang, onPage) {
    var pdfjs = await loadPdfJs();
    if (!pdfjs || !pdfjs.getDocument) {
      throw new Error(
        "PDF OCR needs PDF.js. Export pages as PNG/JPG, or use a text-based PDF."
      );
    }
    var data = new Uint8Array(await file.arrayBuffer());
    var doc = await pdfjs.getDocument({ data: data }).promise;
    var totalPages = doc.numPages;
    var n = Math.min(totalPages, MAX_PAGES);
    if (totalPages > MAX_PAGES) {
      setHint(
        "This PDF has " +
          totalPages +
          " pages. OCR will process the first " +
          MAX_PAGES +
          " only."
      );
    }
    var parts = [];
    for (var i = 1; i <= n; i++) {
      if (cancelFlag) throw new Error("OCR cancelled");
      onPage(i, n, 0);
      var page = await doc.getPage(i);
      var viewport = page.getViewport({ scale: PDF_SCALE });
      var canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      var ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      var prepared = preprocessCanvas(canvas);
      var text = await ocrCanvas(Tesseract, prepared, lang, function (p) {
        onPage(i, n, p);
      });
      if (text && text.trim()) {
        parts.push("--- Page " + i + " ---\n" + text.trim());
      }
    }
    if (totalPages > MAX_PAGES) {
      parts.push(
        "\n[OCR stopped after " +
          MAX_PAGES +
          " pages out of " +
          totalPages +
          ". Split the PDF to process the rest.]"
      );
    }
    return parts.join("\n\n");
  }

  function preflightWarnings(files) {
    var warnings = [];
    files.forEach(function (f) {
      var mb = f.size / (1024 * 1024);
      if (mb > MAX_FILE_MB) {
        warnings.push(
          f.name + " is " + mb.toFixed(1) + " MB (over " + MAX_FILE_MB + " MB). OCR may be slow or fail on this device."
        );
      }
    });
    return warnings;
  }

  async function startOcr(forceRefresh) {
    if (ocrBusy) return;
    var files = getSelectedFiles();
    if (!files.length) {
      setStatus("Select a file first, then run OCR.", "error");
      setHint("Choose an image (PNG/JPG/WEBP) or a scanned PDF.");
      showPanel(true);
      return;
    }

    var targets = files.filter(function (f) {
      return isImageFile(f) || isPdfFile(f);
    });
    if (!targets.length) {
      setStatus("OCR works on images (PNG/JPG/WEBP) and scanned PDFs.", "error");
      setHint("Text PDFs and DOCX already use normal extraction — no OCR needed.");
      showPanel(true);
      return;
    }

    var warnings = preflightWarnings(targets);
    if (warnings.length) setHint(warnings.join(" "));

    var lang = getSelectedLang();
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
      var usedCache = 0;

      for (var fi = 0; fi < targets.length; fi++) {
        if (cancelFlag) throw new Error("OCR cancelled");
        var file = targets[fi];
        var key = fileCacheKey(file) + "::" + lang;
        var cached = !forceRefresh && ocrCache.get(key);

        if (cached && cached.text) {
          usedCache++;
          allText.push("### " + file.name + "\n\n" + cached.text);
          setProgress(((fi + 1) / targets.length) * 100, "Cached " + (fi + 1) + "/" + targets.length);
          continue;
        }

        setStatus("OCR: " + file.name + " (" + (fi + 1) + "/" + targets.length + ")…", "");

        var text;
        if (isImageFile(file)) {
          text = await ocrImageFile(
            Tesseract,
            file,
            lang,
            fi + 1,
            targets.length,
            function (page, total, p) {
              var pct = ((page - 1) / total) * 100 + (p * 100) / total;
              setProgress(pct, "Image " + page + "/" + total);
            }
          );
        } else {
          text = await ocrPdfFile(Tesseract, file, lang, function (page, total, p) {
            var pct = ((page - 1) / total) * 100 + (p * 100) / total;
            setProgress(pct, "Page " + page + "/" + total);
          });
        }

        text = (text || "").trim();
        if (text) {
          ocrCache.set(key, { text: text, at: Date.now() });
          allText.push("### " + file.name + "\n\n" + text);
        }
      }

      var combined = allText.join("\n\n");
      if (!combined.trim()) {
        setStatus("OCR finished but found no text. Try a clearer, higher-resolution image.", "error");
        setHint("Tips: good lighting, flat page, avoid blur and glare.");
        showPanel(true);
        return;
      }

      injectText(combined, targets.length + " OCR file(s)");
      var msg = "OCR complete. Text is ready for Generate.";
      if (usedCache) msg += " (" + usedCache + " from cache)";
      setStatus(msg, "success");
      setHint("Skim the preview for OCR mistakes before generating a mock exam.");
      setProgress(100, "Done");
      showPanel(true);
    } catch (err) {
      var msg = (err && err.message) || String(err);
      if (/cancel/i.test(msg)) {
        setStatus("OCR cancelled.", "");
        setHint("");
      } else {
        setStatus("OCR failed: " + msg, "error");
        setHint("You can retry, try another image, or use a text PDF/DOCX if available.");
        showPanel(true);
      }
    } finally {
      ocrBusy = false;
      if (runBtn) runBtn.disabled = false;
      if (cancelBtn) cancelBtn.hidden = true;
      setTimeout(hideProgress, 1500);
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
    var files = getSelectedFiles();
    var hasImage = files.some(isImageFile);
    if (hasImage || looksLikeNeedsOcr()) {
      showPanel(true);
      if (hasImage) {
        setHint("Image selected. Run OCR to extract text.");
      }
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

    window.__revdevRunOcr = function () {
      return startOcr(false);
    };
    window.__revdevClearOcrCache = function () {
      ocrCache.clear();
    };
    console.info("RevDev OCR: phase 2 armed (preprocess + cache + languages)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(bind, 400);
    });
  } else {
    setTimeout(bind, 400);
  }
})();
