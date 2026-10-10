/* RevDev loader: dual-key app from backup + count/render sync fix */
const src = await fetch("https://cdn.jsdelivr.net/gh/Angelos-Brain/RevDev@backup-before-grok-2026-10-10/docs/app.js");
if (!src.ok) throw new Error("Failed to load RevDev app.js from backup");
const code = await src.text();
const blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
await import(blobUrl);

/* --------------------------------------------------------------------------
 * Fix: status / progress / header must match the final items array that is
 * actually rendered. The dual engine and the top-up helper can disagree:
 * top-up updates job.collected and the "Generated N" message but does not
 * re-draw the exam form, so the UI can claim 40 while only 36 cards exist.
 * -------------------------------------------------------------------------- */
(function fixGeneratedCountMismatch() {
  var TYPE_MAP = {
    multiple_choice: "Multiple choice",
    true_false: "True/False",
    identification: "Identification",
    short_answer: "Short answer"
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, kind) {
    var el = qs("generation-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status-message" + (kind ? " " + kind : "");
  }

  function setProgress(pct, kind) {
    var bar = qs("progress");
    var fill = qs("progress-fill");
    var n = Math.max(0, Math.min(100, Number(pct) || 0));
    if (bar) {
      bar.hidden = false;
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", "100");
      bar.setAttribute("aria-valuenow", String(Math.round(n)));
    }
    if (fill) {
      fill.style.width = n + "%";
      fill.classList.toggle("is-success", kind === "success");
      fill.classList.toggle("is-warning", kind === "warning" || kind === "error");
      fill.classList.toggle("is-error", kind === "error");
    }
  }

  function getFinalItems() {
    var job = window.__revdevJob;
    if (job && Array.isArray(job.collected)) return job.collected;
    var last = window.__revdevLastResult;
    if (last && Array.isArray(last.items)) return last.items;
    return [];
  }

  function getRequested() {
    var job = window.__revdevJob;
    if (job && job.totalWanted) return job.totalWanted;
    var slider = qs("item-count");
    if (slider) {
      var v = parseInt(slider.value, 10);
      if (v > 0) return v;
    }
    return 0;
  }

  function getMode() {
    var job = window.__revdevJob;
    if (job && job.mode) return job.mode;
    var last = window.__revdevLastResult;
    if (last && last.mode) return last.mode;
    var sel = qs("mode-select");
    return (sel && sel.value) || "exam";
  }

  function providerLabel(job) {
    job = job || window.__revdevJob || {};
    return job.provider === "groq" ? "Groq" : "Gemini";
  }

  function ensureMissingButton(missing) {
    var row = document.querySelector(".generate-card .action-row") || qs("generate-button") && qs("generate-button").parentNode;
    if (!row) return;
    var btn = qs("generate-missing");
    if (missing <= 0) {
      if (btn) btn.hidden = true;
      return;
    }
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "generate-missing";
      btn.type = "button";
      btn.className = "button secondary";
      btn.style.marginLeft = "8px";
      row.appendChild(btn);
      btn.addEventListener("click", function () {
        var gen = qs("generate-button");
        if (gen && !gen.disabled) gen.click();
      });
    }
    btn.hidden = false;
    btn.textContent = "Generate missing " + missing;
  }

  function renderExam(items) {
    var form = qs("exam-form");
    var count = qs("exam-count");
    var out = qs("exam-output");
    var intro = qs("exam-intro");
    if (!form) return;
    if (out) out.hidden = false;
    if (qs("flashcards-output")) qs("flashcards-output").hidden = true;
    if (qs("summary-output")) qs("summary-output").hidden = true;
    if (count) count.textContent = items.length + " questions";
    if (intro) intro.textContent = "Answer all questions. Unanswered questions are scored as incorrect.";
    form.innerHTML = "";
    items.forEach(function (question, index) {
      var fs = document.createElement("fieldset");
      fs.className = "exam-question";
      fs.dataset.index = String(index);
      var typeKey = String(question.type || "").toLowerCase().replace(/\s+/g, "_");
      var typeLabel = TYPE_MAP[typeKey] || String(question.type || "").replace(/_/g, " ");
      var legend = document.createElement("legend");
      legend.innerHTML =
        '<span class="question-number">' + String(index + 1).padStart(2, "0") + "</span>" +
        '<span class="question-type">' + typeLabel + "</span>" +
        '<span class="question-text"></span>';
      legend.querySelector(".question-text").textContent = question.question || "";
      fs.appendChild(legend);
      if (question.type === "multiple_choice" || question.type === "true_false") {
        var opts = document.createElement("div");
        opts.className = "question-options";
        (question.options || []).forEach(function (option, oi) {
          var label = document.createElement("label");
          label.className = "choice-option";
          var input = document.createElement("input");
          input.type = "radio";
          input.name = "question-" + index;
          input.value = option;
          var marker = document.createElement("span");
          marker.className = "choice-marker";
          marker.textContent = String.fromCharCode(65 + oi);
          var val = document.createElement("span");
          val.textContent = option;
          label.append(input, marker, val);
          opts.appendChild(label);
        });
        fs.appendChild(opts);
      } else {
        var input = document.createElement("input");
        input.className = "answer-input";
        input.type = "text";
        input.name = "question-" + index;
        input.autocomplete = "off";
        input.placeholder = "Type your answer";
        fs.appendChild(input);
      }
      form.appendChild(fs);
    });
    var rendered = form.querySelectorAll(".exam-question").length;
    if (rendered !== items.length) {
      console.error("RevDev: rendered count differs from finalItems.length", rendered, items.length);
    }
  }

  function updateFlashcardCount(items) {
    var count = qs("flashcard-count");
    if (count) count.textContent = items.length + " cards";
  }

  function updateSummaryCount(items) {
    var count = qs("summary-topic-count");
    if (count) count.textContent = items.length + " topics";
  }

  function reconcile(forceRender) {
    var items = getFinalItems();
    var requested = getRequested();
    var mode = getMode();
    var job = window.__revdevJob || {};
    var n = items.length;

    if (mode === "exam") {
      var form = qs("exam-form");
      var rendered = form ? form.querySelectorAll(".exam-question").length : 0;
      if (forceRender || (n > 0 && rendered !== n)) {
        renderExam(items);
      } else {
        var countEl = qs("exam-count");
        if (countEl) countEl.textContent = n + " questions";
      }
    } else if (mode === "flashcards") {
      updateFlashcardCount(items);
    } else if (mode === "summary") {
      updateSummaryCount(items);
    }

    if (!requested) requested = n;
    var missing = Math.max(0, requested - n);
    var provider = providerLabel(job);

    if (n >= requested && requested > 0) {
      setStatus("Done. Generated " + n + " item(s) using " + provider + ".", "success");
      setProgress(100, "success");
      ensureMissingButton(0);
    } else if (n > 0 && missing > 0) {
      setStatus(
        "Generated " + n + " of " + requested + " requested. " + missing + " could not be generated.",
        "error"
      );
      setProgress((n / requested) * 100, "warning");
      ensureMissingButton(missing);
      console.info("RevDev: short run", { final: n, requested: requested, missing: missing });
    }
  }

  var statusEl = qs("generation-status");
  if (!statusEl) return;

  var busy = false;
  var observer = new MutationObserver(function () {
    if (busy) return;
    var text = statusEl.textContent || "";
    if (!/Done\.|Generated \d+|of \d+ requested|after extra attempts|source supported/i.test(text)) {
      return;
    }
    var isShortReport = /requested\s+\d+.*supported\s+\d+/i.test(text);
    var delay = isShortReport ? 800 : 50;
    busy = true;
    setTimeout(function () {
      try {
        reconcile(true);
      } finally {
        busy = false;
      }
    }, delay);
  });
  observer.observe(statusEl, { childList: true, characterData: true, subtree: true });
  console.info("RevDev: count/render sync armed");
})();
