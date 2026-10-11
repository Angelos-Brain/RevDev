/* Patch: forceGrade must use full markForm (Per question = Total time review). */
(function () {
  "use strict";

  function buildOutcomes() {
    var form = document.getElementById("exam-form");
    var items = [];
    if (Array.isArray(window.__revdevTimerExamItems) && window.__revdevTimerExamItems.length) {
      items = window.__revdevTimerExamItems;
    } else if (Array.isArray(window.__revdevFinalExamItems) && window.__revdevFinalExamItems.length) {
      items = window.__revdevFinalExamItems;
    } else if (Array.isArray(window.__revdevPristineExamItems) && window.__revdevPristineExamItems.length) {
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

  function forceFullGrade() {
    var form = document.getElementById("exam-form");
    if (!form) return;
    form.classList.remove("is-per-question");
    form.querySelectorAll(".exam-question").forEach(function (fs) {
      fs.style.display = "";
      fs.classList.remove("is-active");
    });
    var outcomes = buildOutcomes();
    if (!outcomes.length) {
      console.warn("[RevDev] force-full-grade: no outcomes");
      return;
    }
    if (Array.isArray(window.__revdevTimerExamItems) === false || !window.__revdevTimerExamItems.length) {
      var items = outcomes.map(function (o) { return o.question; });
      if (items.some(function (q) { return q && (q.options || q.answers || q.question); })) {
        window.__revdevTimerExamItems = items;
      }
    }
    var raw = window.__revdevMarkExamFormRaw;
    if (typeof raw === "function") {
      raw(outcomes);
    } else if (typeof window.__revdevMarkExamForm === "function") {
      window.__revdevMarkExamForm(outcomes);
    }
    console.info("[RevDev] force-full-grade marked", outcomes.length);
  }

  window.__revdevForceGradePerQuestion = forceFullGrade;

  function wrapMark() {
    var raw = window.__revdevMarkExamFormRaw || window.__revdevMarkExamForm;
    if (!raw || raw.__revdevFullGradeWrapped) return;
    window.__revdevMarkExamFormRaw = raw;
    var wrapped = function (outcomes) {
      if (!outcomes || !outcomes.length) {
        outcomes = buildOutcomes();
      }
      var form = document.getElementById("exam-form");
      if (form) {
        form.classList.remove("is-per-question");
        form.querySelectorAll(".exam-question").forEach(function (fs) {
          fs.style.display = "";
          fs.classList.remove("is-active");
        });
      }
      try {
        raw(outcomes && outcomes.length ? outcomes : undefined);
      } catch (e) {
        console.warn("[RevDev] mark wrap", e);
      }
      setTimeout(function () {
        var se = document.getElementById("exam-score");
        var n = form ? form.querySelectorAll(".exam-question").length : 0;
        if (se && n > 0 && /^0\s*\/\s*0$/.test((se.textContent || "").trim())) {
          forceFullGrade();
        }
      }, 60);
    };
    wrapped.__revdevFullGradeWrapped = true;
    window.__revdevMarkExamForm = wrapped;
  }

  wrapMark();
  setTimeout(wrapMark, 500);
  setTimeout(wrapMark, 2000);

  console.info("RevDev: force-full-grade armed (Per question uses shared markForm)");
})();
