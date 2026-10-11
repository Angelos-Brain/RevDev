/* review-fix loader: known-good + explanation-first key override */
(async function () {
  "use strict";
  var res = await fetch(
    "https://raw.githubusercontent.com/Angelos-Brain/RevDev/06664540a3b6d5377a22b2a549d072e1669d792d/docs/review-fix.js"
  );
  if (!res.ok) throw new Error("review-fix load failed " + res.status);
  var code = await res.text();
  var blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  await import(blobUrl);

  (function strengthenExplanationPrecedence() {
    function norm(s) {
      return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    }
    function scoreOverlap(a, b) {
      function words(s) {
        return norm(s)
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter(function (w) {
            return (
              w.length > 4 &&
              !/^(which|where|their|there|these|those|about|would|could|should|being|after|before|under|over|while|during|system|systems|ability|between|correct|answer|option|because)$/.test(
                w
              )
            );
          });
      }
      var wa = words(a);
      var wb = words(b);
      if (!wa.length || !wb.length) return 0;
      var setB = Object.create(null);
      wb.forEach(function (w) {
        setB[w] = 1;
      });
      var hit = 0;
      wa.forEach(function (w) {
        if (setB[w]) hit++;
      });
      return hit / Math.max(wa.length, 1);
    }

    function repairFromExplanation(item) {
      if (!item || !Array.isArray(item.options) || item.options.length < 2) return -1;
      var expl = String(item.explanation || "");
      if (expl.trim().length < 8) return -1;
      var explLow = norm(expl);

      var hits = [];
      for (var i = 0; i < item.options.length; i++) {
        var o = norm(item.options[i]);
        if (o.length < 6) continue;
        var probe = o.slice(0, Math.min(56, o.length));
        if (probe.length >= 6 && explLow.indexOf(probe) !== -1) hits.push(i);
      }
      if (hits.length === 1) return hits[0];

      var phraseRe = /(?:correct(?:\s+answer)?|answer)\s*(?:is|:)\s*([^\n.]+)/gi;
      var pm;
      var phraseHits = [];
      while ((pm = phraseRe.exec(expl)) !== null) {
        var phrase = norm(pm[1]).slice(0, 80);
        if (phrase.length < 4) continue;
        for (var p = 0; p < item.options.length; p++) {
          var op = norm(item.options[p]);
          if (op === phrase || op.indexOf(phrase) !== -1 || phrase.indexOf(op) !== -1) {
            phraseHits.push(p);
          }
        }
      }
      var puniq = [];
      phraseHits.forEach(function (x) {
        if (puniq.indexOf(x) === -1) puniq.push(x);
      });
      if (puniq.length === 1) return puniq[0];

      var codes = {};
      var re = /(?:status\s*code|returns?|receives?|encounters?|gets?|is\s+)\s*(\d{3})\b/gi;
      var m;
      while ((m = re.exec(expl)) !== null) codes[m[1]] = 1;
      var codeHits = [];
      Object.keys(codes).forEach(function (code) {
        for (var j = 0; j < item.options.length; j++) {
          if (String(item.options[j] || "").indexOf(code) !== -1) codeHits.push(j);
        }
      });
      var uniq = [];
      codeHits.forEach(function (x) {
        if (uniq.indexOf(x) === -1) uniq.push(x);
      });
      if (uniq.length === 1) return uniq[0];

      var scores = [];
      for (var s = 0; s < item.options.length; s++) {
        scores.push({ i: s, s: scoreOverlap(item.options[s], expl) });
      }
      scores.sort(function (a, b) {
        return b.s - a.s;
      });
      if (scores.length && scores[0].s >= 0.22) {
        if (scores.length === 1 || scores[0].s >= scores[1].s + 0.05) return scores[0].i;
      }
      return -1;
    }

    function forceReconcileAll() {
      var lists = [];
      if (window.__revdevFinalExamItems) lists.push(window.__revdevFinalExamItems);
      if (window.__revdevPristineExamItems) lists.push(window.__revdevPristineExamItems);
      if (window.__revdevJob && window.__revdevJob.collected) lists.push(window.__revdevJob.collected);
      if (window.__revdevLastResult && window.__revdevLastResult.items)
        lists.push(window.__revdevLastResult.items);
      lists.forEach(function (list) {
        if (!Array.isArray(list)) return;
        list.forEach(function (q) {
          var i = repairFromExplanation(q);
          if (i >= 0) q.answers = [String(q.options[i])];
        });
      });
    }

    document.addEventListener(
      "click",
      function (e) {
        var t = e.target;
        if (!t) return;
        var btn = t.id ? t : t.closest && t.closest("button");
        var id = btn && btn.id;
        if (id === "submit-exam" || id === "exam-timer-next" || id === "retake-exam") {
          forceReconcileAll();
        }
      },
      true
    );

    var tries = 0;
    (function tick() {
      forceReconcileAll();
      tries++;
      if (tries < 80) setTimeout(tick, 400);
    })();

    console.info(
      "RevDev: explanation-first key override active (status codes, phrases, probes)"
    );
  })();
})();
