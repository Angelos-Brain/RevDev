/* ============================================================
   Exam integrity: single committed item array, one shuffle,
   DOM↔item sync by question text, audit helper.
   Load LAST so it owns commit + pre-grade sync.
   ============================================================ */
(function installExamIntegrity() {
  "use strict";

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Shuffle options once; keep answers[0] as exact option text. */
  function shuffleOnce(q) {
    if (!q || !Array.isArray(q.options) || q.options.length < 2) return;
    var type = String(q.type || "").toLowerCase().replace(/\s+/g, "_");
    if (type !== "multiple_choice" && type !== "true_false") return;

    var ans = Array.isArray(q.answers)
      ? String(q.answers[0] != null ? q.answers[0] : "")
      : String(q.answers || "");
    var ansN = norm(ans);

    // Lock answer to exact option text before shuffle
    if (ansN) {
      for (var i = 0; i < q.options.length; i++) {
        if (norm(q.options[i]) === ansN) {
          q.answers = [String(q.options[i])];
          ans = String(q.options[i]);
          ansN = norm(ans);
          break;
        }
      }
    }

    var opts = q.options.slice();
    for (var a = opts.length - 1; a > 0; a--) {
      var b = Math.floor(Math.random() * (a + 1));
      var tmp = opts[a];
      opts[a] = opts[b];
      opts[b] = tmp;
    }
    q.options = opts;

    // Re-lock after shuffle
    if (ansN) {
      for (var j = 0; j < q.options.length; j++) {
        if (norm(q.options[j]) === ansN) {
          q.answers = [String(q.options[j])];
          break;
        }
      }
    }
  }

  /**
   * commitExam(items):
   *  (a) shuffle options exactly once, keep exact answer text
   *  (b) assign SAME array object to all global lists (no copies)
   *  (c) call __revdevRenderExamClean exactly once
   */
  function commitExam(items) {
    if (!Array.isArray(items) || !items.length) return items;

    items.forEach(shuffleOnce);

    // SAME array object — no slice(), no map copies
    window.__revdevFinalExamItems = items;
    window.__revdevPristineExamItems = items;
    window.__revdevTimerExamItems = items;
    if (window.__revdevJob) window.__revdevJob.collected = items;
    if (window.__revdevLastResult) window.__revdevLastResult.items = items;
    else window.__revdevLastResult = { items: items };

    window.__revdevExamReady = true;

    var countEl = document.getElementById("exam-count");
    if (countEl) countEl.textContent = items.length + " questions";

    if (typeof window.__revdevRenderExamClean === "function") {
      try {
        window.__revdevRenderExamClean(items);
      } catch (e) {
        console.warn("[RevDev] commitExam render", e);
      }
    }

    console.info("[RevDev] commitExam:", items.length, "items (shared array)");
    return items;
  }

  window.__revdevCommitExam = commitExam;

  /** Clear stale timer snapshot so a later exam with the same count cannot reuse old items. */
  function clearTimerSnapshot() {
    window.__revdevTimerExamItems = null;
  }
  window.__revdevClearTimerSnapshot = clearTimerSnapshot;

  /**
   * syncFromDom(): match each fieldset to an item by exact normalized question text.
   * Set that item's options to DOM radio values in DOM order. Never match by index.
   */
  function syncFromDom() {
    var form = document.getElementById("exam-form");
    if (!form) return;

    var items =
      (Array.isArray(window.__revdevFinalExamItems) && window.__revdevFinalExamItems) ||
      (Array.isArray(window.__revdevPristineExamItems) && window.__revdevPristineExamItems) ||
      (window.__revdevJob && Array.isArray(window.__revdevJob.collected) && window.__revdevJob.collected) ||
      [];

    if (!items.length) {
      console.warn("[RevDev] syncFromDom: no committed items");
      return;
    }

    var fieldsets = form.querySelectorAll(".exam-question");
    fieldsets.forEach(function (fs) {
      var qEl = fs.querySelector(".question-text");
      var qText = qEl ? norm(qEl.textContent) : "";
      if (!qText) {
        console.error("[RevDev] syncFromDom: fieldset missing .question-text");
        fs.classList.add("is-no-key");
        return;
      }

      var matched = null;
      for (var i = 0; i < items.length; i++) {
        if (norm(items[i].question) === qText) {
          matched = items[i];
          break;
        }
      }

      if (!matched) {
        console.error(
          "[RevDev] syncFromDom: no item matches question",
          qText.slice(0, 80)
        );
        fs.classList.add("is-no-key");
        return;
      }

      var radios = fs.querySelectorAll('input[type="radio"]');
      if (radios.length) {
        var domOpts = [];
        radios.forEach(function (r) {
          domOpts.push(String(r.value || ""));
        });
        matched.options = domOpts;

        // Keep answers[0] as exact option text if it still matches one option
        var ans = Array.isArray(matched.answers)
          ? String(matched.answers[0] != null ? matched.answers[0] : "")
          : String(matched.answers || "");
        var ansN = norm(ans);
        var found = false;
        for (var k = 0; k < domOpts.length; k++) {
          if (norm(domOpts[k]) === ansN) {
            matched.answers = [domOpts[k]];
            found = true;
            break;
          }
        }
        if (!found && ansN) {
          console.warn(
            "[RevDev] syncFromDom: answer text no longer in DOM options",
            ans.slice(0, 60)
          );
        }
      }
    });
  }

  window.__revdevSyncFromDom = syncFromDom;

  /** Pre-grade: sync DOM order into items, then let grading proceed. */
  function beforeGrade() {
    syncFromDom();
  }

  document.addEventListener(
    "click",
    function (e) {
      var t = e.target;
      if (!t) return;
      var btn = t.id ? t : t.closest && t.closest("button");
      var id = btn && btn.id;
      if (
        id === "submit-exam" ||
        id === "exam-timer-next" ||
        id === "retake-exam"
      ) {
        if (id === "retake-exam") {
          clearTimerSnapshot();
        } else {
          beforeGrade();
        }
      }
    },
    true
  );

  // Clear snapshot when generation starts
  var genBtn = document.getElementById("generate-button");
  if (genBtn) {
    genBtn.addEventListener(
      "click",
      function () {
        clearTimerSnapshot();
      },
      true
    );
  }

  // Clear when status shows generation beginning
  var statusEl = document.getElementById("generation-status");
  if (statusEl) {
    new MutationObserver(function () {
      var t = statusEl.textContent || "";
      if (/generat|batch|chunk|start/i.test(t) && !/Done\./i.test(t)) {
        clearTimerSnapshot();
      }
    }).observe(statusEl, { childList: true, characterData: true, subtree: true });
  }

  // Wrap render so snapshot is cleared then re-set by commitExam
  function wrapRender() {
    if (typeof window.__revdevRenderExamClean !== "function") return false;
    if (window.__revdevRenderExamClean.__integrityWrapped) return true;
    var orig = window.__revdevRenderExamClean;
    window.__revdevRenderExamClean = function (items) {
      clearTimerSnapshot();
      var result = orig.apply(this, arguments);
      return result;
    };
    window.__revdevRenderExamClean.__integrityWrapped = true;
    return true;
  }
  var rw = 0;
  (function waitRender() {
    if (wrapRender()) return;
    rw++;
    if (rw < 60) setTimeout(waitRender, 250);
  })();

  /**
   * Audit: DOM text == item.question; DOM options == item.options in order;
   * answers[0] matches exactly one option; explanation starts with "Correct: " + that text.
   */
  window.__revdevAuditExam = function () {
    var form = document.getElementById("exam-form");
    var items =
      (Array.isArray(window.__revdevFinalExamItems) && window.__revdevFinalExamItems) ||
      [];
    var rows = [];
    var issues = 0;

    console.group("[RevDev] Exam integrity audit (" + items.length + " items)");

    if (!form) {
      console.warn("No exam-form in DOM");
      console.groupEnd();
      return { total: items.length, issues: items.length || 1 };
    }

    var fieldsets = form.querySelectorAll(".exam-question");
    var n = Math.max(fieldsets.length, items.length);

    for (var i = 0; i < n; i++) {
      var fs = fieldsets[i];
      var item = items[i];
      var problems = [];

      if (!fs) {
        problems.push("missing fieldset");
      } else if (!item) {
        problems.push("missing item");
      } else {
        var domQ = fs.querySelector(".question-text");
        var domQText = domQ ? norm(domQ.textContent) : "";
        if (domQText !== norm(item.question)) {
          problems.push("Q-text mismatch");
        }

        var radios = fs.querySelectorAll('input[type="radio"]');
        var domOpts = [];
        radios.forEach(function (r) {
          domOpts.push(String(r.value || ""));
        });
        if (Array.isArray(item.options) && item.options.length) {
          if (domOpts.length !== item.options.length) {
            problems.push("option count mismatch");
          } else {
            for (var o = 0; o < domOpts.length; o++) {
              if (norm(domOpts[o]) !== norm(item.options[o])) {
                problems.push("option[" + o + "] order/text mismatch");
                break;
              }
            }
          }
        }

        var ans = Array.isArray(item.answers)
          ? String(item.answers[0] != null ? item.answers[0] : "")
          : String(item.answers || "");
        var ansHits = 0;
        if (Array.isArray(item.options)) {
          item.options.forEach(function (opt) {
            if (norm(opt) === norm(ans)) ansHits++;
          });
        }
        if (ansHits !== 1) {
          problems.push("answers[0] matches " + ansHits + " options");
        }

        var expl = String(item.explanation || "");
        var prefix = "Correct: " + ans;
        if (ans && expl.indexOf(prefix) !== 0) {
          if (expl.indexOf("Correct: " + ans + ".") !== 0 && expl.indexOf("Correct: " + ans + " ") !== 0) {
            problems.push("explanation missing Correct: prefix");
          }
        }
      }

      if (problems.length) {
        issues++;
        console.warn("#" + (i + 1), problems.join("; "));
      } else {
        console.log("#" + (i + 1), "OK");
      }
      rows.push({ i: i + 1, ok: problems.length === 0, problems: problems });
    }

    console.log("Issues:", issues, "/", n);
    console.groupEnd();
    return { total: n, issues: issues, rows: rows };
  };

  console.info(
    "RevDev: exam-integrity armed — commitExam, syncFromDom, __revdevAuditExam()"
  );
})();
