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
      m = s.match(/^([a-d])\s*[)\.\:-]\s+\S/i);
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
        // Long text resolved to a letter via exact option match - trust index
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

  
  function buildOutcomesFromTimerState() {
    try {
      if (!window.__revdevExamTimer || typeof window.__revdevExamTimer.getState !== "function") {
        return null;
      }
      var st = window.__revdevExamTimer.getState();
      if (!st || st.mode !== "per") return null;
      var results = st.results || {};
      // Timer getState returns items as a NUMBER (count), not the array — never use it as list
      var items = getExamItems();
      var form = document.getElementById("exam-form");
      var n = 0;
      if (items && items.length) n = items.length;
      else if (form) n = form.querySelectorAll(".exam-question").length;
      else if (typeof st.items === "number") n = st.items;
      else n = Object.keys(results).length;
      if (!n) return null;
      var outcomes = [];
      for (var i = 0; i < n; i++) {
        var r = results[i] || results[String(i)] || {};
        var ans = r.answer != null ? String(r.answer) : "";
        // Also read from form if timer result empty
        if (!ans && form) {
          var checked = form.querySelector('input[name="question-' + i + '"]:checked');
          if (checked) ans = checked.value;
        }
        outcomes.push({
          question: (items && items[i]) || {},
          userAnswer: ans,
          index: i,
          timedOut: !!r.timedOut
        });
      }
      return outcomes;
    } catch (e) {
      console.warn("[RevDev] buildOutcomesFromTimerState", e);
      return null;
    }
  }

  function syncTimerAnswersIntoForm(outcomes) {
    var form = document.getElementById("exam-form");
    if (!form || !outcomes || !outcomes.length) return;
    // Enable all inputs so we can set checked
    form.querySelectorAll("input, textarea, select").forEach(function (el) {
      el.disabled = false;
    });
    outcomes.forEach(function (o) {
      var i = o.index;
      var ans = String(o.userAnswer || "").trim();
      if (!ans) return;
      var radios = form.querySelectorAll('input[name="question-' + i + '"]');
      var matched = false;
      radios.forEach(function (radio, ri) {
        var val = String(radio.value || "");
        var letter = String.fromCharCode(65 + ri);
        if (
          val === ans ||
          val.toUpperCase() === ans.toUpperCase() ||
          letter === ans.toUpperCase() ||
          ans.toUpperCase() === letter + "." ||
          (ans.length > 1 && val && (val === ans || ans.indexOf(val) >= 0 || val.indexOf(ans) >= 0))
        ) {
          radio.checked = true;
          matched = true;
        }
      });
      if (!matched) {
        var text = form.querySelector(
          'input[type="text"][name="question-' + i + '"], textarea[name="question-' + i + '"]'
        );
        if (text) text.value = ans;
      }
    });
  }

  function getExamItems() {
    var lists = [];
    if (window.__revdevFinalExamItems && window.__revdevFinalExamItems.length) {
      lists.push(window.__revdevFinalExamItems);
    }
    if (window.__revdevPristineExamItems && window.__revdevPristineExamItems.length) {
      lists.push(window.__revdevPristineExamItems);
    }
    if (window.__revdevJob && window.__revdevJob.collected && window.__revdevJob.collected.length) {
      lists.push(window.__revdevJob.collected);
    }
    if (window.__revdevLastResult && window.__revdevLastResult.items && window.__revdevLastResult.items.length) {
      lists.push(window.__revdevLastResult.items);
    }
    try {
      if (window.__revdevExamTimer && typeof window.__revdevExamTimer.getState === "function") {
        var st = window.__revdevExamTimer.getState();
        if (st && st.items && st.items.length) lists.push(st.items);
      }
    } catch (e) {}
    // Prefer the list whose length matches the form question count
    var form = document.getElementById("exam-form");
    var n = form ? form.querySelectorAll(".exam-question").length : 0;
    for (var i = 0; i < lists.length; i++) {
      if (n && lists[i].length === n) return lists[i];
    }
    return lists[0] || [];
  }

  function buildOutcomesFromForm() {
    var form = document.getElementById("exam-form");
    if (!form) return [];
    var items = getExamItems();
    var fieldsets = form.querySelectorAll(".exam-question");
    var outcomes = [];
    fieldsets.forEach(function (fs, index) {
      var question = items[index] || {};
      // Recover options from DOM if item is missing options
      if (!Array.isArray(question.options) || !question.options.length) {
        var domOpts = [];
        fs.querySelectorAll('input[type="radio"]').forEach(function (r) {
          domOpts.push(r.value);
        });
        if (domOpts.length) {
          question = Object.assign({}, question, { options: domOpts });
        }
      }
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
      // Per-question timer: prefer answers stored in timer state
      var fromTimer = buildOutcomesFromTimerState();
      if (fromTimer && fromTimer.length) {
        outcomes = fromTimer;
        syncTimerAnswersIntoForm(outcomes);
      } else {
        outcomes = buildOutcomesFromForm();
      }
    } else {
      syncTimerAnswersIntoForm(outcomes);
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
        // Per-question: answer may be letter/text in outcome without radio checked
        if (userIdx < 0 && answered) {
          var ua = String(userAnswer).trim().toUpperCase();
          radios.forEach(function (input, i) {
            var letter = String.fromCharCode(65 + i);
            var val = String(input.value || "").trim();
            if (
              ua === letter ||
              ua === val.toUpperCase() ||
              (val && ua.indexOf(val.toUpperCase()) === 0) ||
              (val && val.toUpperCase().indexOf(ua) === 0)
            ) {
              userIdx = i;
              input.checked = true;
            }
          });
          if (userIdx < 0 && /^[A-D]$/.test(ua)) {
            userIdx = ua.charCodeAt(0) - 65;
            if (userIdx >= 0 && userIdx < radios.length) {
              radios[userIdx].checked = true;
            } else {
              userIdx = -1;
            }
          }
        }
        answered = userIdx >= 0 || answered;

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

    // Update score display
    var scoreEl = document.getElementById("exam-score");
    var percentEl = document.getElementById("exam-percent");
    if (scoreEl) {
      scoreEl.textContent = scored + " / " + Math.max(scorable, outcomes.length);
    }
    if (percentEl) {
      if (scorable > 0) {
        percentEl.textContent = Math.round((scored / scorable) * 100) + "%";
      } else if (outcomes.length) {
        // Fallback grade: compare selected radio value to answers letter/text directly
        var fbScored = 0;
        var fbTotal = 0;
        outcomes.forEach(function (o) {
          var q = o.question || {};
          var ans = Array.isArray(q.answers) ? q.answers : [q.answers];
          var key = normalizeAnswerKey(q);
          var ua = String(o.userAnswer || "").trim();
          if (!ua) return;
          fbTotal++;
          if (key && (ua.toUpperCase() === key || ua.toUpperCase().indexOf(key) === 0)) {
            fbScored++;
          } else {
            var opts = Array.isArray(q.options) ? q.options : [];
            for (var ai = 0; ai < ans.length; ai++) {
              if (ans[ai] != null && String(ans[ai]).trim() && String(ans[ai]).trim() === ua) {
                fbScored++;
                break;
              }
            }
          }
        });
        if (fbTotal > 0) {
          scoreEl.textContent = fbScored + " / " + fbTotal;
          percentEl.textContent = Math.round((fbScored / fbTotal) * 100) + "%";
        } else {
          percentEl.textContent = "0%";
        }
      } else {
        percentEl.textContent = "0%";
      }
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


  function forceGradeFromDomAndTimer() {
    var form = document.getElementById("exam-form");
    if (!form) return;
    var items = typeof getExamItems === "function" ? getExamItems() : [];
    var fieldsets = form.querySelectorAll(".exam-question");
    if (!fieldsets.length) return;
    var results = {};
    try {
      if (window.__revdevExamTimer && window.__revdevExamTimer.getState) {
        var st = window.__revdevExamTimer.getState();
        if (st && st.results) results = st.results;
      }
    } catch (e) {}
    var scored = 0;
    var total = fieldsets.length;
    fieldsets.forEach(function (fs, index) {
      var q = items[index] || {};
      var radios = fs.querySelectorAll('input[type="radio"]');
      var userIdx = -1;
      radios.forEach(function (r, ri) { if (r.checked) userIdx = ri; });
      if (userIdx < 0) {
        var tr = results[index] || results[String(index)];
        if (tr && tr.answer != null && String(tr.answer).trim()) {
          var ua = String(tr.answer).trim().toUpperCase();
          radios.forEach(function (r, ri) {
            var letter = String.fromCharCode(65 + ri);
            if (ua === letter || ua === String(r.value).toUpperCase()) {
              userIdx = ri;
              r.checked = true;
            }
          });
          if (userIdx < 0 && /^[A-D]$/.test(ua)) {
            userIdx = ua.charCodeAt(0) - 65;
            if (userIdx >= 0 && userIdx < radios.length) radios[userIdx].checked = true;
          }
        }
      }
      var correctIdx = resolveCorrectOptionIndex(q);
      if (correctIdx < 0) {
        var key = normalizeAnswerKey(q);
        if (key && /^[A-D]$/.test(key)) correctIdx = key.charCodeAt(0) - 65;
      }
      fs.classList.remove("is-correct", "is-incorrect", "is-unanswered", "is-no-key");
      fs.querySelectorAll(".choice-option").forEach(function (opt) {
        opt.classList.remove("is-user-correct", "is-user-wrong", "is-correct-answer");
        var m = opt.querySelector(".result-mark");
        if (m) m.remove();
      });
      var hasKey = correctIdx >= 0 && correctIdx < radios.length;
      var correct = hasKey && userIdx === correctIdx;
      if (correct) scored++;
      if (!hasKey) fs.classList.add("is-no-key");
      else if (correct) fs.classList.add("is-correct");
      else fs.classList.add("is-incorrect");
      radios.forEach(function (input, i) {
        var lab = input.closest(".choice-option");
        if (!lab) return;
        if (hasKey && i === correctIdx) {
          lab.classList.add("is-correct-answer");
          if (i === userIdx) lab.classList.add("is-user-correct");
          var check = document.createElement("span");
          check.className = "result-mark result-mark-check";
          check.textContent = "\u2713";
          lab.appendChild(check);
        } else if (i === userIdx && hasKey) {
          lab.classList.add("is-user-wrong");
          var cross = document.createElement("span");
          cross.className = "result-mark result-mark-cross";
          cross.textContent = "\u2715";
          lab.appendChild(cross);
        }
        input.disabled = true;
      });
    });
    var scoreEl = document.getElementById("exam-score");
    var percentEl = document.getElementById("exam-percent");
    if (scoreEl) scoreEl.textContent = scored + " / " + total;
    if (percentEl) percentEl.textContent = total ? Math.round((scored / total) * 100) + "%" : "0%";
    window.__revdevExamSubmitted = true;
    console.info("[RevDev] forceGrade scored", scored, "/", total);
  }

  window.__revdevForceGradePerQuestion = forceGradeFromDomAndTimer;
  window.__revdevMarkExamForm = function (outcomes) {
    try { markForm(outcomes); } catch (e) {}
    setTimeout(function () {
      var se = document.getElementById("exam-score");
      if (se && /^0\s*\/\s*0$/.test((se.textContent || "").trim())) {
        try { forceGradeFromDomAndTimer(); } catch (e2) {}
      }
    }, 50);
  };
  window.__revdevMarkExamFormRaw = markForm;
  if (typeof window.__revdevAssertReviewValid !== "function" && typeof assertReviewValid === "function") {
    window.__revdevAssertReviewValid = assertReviewValid;
  }

  console.info("RevDev: review-fix armed (strict single-green + counts + reclaim)");
})();
