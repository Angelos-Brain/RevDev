/* Unify per-question review with the shared markForm path + structural test */
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

  function gradeShared() {
    showAllQuestions();
    var outcomes = buildOutcomes();
    if (!outcomes.length) {
      console.warn("[RevDev] review-unify: no outcomes");
      return;
    }
    var items = getItems();
    if (items.length) window.__revdevTimerExamItems = items.slice();

    if (typeof window.__revdevMarkExamFormRaw === "function") {
      window.__revdevMarkExamFormRaw(outcomes);
    } else if (typeof window.__revdevMarkExamForm === "function") {
      window.__revdevMarkExamForm(outcomes);
    }

    setTimeout(function () {
      var se = document.getElementById("exam-score");
      var form = document.getElementById("exam-form");
      var n = form ? form.querySelectorAll(".exam-question").length : 0;
      if (se && n > 0 && /^0\s*\/\s*0$/.test((se.textContent || "").trim())) {
        console.warn("[RevDev] review-unify reclaiming 0/0");
        if (typeof window.__revdevMarkExamFormRaw === "function") {
          window.__revdevMarkExamFormRaw(buildOutcomes());
        }
      }
      se = document.getElementById("exam-score");
      if (se && n > 0 && /^0\s*\/\s*0$/.test((se.textContent || "").trim())) {
        var banner = document.getElementById("revdev-grade-error");
        if (!banner) {
          banner = document.createElement("div");
          banner.id = "revdev-grade-error";
          banner.className = "status-message error";
          banner.textContent =
            "Could not grade this exam (missing answer keys or answers). Your answers are still on the form.";
          var results = document.getElementById("exam-results");
          if (results) results.parentNode.insertBefore(banner, results);
        }
      }
    }, 100);
  }

  window.__revdevRenderReview = function (items, answers, results, options) {
    options = options || {};
    var list = items && items.length ? items : getItems();
    var outcomes = [];
    for (var i = 0; i < list.length; i++) {
      var ans = "";
      if (answers && answers[i] != null) ans = String(answers[i]);
      else if (results && (results[i] || results[String(i)])) {
        var rr = results[i] || results[String(i)];
        if (rr && rr.answer != null) ans = String(rr.answer);
      }
      outcomes.push({
        question: list[i] || {},
        userAnswer: ans,
        index: i,
        timedOut: !!(results && (results[i] || results[String(i)]) && (results[i] || results[String(i)]).timedOut)
      });
    }
    showAllQuestions();
    if (typeof window.__revdevMarkExamFormRaw === "function") {
      window.__revdevMarkExamFormRaw(outcomes);
    } else if (typeof window.__revdevMarkExamForm === "function") {
      window.__revdevMarkExamForm(outcomes);
    }
    return outcomes;
  };

  window.__revdevReviewTest = function () {
    var form = document.getElementById("exam-form");
    var resultsEl = document.getElementById("exam-results");
    var scoreEl = document.getElementById("exam-score");
    var percentEl = document.getElementById("exam-percent");
    if (!form) {
      var err = { ok: false, error: "no exam-form" };
      console.error("[RevDev] __revdevReviewTest", err);
      return err;
    }
    var mockItems = [];
    for (var i = 0; i < 5; i++) {
      mockItems.push({
        type: "multiple_choice",
        question: "Mock question " + (i + 1) + "?",
        options: ["Option Alpha", "Option Beta", "Option Gamma", "Option Delta"],
        answers: ["Option Alpha"],
        explanation: "Alpha is correct because it matches the definition."
      });
    }
    var mockAnswers = ["Option Alpha", "Option Alpha", "Option Beta", "Option Alpha", ""];

    function snap() {
      var clone = form.cloneNode(true);
      clone.querySelectorAll(".exam-time-chip").forEach(function (c) { c.remove(); });
      clone.querySelectorAll("[id]").forEach(function (el) { el.removeAttribute("id"); });
      clone.querySelectorAll("[for]").forEach(function (el) { el.removeAttribute("for"); });
      return clone.innerHTML.replace(/\s+/g, " ").trim();
    }

    function runMode(label) {
      form.innerHTML = "";
      mockItems.forEach(function (q, index) {
        var fs = document.createElement("fieldset");
        fs.className = "exam-question";
        fs.dataset.index = String(index);
        var legend = document.createElement("legend");
        legend.innerHTML =
          '<span class="question-number">' +
          String(index + 1).padStart(2, "0") +
          '</span><span class="question-type">Multiple choice</span><span class="question-text"></span>';
        legend.querySelector(".question-text").textContent = q.question;
        fs.appendChild(legend);
        var opts = document.createElement("div");
        opts.className = "question-options";
        (q.options || []).forEach(function (option, oi) {
          var letter = String.fromCharCode(65 + oi);
          var label = document.createElement("label");
          label.className = "choice-option";
          var input = document.createElement("input");
          input.type = "radio";
          input.name = "question-" + index;
          input.value = option;
          var marker = document.createElement("span");
          marker.className = "choice-marker";
          marker.textContent = letter;
          var val = document.createElement("span");
          val.textContent = option;
          label.append(input, marker, val);
          opts.appendChild(label);
        });
        fs.appendChild(opts);
        form.appendChild(fs);
      });
      if (resultsEl) resultsEl.hidden = false;
      window.__revdevRenderReview(mockItems, mockAnswers, null, { mode: label });
      return {
        html: snap(),
        score: scoreEl ? scoreEl.textContent.trim() : "",
        percent: percentEl ? percentEl.textContent.trim() : "",
        greens: form.querySelectorAll(".is-correct-answer").length,
        wrongs: form.querySelectorAll(".is-user-wrong").length,
        explanations: form.querySelectorAll(".exam-explanation, .exam-inline-result").length
      };
    }

    var off = runMode("off");
    var total = runMode("total");
    var per = runMode("per");
    var ok =
      off.html === total.html &&
      total.html === per.html &&
      off.score === "3 / 5" &&
      total.score === "3 / 5" &&
      per.score === "3 / 5" &&
      off.percent === "60%" &&
      off.greens === 5 &&
      off.wrongs === 1 &&
      off.explanations === 5;
    var report = {
      ok: ok,
      scores: { off: off.score, total: total.score, per: per.score },
      percents: { off: off.percent, total: total.percent, per: per.percent },
      greens: { off: off.greens, total: total.greens, per: per.greens },
      wrongs: { off: off.wrongs, total: total.wrongs, per: per.wrongs },
      explanations: { off: off.explanations, total: total.explanations, per: per.explanations },
      domIdentical: off.html === total.html && total.html === per.html
    };
    if (ok) console.info("[RevDev] __revdevReviewTest PASS", report);
    else console.error("[RevDev] __revdevReviewTest FAIL", report);
    return report;
  };

  window.__revdevForceGradePerQuestion = gradeShared;

  function installWrap() {
    var raw = window.__revdevMarkExamFormRaw || window.__revdevMarkExamForm;
    if (!raw || raw.__revdevUnified) return;
    var wrapped = function (outcomes) {
      if (!outcomes || !outcomes.length) {
        outcomes = buildOutcomes();
      } else {
        var items = getItems();
        outcomes.forEach(function (o, i) {
          var q = o.question || {};
          if (items[i] && (!q.options || !q.options.length || !q.answers || !q.answers.length)) {
            o.question = Object.assign({}, items[i], q);
          }
        });
      }
      showAllQuestions();
      return raw(outcomes);
    };
    wrapped.__revdevUnified = true;
    window.__revdevMarkExamForm = wrapped;
    if (!window.__revdevMarkExamFormRaw) window.__revdevMarkExamFormRaw = raw;
  }
  installWrap();
  setTimeout(installWrap, 500);
  setTimeout(installWrap, 2000);

  function watchResults() {
    var results = document.getElementById("exam-results");
    if (!results) return;
    new MutationObserver(function () {
      if (results.hidden) return;
      setTimeout(gradeShared, 40);
      setTimeout(gradeShared, 250);
    }).observe(results, { attributes: true, attributeFilter: ["hidden"] });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(watchResults, 300); });
  } else {
    setTimeout(watchResults, 300);
  }

  var out = document.getElementById("exam-output");
  if (out) {
    new MutationObserver(function () {
      var items = getItems();
      if (items.length) window.__revdevTimerExamItems = items.slice();
    }).observe(out, { childList: true, subtree: true, attributes: true });
  }

  console.info("RevDev: review-unify armed (shared path + __revdevReviewTest)");
})();
