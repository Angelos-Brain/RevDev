/* Per-question finish → always grade via the shared review path (no separate UI). */
(function () {
  "use strict";

  function tryGrade() {
    var form = document.getElementById("exam-form");
    if (form) {
      form.classList.remove("is-per-question");
      form.querySelectorAll(".exam-question").forEach(function (fs) {
        fs.style.display = "";
        fs.classList.remove("is-active");
      });
    }
    // Prefer the unified shared path
    if (typeof window.__revdevForceGradePerQuestion === "function") {
      try {
        window.__revdevForceGradePerQuestion();
        return;
      } catch (e) {
        console.warn("[RevDev] per-q forceGrade", e);
      }
    }
    if (typeof window.__revdevMarkExamForm === "function") {
      try {
        window.__revdevMarkExamForm();
      } catch (e2) {
        console.warn("[RevDev] per-q markForm", e2);
      }
    }
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
