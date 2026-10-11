/* ============================================================
   Review fix: strict answer-key normalization + single green
   option + correct time chips. Does not touch generation.
   ============================================================ */
(function installReviewFix() {
  "use strict";

  /**
   * Normalize an answer key to exactly one letter A-D (MC),
   * or "true"/"false" for True/False, or null if invalid.
   * Accepts: "A", "a", " A ", "A.", "(A)", "Option A", "Answer: A",
   * 0/1-based index when unambiguous, or the full text of exactly one option.
   */
  function normalizeAnswerKey(item) {
    if (!item) return null;
    var raw = item.answers;
    var opts = Array.isArray(item.options) ? item.options : [];
    var type = String(item.type || "").toLowerCase().replace(/\s+/g, "_");

    var candidates = [];
    if (raw == null) {
      candidates = [];
    } else if (Array.isArray(raw)) {
      raw.forEach(function (x) {
        if (x == null) return;
        if (Array.isArray(x)) {
          x.forEach(function (y) { if (y != null) candidates.push(String(y)); });
        } else {
          candidates.push(String(x));
        }
      });
    } else {
      candidates.push(String(raw));
    }

    var joined = candidates.join(" ").trim();
    if (!joined) return null;
    if (/\ball\b/i.test(joined) && /[a-d]/i.test(joined) && candidates.length > 1) return null;
    if (/[a-d]\s*[,&/]\s*[a-d]/i.test(joined)) return null;

    function tryOne(s) {
      s = String(s || "").trim();
      if (!s) return null;

      var m = s.match(/^(?:option\s*|answer\s*:?\s*|\()?([a-d])\)?\.?$/i);
      if (m) return m[1].toUpperCase();

      // "B - text..." or "B) text" or "B. text"
      m = s.match(/^([a-d])\s*[\)\.\-:–—]\s+\S/i);
      if (m) return m[1].toUpperCase();

      if (/^\d+$/.test(s)) {
        var n = parseInt(s, 10);
        if (opts.length) {
          if (n >= 0 && n < opts.length) return String.fromCharCode(65 + n);
          if (n >= 1 && n <= opts.length) return String.fromCharCode(64 + n);
        }
        return null;
      }

      var low = s.toLowerCase().replace(/\s+/g, " ").trim();
      if (type === "true_false" || opts.length === 2) {
        if (low === "true" || low === "t" || low === "yes") return "TRUE";
        if (low === "false" || low === "f" || low === "no") return "FALSE";
      }

      // Exact option text match
      if (opts.length) {
        var hits = [];
        for (var i = 0; i < opts.length; i++) {
          var o = String(opts[i] || "").toLowerCase().replace(/\s+/g, " ").trim();
          if (o && o === low) hits.push(i);
        }
        if (hits.length === 1) return String.fromCharCode(65 + hits[0]);

        // Unique containment match (answer is substring of option or vice versa)
        hits = [];
        for (var j = 0; j < opts.length; j++) {
          var oj = String(opts[j] || "").toLowerCase().replace(/\s+/g, " ").trim();
          if (!oj) continue;
          if (oj.indexOf(low) !== -1 || low.indexOf(oj) !== -1) hits.push(j);
        }
        if (hits.length === 1) return String.fromCharCode(65 + hits[0]);
      }
      return null;
    }

    var resolved = [];
    for (var c = 0; c < candidates.length; c++) {
      var letter = tryOne(candidates[c]);
      if (letter) resolved.push(letter);
    }
    var uniq = [];
    resolved.forEach(function (L) {
      if (uniq.indexOf(L) === -1) uniq.push(L);
    });
    if (uniq.length === 1) return uniq[0];
    if (candidates.length === 1) return tryOne(candidates[0]);
    return null;
  }

  /** If key is missing, try to recover from explanation text matching one option. */
  function significantWords(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(function (w) {
        return w.length > 4 &&
          !/^(which|where|their|there|these|those|about|would|could|should|being|after|before|under|over|while|during|system|systems|ability|between)$/.test(w);
      });
  }

  function scoreOverlap(a, b) {
    var wa = significantWords(a);
    var wb = significantWords(b);
    if (!wa.length || !wb.length) return 0;
    var setB = Object.create(null);
    wb.forEach(function (w) { setB[w] = 1; });
    var hit = 0;
    wa.forEach(function (w) { if (setB[w]) hit++; });
    return hit / Math.max(wa.length, 1);
  }

  function repairKeyFromExplanation(item) {
    if (!item || !Array.isArray(item.options) || item.options.length < 2) return null;
    var expl = String(item.explanation || "");
    if (expl.trim().length < 8) return null;

    // 1) Option probe substring in explanation
    var hits = [];
    for (var i = 0; i < item.options.length; i++) {
      var o = String(item.options[i] || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (o.length < 12) continue;
      var probe = o.slice(0, Math.min(56, o.length));
      if (probe.length >= 12 && expl.toLowerCase().indexOf(probe) !== -1) hits.push(i);
    }
    if (hits.length === 1) return String.fromCharCode(65 + hits[0]);

    // 2) Best word-overlap score with a clear margin
    var scores = [];
    for (var j = 0; j < item.options.length; j++) {
      scores.push({ i: j, s: scoreOverlap(item.options[j], expl) });
    }
    scores.sort(function (a, b) { return b.s - a.s; });
    if (scores.length >= 1 && scores[0].s >= 0.22) {
      if (scores.length === 1 || scores[0].s >= scores[1].s + 0.05) {
        return String.fromCharCode(65 + scores[0].i);
      }
    }
    return null;
  }

  /** Match answer strings to options using exact, contains, or overlap. */
  function matchAnswersToOptionIndex(item) {
    if (!item || !Array.isArray(item.options) || !item.options.length) return -1;
    var raw = item.answers;
    var candidates = [];
    if (raw == null) return -1;
    if (Array.isArray(raw)) {
      raw.forEach(function (x) {
        if (x == null) return;
        if (Array.isArray(x)) x.forEach(function (y) { if (y != null) candidates.push(String(y)); });
        else candidates.push(String(x));
      });
    } else {
      candidates.push(String(raw));
    }
    var opts = item.options;
    // exact / contains
    for (var c = 0; c < candidates.length; c++) {
      var ans = candidates[c].trim().toLowerCase().replace(/\s+/g, " ");
      if (!ans || ans.length < 2) continue;
      var hits = [];
      for (var i = 0; i < opts.length; i++) {
        var o = String(opts[i] || "").trim().toLowerCase().replace(/\s+/g, " ");
        if (!o) continue;
        if (o === ans || o.indexOf(ans) !== -1 || ans.indexOf(o) !== -1) hits.push(i);
      }
      if (hits.length === 1) return hits[0];
    }
    // overlap score against answer strings joined
    var joined = candidates.join(" ");
    if (joined.trim().length < 8) return -1;
    var scores = [];
    for (var j = 0; j < opts.length; j++) {
      scores.push({ i: j, s: scoreOverlap(opts[j], joined) });
    }
    scores.sort(function (a, b) { return b.s - a.s; });
    if (scores[0] && scores[0].s >= 0.35) {
      if (scores.length === 1 || scores[0].s >= (scores[1] ? scores[1].s : 0) + 0.1) {
        return scores[0].i;
      }
    }
    return -1;
  }

  window.__revdevNormalizeAnswerKey = normalizeAnswerKey;

  function letterToIndex(letter) {
    if (letter === "TRUE" || letter === "FALSE") return letter;
    if (!letter || letter.length !== 1) return -1;
    var code = letter.toUpperCase().charCodeAt(0);
    if (code < 65 || code > 68) return -1;
    return code - 65;
  }

  function resolveCorrectOptionIndex(item) {
    if (!item || !Array.isArray(item.options) || !item.options.length) return -1;
    var opts = item.options;

    // 1) Strict letter / exact normalize
    var key = normalizeAnswerKey(item);
    var raw0 = Array.isArray(item.answers) ? String((item.answers[0] != null ? item.answers[0] : "")) : String(item.answers || "");
    var letterOnly = /^[a-d]$/i.test(raw0.trim()) || /^(option\s*)?[a-d]\.?$/i.test(raw0.trim());

    if (key != null) {
      if (key === "TRUE" || key === "FALSE") {
        for (var i = 0; i < opts.length; i++) {
          var o = String(opts[i] || "").trim().toLowerCase();
          if (key === "TRUE" && (o === "true" || o === "t" || o === "yes")) return i;
          if (key === "FALSE" && (o === "false" || o === "f" || o === "no")) return i;
        }
      } else if (!letterOnly) {
        // Long text resolved to a letter via exact option match — trust index
        var idx = letterToIndex(key);
        if (idx >= 0 && idx < opts.length) return idx;
      }
      // letter-only: do NOT trust index yet (options may have been shuffled); try text/explanation first
    }

    // 2) Text / contains / overlap match of answers → option
    var byText = matchAnswersToOptionIndex(item);
    if (byText >= 0) {
      item.answers = [String(opts[byText])];
      return byText;
    }

    // 3) Explanation repair (preferred over raw letter after possible shuffle)
    var fromExpl = repairKeyFromExplanation(item);
    if (fromExpl != null) {
      var ri = fromExpl.charCodeAt(0) - 65;
      if (ri >= 0 && ri < opts.length) {
        item.answers = [String(opts[ri])];
        return ri;
      }
    }

    // 4) Letter index last resort
    if (key != null && key !== "TRUE" && key !== "FALSE") {
      var idx2 = letterToIndex(key);
      if (idx2 >= 0 && idx2 < opts.length) {
        item.answers = [String(opts[idx2])];
        return idx2;
      }
    }

    if (typeof console !== "undefined" && console.warn) {
      console.warn("[RevDev] answer key unavailable", {
        answers: item.answers,
        options: (item.options || []).map(function (x) { return String(x).slice(0, 60); }),
        explanation: String(item.explanation || "").slice(0, 100)
      });
    }
    return -1;
  }

  function stripExplanationPrefix(text) {
    return String(text || "").replace(/^\s*explanation\s*:\s*/i, "").trim();
  }

  function buildOutcomesFromForm() {
    var form = document.getElementById("exam-form");
    if (!form) return [];
    var items =
      (window.__revdevFinalExamItems && window.__revdevFinalExamItems.length && window.__revdevFinalExamItems) ||
      (window.__revdevPristineExamItems && window.__revdevPristineExamItems.length && window.__revdevPristineExamItems) ||
      (window.__revdevJob && window.__revdevJob.collected) ||
      (window.__revdevLastResult && window.__revdevLastResult.items) ||
      [];
    var fieldsets = form.querySelectorAll(".exam-question");
    var outcomes = [];
    fieldsets.forEach(function (fs, index) {
      var question = items[index] || {};
      var name = "question-" + index;
      var userAnswer = "";
      var checked = form.querySelector('input[name="' + name + '"]:checked');
      if (checked) userAnswer = checked.value;
      else {
        var text = form.querySelector('input[type="text"][name="' + name + '"], textarea[name="' + name + '"]');
        if (text) userAnswer = text.value || "";
      }
      outcomes.push({
        question: question,
        userAnswer: userAnswer,
        index: index
      });
    });
    return outcomes;
  }

  function markForm(outcomes) {
    var form = document.getElementById("exam-form");
    if (!form) return;
    if (!outcomes || !outcomes.length) {
      outcomes = buildOutcomesFromForm();
    }
    if (!outcomes || !outcomes.length) {
      console.warn("[RevDev] markForm: no outcomes and no form questions");
      return;
    }
    window.__revdevExamSubmitted = true;
    window.__revdevExamResults = outcomes;

    var scored = 0;
    var scorable = 0;

    outcomes.forEach(function (outcome, index) {
      var fieldset =
        form.querySelector('.exam-question[data-index="' + index + '"]') ||
        form.querySelectorAll(".exam-question")[index];
      if (!fieldset) return;

      var question = outcome.question || {};
      var type = String(question.type || "").toLowerCase().replace(/\s+/g, "_");
      var isChoice = type === "multiple_choice" || type === "true_false" ||
        fieldset.querySelectorAll('input[type="radio"]').length > 0;

      var userAnswer = outcome.userAnswer != null ? String(outcome.userAnswer) : "";
      var answered = String(userAnswer).trim() !== "";

      // Clear previous marks
      fieldset.classList.remove("is-correct", "is-incorrect", "is-unanswered", "is-no-key");
      fieldset.querySelectorAll("input, textarea, select").forEach(function (el) {
        el.disabled = true;
      });
      fieldset.querySelectorAll(".choice-option").forEach(function (opt) {
        opt.classList.remove(
          "is-user-correct", "is-user-wrong", "is-correct-answer",
          "is-right-answer", "selected"
        );
        var mark = opt.querySelector(".result-mark");
        if (mark) mark.remove();
      });

      var name = "question-" + index;
      var radios = fieldset.querySelectorAll('input[name="' + name + '"]');
      var textInput = fieldset.querySelector('input[type="text"][name="' + name + '"]');

      var correctIdx = -1;
      var hasKey = false;

      if (isChoice && radios.length) {
        correctIdx = resolveCorrectOptionIndex(question);
        hasKey = correctIdx >= 0;

        // Safety: count how many would be green; if not exactly 1, mark none
        if (hasKey) {
          var greenCount = 0;
          radios.forEach(function (input, i) {
            if (i === correctIdx) greenCount++;
          });
          if (greenCount !== 1) {
            hasKey = false;
            correctIdx = -1;
            console.error(
              "[RevDev] Answer key invalid for question",
              index,
              "raw answers:",
              question.answers,
              "options:",
              question.options
            );
          }
        } else if ((question.answers || []).length) {
          console.error(
            "[RevDev] Could not normalize answer key for question",
            index,
            "raw:",
            question.answers,
            "options:",
            question.options
          );
        }

        if (hasKey) scorable++;

        var userIdx = -1;
        radios.forEach(function (input, i) {
          if (input.checked) userIdx = i;
        });

        var correct = hasKey && answered && userIdx === correctIdx;
        if (correct) scored++;

        if (!hasKey) fieldset.classList.add("is-no-key");
        else if (correct) fieldset.classList.add("is-correct");
        else {
          fieldset.classList.add("is-incorrect");
          if (!answered) fieldset.classList.add("is-unanswered");
        }

        radios.forEach(function (input, i) {
          var lab = input.closest(".choice-option");
          if (!lab) return;
          var isAccepted = hasKey && i === correctIdx;
          var isSelected = !!input.checked;

          if (isAccepted) {
            lab.classList.add("is-correct-answer");
            if (isSelected && correct) lab.classList.add("is-user-correct");
            var check = document.createElement("span");
            check.className = "result-mark result-mark-check";
            check.setAttribute("aria-hidden", "true");
            check.textContent = "\u2713";
            lab.appendChild(check);
          } else if (isSelected && hasKey && !correct) {
            // Only mark wrong when we have a valid key
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
        // Identification / short answer: keep prior text-matching behavior (strict)
        var answers = (question.answers || []).map(function (a) {
          return String(a || "").trim().toLowerCase();
        }).filter(Boolean);
        hasKey = answers.length > 0;
        var norm = String(userAnswer).trim().toLowerCase();
        var correct = hasKey && answered && answers.some(function (a) {
          return a === norm || (a.length >= 4 && (norm.indexOf(a) !== -1 || a.indexOf(norm) !== -1));
        });
        if (hasKey) scorable++;
        if (correct) scored++;

        if (!hasKey) fieldset.classList.add("is-no-key");
        else if (correct) fieldset.classList.add("is-correct");
        else {
          fieldset.classList.add("is-incorrect");
          if (!answered) fieldset.classList.add("is-unanswered");
        }

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
          caBody.textContent = " " + (question.answers || []).join("; ");
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
      } else {
        // no inputs
        if (!answered) fieldset.classList.add("is-unanswered", "is-incorrect");
      }

      // Badge
      var badge = fieldset.querySelector(".review-status");
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "review-status";
        var legend = fieldset.querySelector("legend");
        if (legend) legend.after(badge);
        else fieldset.insertBefore(badge, fieldset.firstChild);
      }
      if (isChoice && radios.length && !hasKey) {
        badge.className = "review-status is-no-key";
        badge.innerHTML =
          '<span class="review-status-icon" aria-hidden="true">\u2013</span> Answer key unavailable';
      } else if (fieldset.classList.contains("is-correct")) {
        badge.className = "review-status is-correct";
        badge.innerHTML =
          '<span class="review-status-icon" aria-hidden="true">\u2713</span> Correct';
      } else if (!answered) {
        badge.className = "review-status is-unanswered";
        badge.innerHTML =
          '<span class="review-status-icon" aria-hidden="true">\u25CB</span> Not answered';
      } else {
        badge.className = "review-status is-incorrect";
        badge.innerHTML =
          '<span class="review-status-icon" aria-hidden="true">\u2715</span> Incorrect';
      }

      // Explanation
      var box = fieldset.querySelector(".exam-inline-result, .exam-explanation");
      var expl = stripExplanationPrefix(question.explanation ? String(question.explanation) : "");
      if (!expl) {
        if (box) box.remove();
      } else {
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
      }
    });

    // Update score display to only count scorable questions
    var scoreEl = document.getElementById("exam-score");
    var percentEl = document.getElementById("exam-percent");
    if (scoreEl && scorable > 0) {
      scoreEl.textContent = scored + " / " + scorable;
    }
    if (percentEl && scorable > 0) {
      percentEl.textContent = Math.round((scored / scorable) * 100) + "%";
    } else if (percentEl && scorable === 0) {
      percentEl.textContent = "—";
    }

    setTimeout(assertReviewValid, 0);
  }

  function assertReviewValid() {
    var form = document.getElementById("exam-form");
    if (!form) return;
    var questions = form.querySelectorAll(".exam-question");
    var greenTotal = 0;
    var problems = 0;
    questions.forEach(function (fs, i) {
      var greens = fs.querySelectorAll(
        ".choice-option.is-correct-answer, .choice-option.is-right-answer"
      );
      if (greens.length > 1) {
        problems++;
        console.error(
          "[RevDev assertReviewValid] Q" + (i + 1) + " has " + greens.length + " green options"
        );
        // Safety: strip extras
        greens.forEach(function (g) {
          g.classList.remove("is-correct-answer", "is-right-answer", "is-user-correct");
          var m = g.querySelector(".result-mark-check");
          if (m) m.remove();
        });
      }
      greenTotal += greens.length;
    });
    if (problems === 0) {
      // quiet success
    }
  }

  window.__revdevMarkExamForm = markForm;
  window.__revdevAssertReviewValid = assertReviewValid;

  // Re-install if something else overwrites
  [0, 300, 1000, 2500].forEach(function (ms) {
    setTimeout(function () {
      window.__revdevMarkExamForm = markForm;
    }, ms);
  });

  /* ---------- Time chip fix (patch timer decorateReviewInner) ---------- */
  function fixTimeChips() {
    var form = document.getElementById("exam-form");
    if (!form) return;
    // Only touch chips that already exist or will be created
    // We intercept by wrapping a periodic cleaner and by patching if available
  }

  // Override any existing decorateReviewInner by observing chips and correcting text
  function correctChipText(chip, fieldset) {
    if (!chip || !fieldset) return;
    var answered = false;
    var radios = fieldset.querySelectorAll('input[type="radio"]');
    radios.forEach(function (r) {
      if (r.checked) answered = true;
    });
    var text = fieldset.querySelector('input[type="text"]');
    if (text && String(text.value || "").trim()) answered = true;
    // Also check selected class
    if (fieldset.querySelector(".choice-option.selected, .choice-option.is-user-correct, .choice-option.is-user-wrong")) {
      answered = true;
    }
    var isUnansweredBadge = fieldset.classList.contains("is-unanswered") ||
      (fieldset.querySelector(".review-status.is-unanswered") != null);
    if (isUnansweredBadge) answered = false;

    var txt = (chip.textContent || "").trim();
    var isTimeout = /time'?s up/i.test(txt) || chip.classList.contains("is-timeout");
    var secsMatch = txt.match(/(\d+)\s*s/);
    var secs = secsMatch ? secsMatch[1] : "0";

    if (!answered) {
      if (isTimeout) {
        chip.textContent = "Time's up";
        chip.classList.add("is-timeout");
      } else {
        chip.textContent = "Skipped after " + secs + "s";
        chip.classList.remove("is-timeout");
      }
    } else {
      // keep "Answered in Xs" unless it was timeout
      if (isTimeout) {
        chip.textContent = "Time's up";
      } else if (!/^Answered in/i.test(txt)) {
        chip.textContent = "Answered in " + secs + "s";
      }
    }
  }

  // Mutation observer: fix chips as they appear; remove chips in total mode
  function installChipGuard() {
    function getTimerMode() {
      try {
        var m = localStorage.getItem("revdev_exam_timer_mode");
        if (m === "off" || m === "total" || m === "per") return m;
      } catch (e) {}
      // fallback from UI
      var sel = document.querySelector('input[name="exam-timer-mode"]:checked, #exam-timer-mode');
      if (sel) return sel.value || sel.getAttribute("data-mode") || "total";
      return "total";
    }

    function scrub() {
      var form = document.getElementById("exam-form");
      if (!form) return;
      var mode = getTimerMode();
      form.querySelectorAll(".exam-time-chip").forEach(function (chip) {
        if (mode === "off" || mode === "total") {
          chip.remove();
          return;
        }
        var fs = chip.closest(".exam-question");
        correctChipText(chip, fs);
      });
    }

    var obs = new MutationObserver(function () {
      scrub();
    });
    var target = document.getElementById("exam-output") || document.body;
    obs.observe(target, { childList: true, subtree: true, characterData: true });
    // also run after submit
    document.addEventListener(
      "click",
      function (ev) {
        var t = ev.target;
        if (!t) return;
        if (t.id === "submit-exam" || (t.closest && t.closest("#submit-exam"))) {
          setTimeout(scrub, 200);
          setTimeout(scrub, 600);
          setTimeout(scrub, 1200);
        }
      },
      true
    );
  }

  installChipGuard();

  // Also patch normalize used during generation validation if present
  // (reject MC items whose key normalizes to null via existing filter path)
  function hardenShuffleAnswers() {
    // After hard-quality shuffle, convert letter answers to option text
    // so grading by text still works with original dual app scorer
    var items =
      (window.__revdevJob && window.__revdevJob.collected) ||
      (window.__revdevLastResult && window.__revdevLastResult.items) ||
      window.__revdevPristineExamItems;
    if (!Array.isArray(items)) return;
    items.forEach(function (q) {
      var type = String(q.type || "").toLowerCase().replace(/\s+/g, "_");
      if (type !== "multiple_choice" && type !== "true_false") return;
      if (!Array.isArray(q.options) || !q.options.length) return;
      var key = normalizeAnswerKey(q);
      if (key == null) return;
      var idx = resolveCorrectOptionIndex(q);
      if (idx >= 0 && idx < q.options.length) {
        // Store as option text so any legacy matcher works
        q.answers = [String(q.options[idx])];
      }
    });
  }

  var statusEl = document.getElementById("generation-status");
  if (statusEl) {
    new MutationObserver(function () {
      var text = statusEl.textContent || "";
      if (!/Done\.|Generated \d+/i.test(text)) return;
      setTimeout(hardenShuffleAnswers, 250);
    }).observe(statusEl, { childList: true, characterData: true, subtree: true });
  }



  /* ---------- Single source of truth for exam item count ---------- */
  function getCanonicalItems() {
    var form = document.getElementById("exam-form");
    var rendered = form ? form.querySelectorAll(".exam-question").length : 0;
    var candidates = [];
    if (Array.isArray(window.__revdevFinalExamItems) && window.__revdevFinalExamItems.length) {
      candidates.push(window.__revdevFinalExamItems);
    }
    if (Array.isArray(window.__revdevPristineExamItems) && window.__revdevPristineExamItems.length) {
      candidates.push(window.__revdevPristineExamItems);
    }
    var job = window.__revdevJob;
    if (job && Array.isArray(job.collected) && job.collected.length) {
      candidates.push(job.collected);
    }
    var last = window.__revdevLastResult;
    if (last && Array.isArray(last.items) && last.items.length) {
      candidates.push(last.items);
    }
    // Prefer candidate whose length matches the rendered form
    if (rendered > 0) {
      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i].length === rendered) return candidates[i];
      }
    }
    // Prefer longest non-empty
    var best = [];
    candidates.forEach(function (c) {
      if (c.length > best.length) best = c;
    });
    return best;
  }

  function publishFinalItems(items) {
    if (!Array.isArray(items)) return;
    window.__revdevFinalExamItems = items.map(function (q) {
      return {
        type: q.type,
        question: q.question,
        options: Array.isArray(q.options) ? q.options.slice() : q.options,
        answers: Array.isArray(q.answers) ? q.answers.slice() : q.answers,
        explanation: q.explanation,
        front: q.front,
        back: q.back,
        topic: q.topic
      };
    });
    // Keep job/pristine in sync so nothing reads a stale shorter list
    if (window.__revdevJob) window.__revdevJob.collected = window.__revdevFinalExamItems;
    window.__revdevPristineExamItems = window.__revdevFinalExamItems;
    if (window.__revdevLastResult) window.__revdevLastResult.items = window.__revdevFinalExamItems;
  }

  function assertCountsMatch() {
    var form = document.getElementById("exam-form");
    var rendered = form ? form.querySelectorAll(".exam-question").length : 0;
    var header = document.getElementById("exam-count");
    var headerN = header ? parseInt(String(header.textContent || "").replace(/\D/g, ""), 10) || 0 : 0;
    var statusEl = document.getElementById("generation-status");
    var statusText = statusEl ? String(statusEl.textContent || "") : "";
    var statusM = statusText.match(/Generated\s+(\d+)/i);
    var statusN = statusM ? parseInt(statusM[1], 10) : -1;
    var startEl = document.getElementById("exam-timer-start");
    var startN = -1;
    if (startEl) {
      var strong = startEl.querySelector(".start-meta strong");
      if (strong) startN = parseInt(strong.textContent, 10) || -1;
    }
    var finalN = Array.isArray(window.__revdevFinalExamItems)
      ? window.__revdevFinalExamItems.length
      : -1;
    var nums = { rendered: rendered, header: headerN, status: statusN, start: startN, final: finalN };
    var vals = [rendered, headerN, finalN].filter(function (n) { return n > 0; });
    var mismatch = false;
    if (vals.length >= 2) {
      var first = vals[0];
      vals.forEach(function (v) { if (v !== first) mismatch = true; });
    }
    if (startN > 0 && rendered > 0 && startN !== rendered) mismatch = true;
    if (mismatch) {
      console.error("[RevDev assertCountsMatch] count mismatch", nums);
    }
    return !mismatch;
  }

  window.__revdevGetCanonicalItems = getCanonicalItems;
  window.__revdevPublishFinalItems = publishFinalItems;
  window.__revdevAssertCountsMatch = assertCountsMatch;

  // After generation finishes, publish the rendered form's backing items as final
  function syncFinalFromForm() {
    var form = document.getElementById("exam-form");
    if (!form) return;
    var rendered = form.querySelectorAll(".exam-question").length;
    if (!rendered) return;
    var items = getCanonicalItems();
    if (items.length !== rendered) {
      // Prefer job.collected if it matches form
      var job = window.__revdevJob;
      if (job && Array.isArray(job.collected) && job.collected.length === rendered) {
        items = job.collected;
      } else if (
        Array.isArray(window.__revdevPristineExamItems) &&
        window.__revdevPristineExamItems.length === rendered
      ) {
        items = window.__revdevPristineExamItems;
      }
    }
    if (items.length === rendered && rendered > 0) {
      publishFinalItems(items);
    }
    var countEl = document.getElementById("exam-count");
    if (countEl && rendered > 0) countEl.textContent = rendered + " questions";
    assertCountsMatch();
  }

  // Continuously reclaim markForm so dual payload cannot overwrite it
  function reclaimMarkForm() {
    window.__revdevMarkExamForm = markForm;
  }
  reclaimMarkForm();
  /* no setInterval — was freezing the page */

  var statusEl2 = document.getElementById("generation-status");
  if (statusEl2) {
    new MutationObserver(function () {
      var text = statusEl2.textContent || "";
      if (!/Done\.|Generated \d+/i.test(text)) return;
      reclaimMarkForm();
      setTimeout(function () {
        reclaimMarkForm();
        hardenShuffleAnswers();
        syncFinalFromForm();
      }, 300);
      setTimeout(function () {
        reclaimMarkForm();
        syncFinalFromForm();
      }, 800);
    }).observe(statusEl2, { childList: true, characterData: true, subtree: true });
  }

  // When exam form is rebuilt, publish final items
  var formEl = document.getElementById("exam-form");
  if (formEl) {
    new MutationObserver(function () {
      if (formEl.querySelectorAll(".exam-question").length > 0) {
        setTimeout(syncFinalFromForm, 50);
      }
    }).observe(formEl, { childList: true });
  }

  console.info("RevDev: review-fix armed (strict single-green + counts + reclaim)");
})();
