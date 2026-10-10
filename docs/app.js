/* RevDev loader: dual-key app from backup + count/render sync + selection fix */
const src = await fetch("https://cdn.jsdelivr.net/gh/Angelos-Brain/RevDev@backup-before-grok-2026-10-10/docs/app.js");
if (!src.ok) throw new Error("Failed to load RevDev app.js from backup");
const code = await src.text();
const blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
await import(blobUrl);

/* --------------------------------------------------------------------------
 * Count/render sync: status, header, progress, and form must agree on the
 * final items array. Selection fix: never re-render once the form matches
 * finalItems (that was wiping radio clicks), and wire a single delegated
 * change listener for answer state + "Answered X of N" counter.
 * -------------------------------------------------------------------------- */
(function fixCountAndSelection() {
  var TYPE_MAP = {
    multiple_choice: "Multiple choice",
    true_false: "True/False",
    identification: "Identification",
    short_answer: "Short answer"
  };

  var answerState = Object.create(null);
  var runId = "r" + Date.now().toString(36);
  var formBound = false;
  var lastStatusMsg = "";
  var reconcileTimer = null;

  function qs(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, kind) {
    var el = qs("generation-status");
    if (!el) return;
    if (el.textContent === msg && (!kind || el.className.indexOf(kind) !== -1)) {
      lastStatusMsg = msg;
      return;
    }
    lastStatusMsg = msg;
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
    var row =
      document.querySelector(".generate-card .action-row") ||
      (qs("generate-button") && qs("generate-button").parentNode);
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

  function updateAnsweredCounter() {
    var items = getFinalItems();
    var total = items.length;
    var answered = 0;
    Object.keys(answerState).forEach(function (k) {
      if (answerState[k] != null && String(answerState[k]).trim() !== "") answered += 1;
    });
    var el = qs("answered-count");
    var actions = document.querySelector(".exam-actions");
    if (!actions) return;
    if (!el) {
      el = document.createElement("span");
      el.id = "answered-count";
      el.className = "mini-note";
      el.style.marginLeft = "12px";
      actions.appendChild(el);
    }
    el.textContent = "Answered " + answered + " of " + total;
  }

  function bindFormOnce(form) {
    if (!form || formBound) return;
    formBound = true;
    form.addEventListener("change", function (ev) {
      var t = ev.target;
      if (!t || !t.name) return;
      if (t.type === "radio" || t.type === "text") {
        var m = String(t.name).match(/^question-(\d+)$/);
        if (!m) return;
        var idx = m[1];
        answerState[idx] = t.type === "radio" ? t.value : t.value;
        var label = t.closest(".choice-option");
        if (label && t.type === "radio") {
          var group = form.querySelectorAll('input[name="' + t.name + '"]');
          group.forEach(function (inp) {
            var row = inp.closest(".choice-option");
            if (row) row.classList.toggle("selected", inp.checked);
          });
        }
        updateAnsweredCounter();
      }
    });
    form.addEventListener("click", function (ev) {
      var label = ev.target && ev.target.closest ? ev.target.closest(".choice-option") : null;
      if (!label) return;
      var input = label.querySelector('input[type="radio"]');
      if (!input || input.disabled) return;
      if (!input.checked) {
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  function renderExam(items) {
    var form = qs("exam-form");
    var count = qs("exam-count");
    var out = qs("exam-output");
    var intro = qs("exam-intro");
    if (!form) return;

    runId = "r" + Date.now().toString(36);
    answerState = Object.create(null);
    formBound = false;

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
        '<span class="question-number">' +
        String(index + 1).padStart(2, "0") +
        "</span>" +
        '<span class="question-type">' +
        typeLabel +
        "</span>" +
        '<span class="question-text"></span>';
      legend.querySelector(".question-text").textContent = question.question || "";
      fs.appendChild(legend);

      var name = "question-" + index;
      if (question.type === "multiple_choice" || question.type === "true_false") {
        var opts = document.createElement("div");
        opts.className = "question-options";
        opts.setAttribute("role", "radiogroup");
        opts.setAttribute("aria-label", "Question " + (index + 1) + " options");
        (question.options || []).forEach(function (option, oi) {
          var letter = String.fromCharCode(65 + oi);
          var id = runId + "-q" + index + "-" + letter;
          var label = document.createElement("label");
          label.className = "choice-option";
          label.htmlFor = id;
          var input = document.createElement("input");
          input.type = "radio";
          input.name = name;
          input.id = id;
          input.value = option;
          if (answerState[String(index)] === option) {
            input.checked = true;
            label.classList.add("selected");
          }
          var marker = document.createElement("span");
          marker.className = "choice-marker";
          marker.textContent = letter;
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
        input.name = name;
        input.id = runId + "-q" + index + "-text";
        input.autocomplete = "off";
        input.placeholder = "Type your answer";
        if (answerState[String(index)]) input.value = answerState[String(index)];
        fs.appendChild(input);
      }
      form.appendChild(fs);
    });

    bindFormOnce(form);
    updateAnsweredCounter();

    var rendered = form.querySelectorAll(".exam-question").length;
    if (rendered !== items.length) {
      console.error("RevDev: rendered count differs from finalItems.length", rendered, items.length);
    }
  }

  function reconcile() {
    var items = getFinalItems();
    var requested = getRequested() || items.length;
    var mode = getMode();
    var job = window.__revdevJob || {};
    var n = items.length;

    if (mode === "exam") {
      var form = qs("exam-form");
      var rendered = form ? form.querySelectorAll(".exam-question").length : 0;
      if (n > 0 && rendered !== n) {
        renderExam(items);
      } else {
        var countEl = qs("exam-count");
        if (countEl) countEl.textContent = n + " questions";
        if (form) bindFormOnce(form);
        updateAnsweredCounter();
      }
    } else if (mode === "flashcards") {
      var fc = qs("flashcard-count");
      if (fc) fc.textContent = n + " cards";
    } else if (mode === "summary") {
      var sc = qs("summary-topic-count");
      if (sc) sc.textContent = n + " topics";
    }

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
    }
  }

  var statusEl = qs("generation-status");
  if (!statusEl) return;

  var observer = new MutationObserver(function () {
    var text = statusEl.textContent || "";
    if (!/Done\.|Generated \d+|of \d+ requested|after extra attempts|source supported/i.test(text)) {
      return;
    }
    if (reconcileTimer) clearTimeout(reconcileTimer);
    var isShortReport = /requested\s+\d+.*supported\s+\d+/i.test(text);
    reconcileTimer = setTimeout(function () {
      reconcileTimer = null;
      reconcile();
    }, isShortReport ? 900 : 80);
  });
  observer.observe(statusEl, { childList: true, characterData: true, subtree: true });

  var existingForm = qs("exam-form");
  if (existingForm) bindFormOnce(existingForm);

  console.info("RevDev: count/render sync + selection fix armed");
})();
