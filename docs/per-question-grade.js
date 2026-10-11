/* Per-question finish → grade via shared markForm (same as Total time). */
(function () {
  "use strict";

  function getItems() {
    var lists = [];
    if (Array.isArray(window.__revdevTimerExamItems) && window.__revdevTimerExamItems.length) {
      lists.push(window.__revdevTimerExamItems);
    }
    if (Array.isArray(window.__revdevFinalExamItems) && window.__revdevFinalExamItems.length) {
      lists.push(window.__revdevFinalExamItems);
    }
    if (Array.isArray(window.__revdevPristineExamItems) && window.__revdevPristineExamItems.length) {
      lists.push(window.__revdevPristineExamItems);
    }
    if (window.__revdevJob && Array.isArray(window.__revdevJob.collected) && window.__revdevJob.collected.length) {
      lists.push(window.__revdevJob.collected);
    }
    if (window.__revdevLastResult && Array.isArray(window.__revdevLastResult.items) && window.__revdevLastResult.items.length) {
      lists.push(window.__revdevLastResult.items);
    }
    var form = document.getElementById("exam-form");
    var n = form ? form.querySelectorAll(".exam-question").length : 0;
    for (var i = 0; i < lists.length; i++) {
      if (n && lists[i].length === n) return lists[i];
    }
    return lists[0] || [];
  }

  function buildOutcomes() {
    var form = document.getElementById("exam-form");
    var items = getItems();
    var results = {};
    try {
      if (window.__revdevExamTimer && typeof window.__revdevExamTimer.getState === "function") {
        var st = window.__revdevExamTimer.getState();
        if (st && st.results) results = st.results;
      }
    } catch (e) {}

    var n = items.length;
    if (!n && form) n = form.querySelectorAll(".exam-question").length;
    if (!n) n = Object.keys(results).length;
    if (!n) return [];

    var outcomes = [];
    for (var i = 0; i < n; i++) {
      var r = results[i] || results[String(i)] || {};
      var ans = r.answer != null ? String(r.answer) : "";
      if (!ans && form) {
        var checked = form.querySelector('input[name="question-' + i + '"]:checked');
        if (checked) ans = checked.value;
        else {
          var text = form.querySelector(
            'input[type="text"][name="question-' + i + '"], textarea[name="question-' + i + '"]'
          );
          if (text) ans = text.value || "";
        }
      }
      var q = items[i] || {};
      if ((!q.options || !q.options.length) && form) {
        var fs = form.querySelectorAll(".exam-question")[i];
        if (fs) {
          var domOpts = [];
          fs.querySelectorAll('input[type="radio"]').forEach(function (rad) {
            domOpts.push(rad.value);
          });
          if (domOpts.length) q = Object.assign({}, q, { options: domOpts });
        }
      }
      outcomes.push({
        question: q,
        userAnswer: ans,
        index: i,
        timedOut: !!r.timedOut
      });
    }
    return outcomes;
  }

  function showAllQuestions() {
    var form = document.getElementById("exam-form");
    if (!form) return;
    form.classList.remove("is-per-question");
    form.querySelectorAll(".exam-question").forEach(function (fs) {
      fs.style.display = "";
      fs.classList.remove("is-active");
    });
  }

  function tryGrade() {
    showAllQuestions();
    var items = getItems();
    if (items.length) window.__revdevTimerExamItems = items.slice();

    var outcomes = buildOutcomes();
    var mark =
      window.__revdevMarkExamFormRaw ||
      window.__revdevMarkExamForm;
    if (typeof mark === "function") {
      try {
        mark(outcomes.length ? outcomes : undefined);
      } catch (e) {
        console.warn("[RevDev] per-q grade", e);
      }
    }

    setTimeout(function () {
      var se = document.getElementById("exam-score");
      var form = document.getElementById("exam-form");
      var n = form ? form.querySelectorAll(".exam-question").length : 0;
      if (se && n > 0 && /^0\s*\/\s*0$/.test((se.textContent || "").trim())) {
        if (typeof window.__revdevForceGradePerQuestion === "function") {
          try {
            window.__revdevForceGradePerQuestion();
          } catch (e2) {}
        }
      }
    }, 100);
  }

  function snapshotItems() {
    var items = getItems();
    if (items.length) window.__revdevTimerExamItems = items.slice();
  }

  function watch() {
    var results = document.getElementById("exam-results");
    if (results) {
      new MutationObserver(function () {
        if (!results.hidden) {
          setTimeout(tryGrade, 30);
          setTimeout(tryGrade, 200);
          setTimeout(tryGrade, 600);
        }
      }).observe(results, { attributes: true, attributeFilter: ["hidden"] });
    }

    document.addEventListener(
      "click",
      function (ev) {
        var t = ev.target;
        if (!t) return;
        if (
          t.id === "submit-exam" ||
          (t.closest && t.closest("#submit-exam")) ||
          t.id === "exam-timer-next" ||
          (t.closest && t.closest("#exam-timer-next"))
        ) {
          snapshotItems();
          setTimeout(function () {
            var r = document.getElementById("exam-results");
            if (r && !r.hidden) tryGrade();
          }, 100);
          setTimeout(function () {
            var r = document.getElementById("exam-results");
            if (r && !r.hidden) tryGrade();
          }, 350);
        }
      },
      true
    );

    var out = document.getElementById("exam-output");
    if (out && window.MutationObserver) {
      new MutationObserver(function () {
        snapshotItems();
      }).observe(out, { childList: true, subtree: true });
    }

    setInterval(snapshotItems, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(watch, 400);
    });
  } else {
    setTimeout(watch, 400);
  }
})();
