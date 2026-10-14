/* review-fix loader: base markForm + ensure outcomes build from form */
(async function () {
  "use strict";
  var res = await fetch(
    "https://raw.githubusercontent.com/Angelos-Brain/RevDev/06664540a3b6d5377a22b2a549d072e1669d792d/docs/review-fix.js"
  );
  if (!res.ok) throw new Error("review-fix load failed " + res.status);
  var code = await res.text();
  var blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  await import(blobUrl);

  // Ensure markForm can run with no outcomes (build from form + items)
  var orig = window.__revdevMarkExamForm;
  if (orig && !orig.__rfOutcomesWrap) {
    function buildOutcomes() {
      var form = document.getElementById("exam-form");
      if (!form) return [];
      var items =
        (window.__revdevFinalExamItems && window.__revdevFinalExamItems.length && window.__revdevFinalExamItems) ||
        (window.__revdevPristineExamItems && window.__revdevPristineExamItems.length && window.__revdevPristineExamItems) ||
        (window.__revdevJob && window.__revdevJob.collected) ||
        (window.__revdevLastResult && window.__revdevLastResult.items) ||
        [];
      var out = [];
      form.querySelectorAll(".exam-question").forEach(function (fs, index) {
        var name = "question-" + index;
        var userAnswer = "";
        var checked = form.querySelector('input[name="' + name + '"]:checked');
        if (checked) userAnswer = checked.value;
        else {
          var text = form.querySelector('input[type="text"][name="' + name + '"], textarea[name="' + name + '"]');
          if (text) userAnswer = text.value || "";
        }
        out.push({ question: items[index] || {}, userAnswer: userAnswer, index: index });
      });
      return out;
    }
    function wrapped(outcomes) {
      if (typeof window.__revdevFixAnswerKeys === "function") {
        try { window.__revdevFixAnswerKeys(); } catch (e) {}
      }
      if (!outcomes || !outcomes.length) outcomes = buildOutcomes();
      if (Array.isArray(outcomes)) {
        outcomes.forEach(function (o) {
          if (o && o.question && typeof window.__revdevResolveKeyIndex === "function") {
            var i = window.__revdevResolveKeyIndex(o.question);
            if (i >= 0 && o.question.options && o.question.options[i] != null) {
              o.question.answers = [String(o.question.options[i])];
            }
          }
        });
      }
      return orig.call(this, outcomes);
    }
    wrapped.__rfOutcomesWrap = true;
    if (!window.__revdevMarkExamFormRaw) window.__revdevMarkExamFormRaw = orig;
    window.__revdevMarkExamForm = wrapped;
  }

  console.info("RevDev: review-fix base + outcomes builder");
})();
