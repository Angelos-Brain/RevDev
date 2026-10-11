/* Force grade after per-question exam finishes */
(function () {
  "use strict";
  function tryGrade() {
    if (typeof window.__revdevMarkExamForm === "function") {
      try { window.__revdevMarkExamForm(); } catch (e) {}
    }
    setTimeout(function () {
      var se = document.getElementById("exam-score");
      if (se && /^0\s*\/\s*0$/.test((se.textContent || "").trim())) {
        if (typeof window.__revdevForceGradePerQuestion === "function") {
          try { window.__revdevForceGradePerQuestion(); } catch (e2) {}
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
          setTimeout(tryGrade, 1200);
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
      },
      true
    );
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(watch, 400); });
  } else {
    setTimeout(watch, 400);
  }
})();
