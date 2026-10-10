/* RevDev loader: dual-key app from backup + count/selection/review/retake v3 */
const src = await fetch("https://cdn.jsdelivr.net/gh/Angelos-Brain/RevDev@backup-before-grok-2026-10-10/docs/app.js");
if (!src.ok) throw new Error("Failed to load RevDev app.js from backup");
const code = await src.text();
const blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
await import(blobUrl);

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
  var reconcileTimer = null;

  function qs(id) { return document.getElementById(id); }

  function setStatus(msg, kind) {
    var el = qs("generation-status");
    if (!el) return;
    if (el.textContent === msg && (!kind || el.className.indexOf(kind) !== -1)) return;
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
    if (Array.isArray(window.__revdevPristineExamItems)) return window.__revdevPristineExamItems;
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
    var row = document.querySelector(".generate-card .action-row") || (qs("generate-button") && qs("generate-button").parentNode);
    if (!row) return;
    var btn = qs("generate-missing");
    if (missing <= 0) { if (btn) btn.hidden = true; return; }
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
        answerState[m[1]] = t.type === "radio" ? t.value : t.value;
        if (t.type === "radio") {
          form.querySelectorAll('input[name="' + t.name + '"]').forEach(function (inp) {
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
    window.__revdevRenderExamClean = renderExam;
    var form = qs("exam-form");
    var count = qs("exam-count");
    var out = qs("exam-output");
    var intro = qs("exam-intro");
    if (!form) return;
    runId = "r" + Date.now().toString(36);
    answerState = Object.create(null);
    formBound = false;
    window.__revdevAnswerState = answerState;
    window.__revdevExamSubmitted = false;
    if (out) out.hidden = false;
    if (qs("flashcards-output")) qs("flashcards-output").hidden = true;
    if (qs("summary-output")) qs("summary-output").hidden = true;
    if (count) count.textContent = items.length + " questions";
    if (intro) intro.textContent = "Answer all questions. Unanswered questions are scored as incorrect.";
    form.innerHTML = "";
    form.removeAttribute("data-review");
    items.forEach(function (question, index) {
      try {
        delete question.userAnswer;
        delete question.status;
        delete question.result;
        delete question._review;
      } catch (e) {}
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
      var name = "question-" + index;
      if (question.type === "multiple_choice" || question.type === "true_false") {
        var opts = document.createElement("div");
        opts.className = "question-options";
        opts.setAttribute("role", "radiogroup");
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
        fs.appendChild(input);
      }
      form.appendChild(fs);
    });
    bindFormOnce(form);
    updateAnsweredCounter();
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
      if (n > 0 && rendered !== n) renderExam(items);
      else {
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
      setStatus("Generated " + n + " of " + requested + " requested. " + missing + " could not be generated.", "error");
      setProgress((n / requested) * 100, "warning");
      ensureMissingButton(missing);
    }
  }

  var statusEl = qs("generation-status");
  if (!statusEl) return;
  var observer = new MutationObserver(function () {
    var text = statusEl.textContent || "";
    if (!/Done\.|Generated \d+|of \d+ requested|after extra attempts|source supported/i.test(text)) return;
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
  window.__revdevRenderExamClean = renderExam;
  window.__revdevResetAnswerState = function () {
    answerState = Object.create(null);
    formBound = false;
    window.__revdevAnswerState = answerState;
  };
  window.__revdevBindExamForm = function (form) {
    formBound = false;
    bindFormOnce(form);
  };
  console.info("RevDev: count/render sync + selection fix armed");
})();

/* Review fix: explanation label + always highlight correct option */
(function fixExamReviewMarkup() {
  function stripExplanationPrefix(text) {
    return String(text || "").replace(/^\s*explanation\s*:\s*/i, "").trim();
  }
  function normalizeKey(s) { return String(s || "").trim().toLowerCase(); }
  function answersMatch(user, accepted) {
    var norm = normalizeKey(user);
    if (!norm) return false;
    return accepted.some(function (a) {
      return a === norm || (a.length >= 4 && (norm.indexOf(a) !== -1 || a.indexOf(norm) !== -1));
    });
  }

  function markForm(outcomes) {
    var form = document.getElementById("exam-form");
    if (!form || !outcomes || !outcomes.length) return;
    window.__revdevExamSubmitted = true;
    window.__revdevExamResults = outcomes;

    outcomes.forEach(function (outcome, index) {
      var fieldset =
        form.querySelector('.exam-question[data-index="' + index + '"]') ||
        form.querySelectorAll(".exam-question")[index];
      if (!fieldset) return;

      var question = outcome.question || {};
      var answers = (question.answers || []).map(function (a) { return normalizeKey(a); }).filter(Boolean);
      var hasKey = answers.length > 0;
      var userAnswer = outcome.userAnswer != null ? String(outcome.userAnswer) : "";
      var answered = normalizeKey(userAnswer) !== "";
      var correct = hasKey && answered && answersMatch(userAnswer, answers);

      fieldset.classList.remove("is-correct", "is-incorrect", "is-unanswered", "is-no-key");
      if (!hasKey) fieldset.classList.add("is-no-key");
      else if (correct) fieldset.classList.add("is-correct");
      else {
        fieldset.classList.add("is-incorrect");
        if (!answered) fieldset.classList.add("is-unanswered");
      }

      fieldset.querySelectorAll("input, textarea, select").forEach(function (el) { el.disabled = true; });

      fieldset.querySelectorAll(".choice-option").forEach(function (opt) {
        opt.classList.remove("is-user-correct", "is-user-wrong", "is-correct-answer", "is-right-answer", "selected");
        var mark = opt.querySelector(".result-mark");
        if (mark) mark.remove();
      });

      var name = "question-" + index;
      var radios = fieldset.querySelectorAll('input[name="' + name + '"]');
      var textInput = fieldset.querySelector('input[type="text"][name="' + name + '"]');

      if (radios.length) {
        radios.forEach(function (input) {
          var lab = input.closest(".choice-option");
          if (!lab) return;
          var isAccepted = hasKey && answers.indexOf(normalizeKey(input.value)) !== -1;
          var isSelected = !!input.checked;
          if (isAccepted) {
            lab.classList.add("is-correct-answer");
            if (isSelected && correct) lab.classList.add("is-user-correct");
            var check = document.createElement("span");
            check.className = "result-mark result-mark-check";
            check.setAttribute("aria-hidden", "true");
            check.textContent = "\u2713";
            lab.appendChild(check);
          } else if (isSelected && !correct) {
            lab.classList.add("is-user-wrong");
            var cross = document.createElement("span");
            cross.className = "result-mark result-mark-cross";
            cross.setAttribute("aria-hidden", "true");
            cross.textContent = "\u2715";
            lab.appendChild(cross);
          }
          if (isSelected) lab.classList.add("selected");
        });
      } else if (textInput) {
        var existing = fieldset.querySelector(".review-answer-line");
        if (existing) existing.remove();
        if (hasKey) {
          var line = document.createElement("div");
          line.className = "review-answer-line";
          var ca = document.createElement("div");
          ca.className = "review-correct-answer";
          var caLabel = document.createElement("strong");
          caLabel.className = "exp-label";
          caLabel.textContent = "Correct answer:";
          var caBody = document.createElement("span");
          caBody.textContent = " " + question.answers.join("; ");
          ca.append(caLabel, caBody);
          line.appendChild(ca);
          if (answered && !correct) {
            var ua = document.createElement("div");
            ua.className = "review-user-wrong";
            var uaLabel = document.createElement("strong");
            uaLabel.className = "exp-label";
            uaLabel.textContent = "Your answer:";
            var uaBody = document.createElement("span");
            uaBody.textContent = " " + userAnswer;
            ua.append(uaLabel, uaBody);
            line.appendChild(ua);
          }
          fieldset.appendChild(line);
        }
      }

      var badge = fieldset.querySelector(".review-status");
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "review-status";
        var legend = fieldset.querySelector("legend");
        if (legend) legend.after(badge);
        else fieldset.insertBefore(badge, fieldset.firstChild);
      }
      if (!hasKey) {
        badge.className = "review-status is-no-key";
        badge.innerHTML = '<span class="review-status-icon" aria-hidden="true">\u2013</span> Answer key unavailable';
      } else if (correct) {
        badge.className = "review-status is-correct";
        badge.innerHTML = '<span class="review-status-icon" aria-hidden="true">\u2713</span> Correct';
      } else if (!answered) {
        badge.className = "review-status is-unanswered";
        badge.innerHTML = '<span class="review-status-icon" aria-hidden="true">\u25CB</span> Not answered';
      } else {
        badge.className = "review-status is-incorrect";
        badge.innerHTML = '<span class="review-status-icon" aria-hidden="true">\u2715</span> Incorrect';
      }

      var box = fieldset.querySelector(".exam-inline-result, .exam-explanation");
      var expl = stripExplanationPrefix(question.explanation ? String(question.explanation) : "");
      if (!expl) { if (box) box.remove(); return; }
      if (!box) {
        box = document.createElement("div");
        box.className = "exam-inline-result exam-explanation";
        fieldset.appendChild(box);
      }
      box.textContent = "";
      var label = document.createElement("strong");
      label.className = "exp-label";
      label.textContent = "Explanation:";
      var body = document.createElement("span");
      body.className = "exp-text";
      body.textContent = " " + expl;
      box.append(label, body);
    });
  }

  function install() { window.__revdevMarkExamForm = markForm; }
  install();
  setTimeout(install, 0);
  setTimeout(install, 500);
  setTimeout(install, 2000);
  console.info("RevDev: exam review mark/explanation fix armed");
})();

/* Retake v3: capture-phase handler + full DOM rebuild in taking mode only. */
(function fixExamRetake() {
  var TYPE_MAP = {
    multiple_choice: "Multiple choice",
    true_false: "True/False",
    identification: "Identification",
    short_answer: "Short answer"
  };

  function qs(id) { return document.getElementById(id); }

  function snapshotItems() {
    if (Array.isArray(window.__revdevPristineExamItems) && window.__revdevPristineExamItems.length) {
      return window.__revdevPristineExamItems;
    }
    var job = window.__revdevJob;
    if (job && Array.isArray(job.collected) && job.collected.length) return job.collected;
    var last = window.__revdevLastResult;
    if (last && Array.isArray(last.items) && last.items.length) return last.items;
    return [];
  }

  function clearResultsUi() {
    var results = qs("exam-results");
    if (results) results.hidden = true;
    var answerReview = qs("answer-review");
    if (answerReview) answerReview.innerHTML = "";
    var weakTopics = qs("weak-topics");
    if (weakTopics) weakTopics.innerHTML = "";
    var scoreEl = qs("exam-score");
    if (scoreEl) scoreEl.textContent = "0 / 0";
    var percentEl = qs("exam-percent");
    if (percentEl) percentEl.textContent = "0%";
  }

  function resetButtons() {
    var submitBtn = qs("submit-exam");
    var retakeBtn = qs("retake-exam");
    if (submitBtn) { submitBtn.hidden = false; submitBtn.disabled = false; }
    if (retakeBtn) retakeBtn.hidden = true;
  }

  function renderTaking(items) {
    var form = qs("exam-form");
    if (!form) return;
    var runId = "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    if (typeof window.__revdevResetAnswerState === "function") window.__revdevResetAnswerState();
    window.__revdevAnswerState = Object.create(null);
    window.__revdevExamSubmitted = false;
    window.__revdevExamResults = null;

    form.innerHTML = "";
    form.removeAttribute("data-review");

    items.forEach(function (question, index) {
      try {
        delete question.userAnswer;
        delete question.status;
        delete question.result;
        delete question._review;
      } catch (e) {}

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

      var name = "question-" + index;
      if (question.type === "multiple_choice" || question.type === "true_false") {
        var opts = document.createElement("div");
        opts.className = "question-options";
        opts.setAttribute("role", "radiogroup");
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
        fs.appendChild(input);
      }
      form.appendChild(fs);
    });

    var count = qs("exam-count");
    if (count) count.textContent = items.length + " questions";
    var intro = qs("exam-intro");
    if (intro) intro.textContent = "Answer all questions. Unanswered questions are scored as incorrect.";
    var answered = qs("answered-count");
    if (answered) answered.textContent = "Answered 0 of " + items.length;

    if (typeof window.__revdevBindExamForm === "function") {
      window.__revdevBindExamForm(form);
    }
  }

  function assertCleanExam() {
    var form = qs("exam-form");
    if (!form) return [];
    var leftovers = [];
    var reviewSel =
      ".review-status, .result-mark, .exam-inline-result, .exam-explanation, " +
      ".explanation-box, .answer-feedback, .review-answer-line";
    if (form.querySelector(reviewSel)) leftovers.push("review-nodes");
    if (form.querySelector(".is-correct, .is-incorrect, .is-unanswered, .is-no-key")) leftovers.push("card-review-class");
    if (form.querySelector(".is-user-correct, .is-user-wrong, .is-correct-answer, .is-right-answer, .selected")) leftovers.push("option-review-class");
    if (form.querySelector("input:checked")) leftovers.push("checked-input");
    if (form.querySelector("input:disabled, textarea:disabled, select:disabled")) leftovers.push("disabled-input");
    var results = qs("exam-results");
    if (results && !results.hidden) leftovers.push("score-summary-visible");
    if (leftovers.length) console.error("RevDev assertCleanExam leftovers:", leftovers);
    else console.info("RevDev assertCleanExam: clean");
    return leftovers;
  }

  function rebuildCleanExam() {
    var items = snapshotItems();
    if (!items.length) {
      console.error("RevDev: retake aborted — no stored questions");
      return;
    }
    renderTaking(items);
    clearResultsUi();
    resetButtons();
    assertCleanExam();

    var out = qs("exam-output");
    if (out) out.scrollIntoView({ behavior: "smooth", block: "start" });
    var form = qs("exam-form");
    if (form) {
      var first = form.querySelector('input[type="radio"], input[type="text"]');
      if (first) {
        try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
      }
    }
  }

  document.addEventListener(
    "click",
    function (event) {
      var btn = event.target && event.target.closest && event.target.closest("#retake-exam");
      if (!btn) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      rebuildCleanExam();
    },
    true
  );

  function bindButton() {
    var retakeBtn = qs("retake-exam");
    if (!retakeBtn || retakeBtn.__revdevRetakeV3) return;
    retakeBtn.__revdevRetakeV3 = true;
    retakeBtn.type = "button";
    retakeBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      rebuildCleanExam();
    });
  }
  bindButton();
  setTimeout(bindButton, 300);
  setTimeout(bindButton, 1500);

  var actions = document.querySelector(".exam-actions");
  if (actions) {
    new MutationObserver(function () {
      var btn = qs("retake-exam");
      if (btn && !btn.hidden) bindButton();
    }).observe(actions, { attributes: true, subtree: true, attributeFilter: ["hidden"] });
  }

  var statusEl = qs("generation-status");
  if (statusEl) {
    new MutationObserver(function () {
      var text = statusEl.textContent || "";
      if (!/Done\.|Generated \d+/i.test(text)) return;
      var items = snapshotItems();
      if (!items.length) {
        var job = window.__revdevJob;
        if (job && Array.isArray(job.collected)) items = job.collected;
      }
      if (items.length) {
        try {
          window.__revdevPristineExamItems = items.map(function (q) {
            return {
              type: q.type,
              question: q.question,
              options: Array.isArray(q.options) ? q.options.slice() : q.options,
              answers: Array.isArray(q.answers) ? q.answers.slice() : q.answers,
              explanation: q.explanation
            };
          });
        } catch (e) {}
      }
    }).observe(statusEl, { childList: true, characterData: true, subtree: true });
  }

  console.info("RevDev: exam retake v3 (full taking-mode rebuild) armed");
})();
