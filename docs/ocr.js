/* ============================================================
   RevDev OCR (Phases 1-4)
   Additive only. Lazy-loads Tesseract on local OCR.
   Phase 3: optional Gemini Vision OCR (user key + opt-in)
   Phase 4: deskew-ish prep, export .txt, handwriting note, SRI load
   ============================================================ */
(function installOcr() {
  "use strict";

  var TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  var GEMINI_MODEL = "gemini-2.0-flash";
  var GEMINI_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    GEMINI_MODEL +
    ":generateContent";
  var MAX_PAGES = 30;
  var MAX_FILE_MB = 15;
  var MIN_TEXT_HINT = 40;
  var MIN_IMAGE_EDGE = 80;
  var PDF_SCALE = 2.0;
  var MAX_CANVAS_W = 2000;
  var GEMINI_MAX_DIM = 1280;
  var GEMINI_JPEG_QUALITY = 0.72;

  var tesseractLoading = null;
  var ocrBusy = false;
  var cancelFlag = false;
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

  function setHint(msg) {
    var el = qs("ocr-hint");
    if (el) el.textContent = msg || "";
  }

  function fileCacheKey(file) {
    return [file.name, file.size, file.lastModified || 0].join("::");
  }

  function getGeminiKey() {
    var input = qs("api-key-gemini");
    if (input && input.value && input.value.trim().length > 8) {
      return input.value.trim();
    }
    try {
      var keys = [
        "revdev_gemini_key",
        "gemini_api_key",
        "api-key-gemini",
        "revdev_api_key_gemini"
      ];
      for (var i = 0; i < keys.length; i++) {
        var v = localStorage.getItem(keys[i]);
        if (v && v.trim().length > 8) return v.trim();
      }
      // scan localStorage for gemini-like secrets (last resort)
      for (var j = 0; j < localStorage.length; j++) {
        var k = localStorage.key(j) || "";
        if (/gemini/i.test(k) && /key/i.test(k)) {
          var val = localStorage.getItem(k);
          if (val && val.trim().length > 8) return val.trim();
        }
      }
    } catch (e) {}
    return "";
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
      "<strong>OCR: convert scans and images to text</strong>" +
      "<p>Runs in your browser by default. After Read files, OCR adds text from images alongside the text already extracted. It does not replace it.</p>" +
      '<p class="ocr-handwriting-note">Handwriting and low-light photos are often weaker. Prefer flat, typed scans when possible.</p>' +
      '<div class="ocr-controls">' +
      '<label class="field ocr-lang-field">' +
      '<span class="field-label">OCR language (local engine)</span>' +
      '<select id="ocr-lang-select" aria-label="OCR language">' +
      '<option value="eng" selected>English</option>' +
      '<option value="eng+fil">English + Filipino</option>' +
      '<option value="fil">Filipino</option>' +
      '<option value="spa">Spanish</option>' +
      "</select>" +
      "</label>" +
      '<fieldset class="ocr-engine-fieldset">' +
      "<legend class=\"field-label\">OCR engine</legend>" +
      '<label class="ocr-engine-option">' +
      '<input type="radio" name="ocr-engine" value="local" checked>' +
      "<span>Local (Tesseract): free, private, on-device</span>" +
      "</label>" +
      '<label class="ocr-engine-option">' +
      '<input type="radio" name="ocr-engine" value="gemini" id="ocr-engine-gemini">' +
      "<span>Gemini Vision: often clearer; uses your Gemini key &amp; quota</span>" +
      "</label>" +
      "</fieldset>" +
      "</div>" +
      '<div class="ocr-actions">' +
      '<button type="button" class="button primary" id="ocr-run-button">Run OCR</button>' +
      '<button type="button" class="button secondary" id="ocr-cancel-button" hidden>Cancel</button>' +
      '<button type="button" class="button secondary small-button" id="ocr-export-button" hidden>Export OCR .txt</button>' +
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

    qs("ocr-run-button").addEventListener("click", function () {
      startOcr(false);
    });
    qs("ocr-cancel-button").addEventListener("click", function () {
      cancelFlag = true;
    });
    qs("ocr-clear-cache-button").addEventListener("click", function () {
      ocrCache.clear();
      setHint("OCR session cache cleared.");
      setStatus("OCR cache cleared.", "success");
    });
    qs("ocr-export-button").addEventListener("click", exportOcrText);

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

  function getEngine() {
    var gem = document.querySelector('input[name="ocr-engine"][value="gemini"]');
    if (gem && gem.checked) return "gemini";
    return "local";
  }

  function getSelectedLang() {
    var sel = qs("ocr-lang-select");
    return (sel && sel.value) || "eng";
  }

  function extendFileInputAccept() {
    var input = qs("file-input");
    if (!input) return;
    var accept = input.getAttribute("accept") || "";
    [".png", ".jpg", ".jpeg", ".webp", "image/png", "image/jpeg", "image/webp"].forEach(
      function (x) {
        if (accept.indexOf(x) === -1) accept += (accept ? "," : "") + x;
      }
    );
    input.setAttribute("accept", accept);
    var note = document.querySelector(".upload-card .mini-note");
    if (note && note.textContent && note.textContent.indexOf("PNG") === -1) {
      note.textContent = note.textContent.replace(/\s*$/, "") + " · PNG · JPG · WEBP";
    }
  }

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractLoading) return tesseractLoading;
    tesseractLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = TESSERACT_CDN;
      s.async = true;
      s.crossOrigin = "anonymous";
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

  function getPreviewText() {
    var preview = qs("preview");
    if (!preview) return "";
    return (preview.innerText || preview.textContent || "").trim();
  }

  function getExistingExtractedText() {
    // Prefer in-memory source from a prior Read files; fall back to preview.
    var fromMem =
      (window.__revdevSourceText && String(window.__revdevSourceText).trim()) ||
      (window.__revdevExtractedText && String(window.__revdevExtractedText).trim()) ||
      "";
    if (fromMem) return fromMem;
    return getPreviewText();
  }

  function stripPriorOcrSection(text) {
    // If user re-runs OCR, replace only the previous OCR block, keep Read files text.
    var marker = "### OCR (from images / scans)";
    var idx = text.indexOf(marker);
    if (idx === -1) return text.trim();
    return text.slice(0, idx).trim();
  }

  function mergeReadAndOcr(existingText, ocrText) {
    existingText = stripPriorOcrSection(String(existingText || "").trim());
    ocrText = String(ocrText || "").trim();
    if (!ocrText) return existingText;
    if (!existingText) {
      return "### OCR (from images / scans)\n\n" + ocrText;
    }
    // Avoid duplicating if OCR text is already fully contained
    if (existingText.indexOf(ocrText) !== -1) return existingText;
    return (
      existingText +
      "\n\n\n### OCR (from images / scans)\n\n" +
      ocrText
    );
  }

  function injectText(text, metaLabel, opts) {
    opts = opts || {};
    text = String(text || "").trim();
    if (!text) return false;

    var finalText = text;
    if (opts.mergeWithExisting) {
      finalText = mergeReadAndOcr(getExistingExtractedText(), text);
    }

    var preview = qs("preview");
    if (preview) {
      preview.textContent = finalText;
      preview.classList.remove("empty-preview");
    }
    var meta = qs("preview-meta");
    if (meta) {
      meta.textContent =
        (metaLabel || "OCR") + " · " + finalText.length.toLocaleString() + " characters";
    }
    window.__revdevExtractedText = finalText;
    window.__revdevSourceText = finalText;
    window.__revdevLastOcrText = text;
    if (window.__revdevJob) window.__revdevJob.sourceText = finalText;
    var gen = qs("generate-button");
    if (gen) gen.disabled = false;
    var genMeta = qs("generation-meta");
    if (genMeta) {
      genMeta.textContent = opts.mergeWithExisting
        ? "Read files + OCR text ready. Choose a study mode"
        : "OCR text ready. Choose a study mode";
    }
    var exp = qs("ocr-export-button");
    if (exp) exp.hidden = false;
    return true;
  }

  function exportOcrText() {
    var text =
      window.__revdevLastOcrText ||
      window.__revdevExtractedText ||
      getPreviewText();
    if (!text || !text.trim()) {
      setStatus("Nothing to export yet. Run OCR first.", "error");
      return;
    }
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "revdev-ocr-" + new Date().toISOString().slice(0, 10) + ".txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    setStatus("Exported OCR text.", "success");
  }

  /** Grayscale, contrast stretch, simple threshold-friendly prep */
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
      g = (g - 128) * 1.2 + 128;
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

  function canvasFromBitmap(bitmap, maxW) {
    maxW = maxW || MAX_CANVAS_W;
    var scale = bitmap.width > maxW ? maxW / bitmap.width : 1;
    if (bitmap.width < 600 && bitmap.width > 0) {
      scale = Math.min(2.2, 1000 / bitmap.width);
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

  async function ocrCanvasLocal(Tesseract, canvas, lang, onProgress) {
    var result = await Tesseract.recognize(canvas, lang, {
      logger: function (m) {
        if (m && m.status === "recognizing text" && typeof m.progress === "number" && onProgress) {
          onProgress(m.progress);
        }
      }
    });
    return (result && result.data && result.data.text) || "";
  }

  function canvasToJpegBase64(canvas, quality, maxDim) {
    var w = canvas.width;
    var h = canvas.height;
    var scale = 1;
    if (maxDim && Math.max(w, h) > maxDim) {
      scale = maxDim / Math.max(w, h);
    }
    var out = canvas;
    if (scale < 1) {
      out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(w * scale));
      out.height = Math.max(1, Math.round(h * scale));
      out.getContext("2d").drawImage(canvas, 0, 0, out.width, out.height);
    }
    var dataUrl = out.toDataURL("image/jpeg", quality || GEMINI_JPEG_QUALITY);
    var idx = dataUrl.indexOf(",");
    return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  }

  async function ocrCanvasGemini(canvas, apiKey) {
    var b64 = canvasToJpegBase64(canvas, GEMINI_JPEG_QUALITY, GEMINI_MAX_DIM);
    var body = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Transcribe all readable text from this image exactly. " +
                "Preserve reading order. Do not translate. Do not summarize. " +
                "Do not add commentary. If a region is unreadable, skip it. " +
                "Output plain text only."
            },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: b64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8192
      }
    };

    var res = await fetch(GEMINI_URL + "?key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      var errText = await res.text().catch(function () {
        return "";
      });
      var low = (errText || "").toLowerCase();
      if (res.status === 429 || /quota|rate/i.test(low)) {
        throw new Error("Gemini quota/rate limit. Falling back to local OCR is recommended.");
      }
      if (res.status === 400 || res.status === 403 || /api key|permission|invalid/i.test(low)) {
        throw new Error("Gemini key rejected. Check your API key in Connect AI.");
      }
      throw new Error("Gemini OCR failed (" + res.status + ").");
    }

    var data = await res.json();
    var parts =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts;
    if (!parts || !parts.length) return "";
    return parts
      .map(function (p) {
        return p.text || "";
      })
      .join("\n")
      .trim();
  }

  async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    try {
      var mod = await import(
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs"
      );
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

  async function renderPdfPages(file, maxPages) {
    var pdfjs = await loadPdfJs();
    if (!pdfjs || !pdfjs.getDocument) {
      throw new Error(
        "PDF OCR needs PDF.js. Export pages as PNG/JPG, or use a text-based PDF."
      );
    }
    var data = new Uint8Array(await file.arrayBuffer());
    var doc = await pdfjs.getDocument({ data: data }).promise;
    var totalPages = doc.numPages;
    var n = Math.min(totalPages, maxPages || MAX_PAGES);
    var pages = [];
    for (var i = 1; i <= n; i++) {
      if (cancelFlag) throw new Error("OCR cancelled");
      var page = await doc.getPage(i);
      var viewport = page.getViewport({ scale: PDF_SCALE });
      var canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({
        canvasContext: canvas.getContext("2d"),
        viewport: viewport
      }).promise;
      pages.push({ index: i, canvas: preprocessCanvas(canvas), totalPages: totalPages });
    }
    return pages;
  }

  async function processFile(file, engine, lang, Tesseract, apiKey, onProgress) {
    if (isImageFile(file)) {
      onProgress(0, 1, 0, "Image");
      var bitmap = await fileToImageBitmap(file);
      validateImageSize(bitmap, file.name);
      var canvas = canvasFromBitmap(bitmap);
      var text;
      if (engine === "gemini") {
        try {
          text = await ocrCanvasGemini(canvas, apiKey);
        } catch (e) {
          // fallback to local
          setHint(String(e.message || e) + " - using local OCR for this file.");
          if (!Tesseract) Tesseract = await loadTesseract();
          text = await ocrCanvasLocal(Tesseract, canvas, lang, function (p) {
            onProgress(1, 1, p, "Image");
          });
        }
      } else {
        text = await ocrCanvasLocal(Tesseract, canvas, lang, function (p) {
          onProgress(1, 1, p, "Image");
        });
      }
      onProgress(1, 1, 1, "Image");
      return text || "";
    }

    if (isPdfFile(file)) {
      var pages = await renderPdfPages(file, MAX_PAGES);
      if (pages.length && pages[0].totalPages > MAX_PAGES) {
        setHint(
          "This PDF has " +
            pages[0].totalPages +
            " pages. OCR will process the first " +
            MAX_PAGES +
            " only."
        );
      }
      var parts = [];
      for (var i = 0; i < pages.length; i++) {
        if (cancelFlag) throw new Error("OCR cancelled");
        var pg = pages[i];
        onProgress(pg.index, pages.length, 0, "Page");
        var pageText = "";
        if (engine === "gemini") {
          try {
            pageText = await ocrCanvasGemini(pg.canvas, apiKey);
          } catch (e) {
            setHint(String(e.message || e) + " - local OCR for remaining pages.");
            engine = "local";
            if (!Tesseract) Tesseract = await loadTesseract();
            pageText = await ocrCanvasLocal(Tesseract, pg.canvas, lang, function (p) {
              onProgress(pg.index, pages.length, p, "Page");
            });
          }
        } else {
          if (!Tesseract) Tesseract = await loadTesseract();
          pageText = await ocrCanvasLocal(Tesseract, pg.canvas, lang, function (p) {
            onProgress(pg.index, pages.length, p, "Page");
          });
        }
        if (pageText && pageText.trim()) {
          parts.push("--- Page " + pg.index + " ---\n" + pageText.trim());
        }
        onProgress(pg.index, pages.length, 1, "Page");
      }
      if (pages.length && pages[0].totalPages > MAX_PAGES) {
        parts.push(
          "\n[OCR stopped after " +
            MAX_PAGES +
            " pages out of " +
            pages[0].totalPages +
            ". Split the PDF to process the rest.]"
        );
      }
      return parts.join("\n\n");
    }

    return "";
  }

  function preflightWarnings(files) {
    var warnings = [];
    files.forEach(function (f) {
      var mb = f.size / (1024 * 1024);
      if (mb > MAX_FILE_MB) {
        warnings.push(
          f.name +
            " is " +
            mb.toFixed(1) +
            " MB (over " +
            MAX_FILE_MB +
            " MB). OCR may be slow on this device."
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
      setHint("Text PDFs and DOCX already use normal extraction. No OCR needed.");
      showPanel(true);
      return;
    }

    var engine = getEngine();
    var lang = getSelectedLang();
    var apiKey = "";
    if (engine === "gemini") {
      apiKey = getGeminiKey();
      if (!apiKey) {
        setStatus("Gemini OCR needs a Gemini API key in Connect AI.", "error");
        setHint("Paste your Gemini key in step 2, or switch the engine to Local (Tesseract).");
        showPanel(true);
        return;
      }
    }

    var warnings = preflightWarnings(targets);
    if (warnings.length) setHint(warnings.join(" "));

    ocrBusy = true;
    cancelFlag = false;
    var runBtn = qs("ocr-run-button");
    var cancelBtn = qs("ocr-cancel-button");
    if (runBtn) runBtn.disabled = true;
    if (cancelBtn) cancelBtn.hidden = false;

    try {
      var Tesseract = null;
      if (engine === "local") {
        setStatus("Loading OCR engine…", "");
        setProgress(2, "Loading OCR…");
        Tesseract = await loadTesseract();
      } else {
        setStatus("Using Gemini Vision OCR…", "");
        setProgress(2, "Gemini Vision…");
      }

      var allText = [];
      var usedCache = 0;

      for (var fi = 0; fi < targets.length; fi++) {
        if (cancelFlag) throw new Error("OCR cancelled");
        var file = targets[fi];
        var key = fileCacheKey(file) + "::" + engine + "::" + lang;
        var cached = !forceRefresh && ocrCache.get(key);
        if (cached && cached.text) {
          usedCache++;
          allText.push("### " + file.name + "\n\n" + cached.text);
          setProgress(((fi + 1) / targets.length) * 100, "Cached " + (fi + 1) + "/" + targets.length);
          continue;
        }

        setStatus(
          "OCR (" +
            engine +
            "): " +
            file.name +
            " (" +
            (fi + 1) +
            "/" +
            targets.length +
            ")…",
          ""
        );

        var text = await processFile(
          file,
          engine,
          lang,
          Tesseract,
          apiKey,
          function (page, total, p, label) {
            var pct = ((page - 1) / total) * 100 + (p * 100) / total;
            setProgress(pct, (label || "Item") + " " + page + "/" + total);
          }
        );

        text = (text || "").trim();
        if (text) {
          ocrCache.set(key, { text: text, at: Date.now() });
          allText.push("### " + file.name + "\n\n" + text);
        }
      }

      var combined = allText.join("\n\n");
      if (!combined.trim()) {
        setStatus(
          "OCR finished but found no text. Try a clearer, higher-resolution image.",
          "error"
        );
        setHint("Tips: good lighting, flat page, avoid blur and glare.");
        showPanel(true);
        return;
      }

      var hadExisting = !!getExistingExtractedText();
      injectText(combined, targets.length + " OCR file(s) · " + engine, {
        mergeWithExisting: true
      });
      var msg = hadExisting
        ? "OCR complete (" + engine + "). Image text was added alongside your Read files text."
        : "OCR complete (" + engine + "). Text is ready for Generate.";
      if (usedCache) msg += " (" + usedCache + " from cache)";
      setStatus(msg, "success");
      setHint(
        hadExisting
          ? "Preview now has both: text from Read files + OCR from images. Skim before Generate."
          : "Skim the preview for mistakes before generating a mock exam."
      );
      setProgress(100, "Done");
      showPanel(true);
    } catch (err) {
      var msg = (err && err.message) || String(err);
      if (/cancel/i.test(msg)) {
        setStatus("OCR cancelled.", "");
        setHint("");
      } else {
        setStatus("OCR failed: " + msg, "error");
        setHint(
          "Retry, try Local OCR, use a clearer image, or upload a text PDF/DOCX."
        );
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
    var statusHit = /no readable|no text|image-only|scanned|could not extract|empty/i.test(
      status
    );
    var files = getSelectedFiles();
    var hasImage = files.some(isImageFile);
    var hasPdf = files.some(isPdfFile);
    return hasImage || ((hasPdf || files.length) && (statusHit || lowPreview));
  }

  function refreshPanelVisibility() {
    if (ocrBusy) return;
    var files = getSelectedFiles();
    if (!files.length) {
      // Keep panel available but quiet when nothing selected
      showPanel(true);
      setHint("Select a PDF or image, click Read files, then use Run OCR if you need text from images or scans.");
      return;
    }
    var hasImage = files.some(isImageFile);
    var hasPdf = files.some(isPdfFile);
    showPanel(true);
    if (hasImage) {
      setHint("Image selected. Choose Local or Gemini, then Run OCR.");
    } else if (hasPdf) {
      setHint("PDF selected. Click Read files for normal text, then Run OCR to also capture text inside images.");
    } else if (looksLikeNeedsOcr()) {
      setHint("Little text found. Run OCR to extract words from a scan or image.");
    } else {
      setHint("Optional: Run OCR after Read files to add text from images in this file.");
    }
  }

  function bind() {
    extendFileInputAccept();
    ensureUi();
    showPanel(true);
    setHint("Select a file, click Read files, then Run OCR if you need text from images or scans.");

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
      new MutationObserver(function () {
        setTimeout(refreshPanelVisibility, 100);
      }).observe(status, { childList: true, characterData: true, subtree: true });
    }

    window.__revdevRunOcr = function () {
      return startOcr(false);
    };
    window.__revdevClearOcrCache = function () {
      ocrCache.clear();
    };
    window.__revdevExportOcr = exportOcrText;
    console.info("RevDev OCR: phases 1-4 armed (local + Gemini Vision + export)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(bind, 400);
    });
  } else {
    setTimeout(bind, 400);
  }
})();
