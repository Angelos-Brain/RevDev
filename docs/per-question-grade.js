/* Force grade after per-question exam finishes */
(function () {
  "use strict";
  function tryGrade() {
    if (typeof window.__revdevMarkExamForm === "function") {
      try { window.__revdevMarkExamForm(); } catch (e) {}
    }
  }
  function watch() {
    var results = document.getElementById("exam-results");
    if (results) {
      new MutationObserver(function () {
        if (!results.hidden) {
          setTimeout(tryGrade, 50);
          setTimeout(tryGrade, 300);
          setTimeout(tryGrade, 800);
        }
      }).observe(results, { attributes: true, attributeFilter: ["hidden"] });
    }
    // Also when retake/answered counters appear
    document.addEventListener(
      "click",
      function (ev) {
        var t = ev.target;
        if (!t) return;
        if (t.id === "submit-exam" || (t.closest && t.closest("#submit-exam"))) {
          setTimeout(tryGrade, 100);
          setTimeout(tryGrade, 400);
        }
      },
      true
    );
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(watch, 500); });
  } else {
    setTimeout(watch, 500);
  }
})();
