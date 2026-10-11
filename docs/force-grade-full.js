/* Ensure forceGrade always uses full markForm (status pills + explanations). */
(function () {
  "use strict";
  function fullForce() {
    var form = document.getElementById("exam-form");
    if (!form) return;
    form.classList.remove("is-per-question");
    form.querySelectorAll(".exam-question").forEach(function (fs) {
      fs.style.display = "";
      fs.classList.remove("is-active");
    });
    if (typeof window.__revdevForceGradePerQuestion === "function") {
      try {
        window.__revdevForceGradePerQuestion();
        return;
      } catch (e) {}
    }
    if (typeof window.__revdevMarkExamForm === "function") {
      try {
        window.__revdevMarkExamForm();
      } catch (e2) {}
    }
  }
  // Re-bind so any late 0/0 reclaim uses the shared path
  var prev = window.__revdevMarkExamForm;
  if (prev && !prev.__fullForceWrap) {
    var wrapped = function (outcomes) {
      try {
        prev(outcomes);
      } catch (e) {}
      setTimeout(function () {
        var se = document.getElementById("exam-score");
        var n = document.querySelectorAll("#exam-form .exam-question").length;
        if (se && n > 0 && /^0\s*\/\s*0$/.test((se.textContent || "").trim())) {
          fullForce();
        }
      }, 80);
    };
    wrapped.__fullForceWrap = true;
    window.__revdevMarkExamForm = wrapped;
  }
  console.info("RevDev: force-grade-full armed");
})();
