/* Per-question finish → always grade via the shared review path */
(function () {
  "use strict";

  function buildOutcomes() {
    var form = document.getElementById("exam-form");
    var items = [];
    if (Array.isArray(window.__revdevTimerExamItems) && window.__revdevTimerExamItems.length) {
      items = window.__revdevTimerExamItems;
    } else if (Array.isArray(window.__revdevFinalExamItems)) {
      items = window.__revdevFinalExamItems;
    } else if (Array.isArray(window.__revdevPristineExamItems)) {
      items = window.__revdevPristineExamItems;
    } else if (window.__revdevJob && Array.isArray(window.__revdevJob.collected)) {
      items = window.__revdevJob.collected;
    } else if (window.__revdevLastResult && Array.isArray(window.__revdevLastResult.items)) {
      items = window.__revdevLastResult.items;
    }

    var results = {};
    try {
      if (window.__revdevExamTimer && typeof window.__revdevExamTimer.getState === "function") {
        var st = window.__revdevExamTimer.getState();
        if (st && st.results) results = st.results;
      }
    } catch (e) {}

    var n = 0;
    if (items.length) n = items.length;
    else if (form) n = form.querySelectorAll(".exam-question").length;
    else n = Object.keys(results).length;
    if (!n) return [];

    var outcomes = [];
    for (var i = 0; i < n; i++) {
      var r = results[i] || results[String(i)] || {};
      var ans = r.answer != null ? String(r.answer) : "";
      if (!ans && form) {
        var checked = form.querySelector('input[name="question-' + i + '"]:checked');
        if (checked) ans = checked.value;
      }
      outcomes.push({
        question: items[i] || {},
        userAnswer: ans,
        index: i,
        timedOut: !!r.timedOut
      });
    }
    return outcomes;
  }

  function tryGrade() {
    var form = document.getElementById("exam-form");
    if (form) {
      form.classList.remove("is-per-question");
      form.querySelectorAll(".exam-question").forEach(function (fs) {
        fs.style.display = "";
        fs.classList.remove("is-active");
      });
    }
    var outcomes = buildOutcomes();
    if (typeof window.__revdevMarkExamForm === "function") {
      try {
        window.__revdevMarkExamForm(outcomes.length ? outcomes : undefined);
      } catch (e) {
        console.warn("[RevDev] per-q grade", e);
      }
    }
    setTimeout(function () {
      var se = document.getElementById("exam-score");
      var n = form ? form.querySelectorAll(".exam-question").length : 0;
      if (se && n > 0 && /^0\s*\/\s*0$/.test((se.textContent || "").trim())) {
        if (typeof window.__revdevForceGradePerQuestion === "function") {
          try {
            window.__revdevForceGradePerQuestion();
          } catch (e2) {}
        }
      }
    }, 120);
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
        if (t.id === "submit-exam" || (t.closest && t.closest("#submit-exam"))) {
          setTimeout(tryGrade, 80);
          setTimeout(tryGrade, 350);
        }
        if (t.id === "exam-timer-next" || (t.closest && t.closest("#exam-timer-next"))) {
          setTimeout(function () {
            var results = document.getElementById("exam-results");
            if (results && !results.hidden) tryGrade();
          }, 200);
        }
      },
      true
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(watch, 400);
    });
  } else {
    setTimeout(watch, 400);
  }
})();
