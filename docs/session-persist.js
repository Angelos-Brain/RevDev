/* RevDev session persist — restore files + exam progress after refresh (IndexedDB) */
(function () {
  var DB_NAME = "revdev-session-v1";
  var DB_VER = 1;
  var STORE = "kv";
  var MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB per file
  var MAX_TOTAL_BYTES = 40 * 1024 * 1024;
  var SAVE_DEBOUNCE_MS = 400;

  var dbPromise = null;
  var saveTimer = null;
  var restoring = false;
  var lastSavedExamSig = "";

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function idbSet(key, value) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readonly");
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbDel(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function qs(id) { return document.getElementById(id); }

  function toast(msg, kind) {
    var el = qs("revdev-session-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "revdev-session-toast";
      el.setAttribute("role", "status");
      el.style.cssText =
        "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:99999;" +
        "max-width:min(520px,92vw);padding:10px 16px;border-radius:10px;font:500 13px/1.4 system-ui,sans-serif;" +
        "box-shadow:0 8px 28px rgba(0,0,0,.18);background:#111827;color:#fff;";
      document.body.appendChild(el);
    }
    el.style.background = kind === "error" ? "#991b1b" : kind === "ok" ? "#065f46" : "#111827";
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._hide);
    el._hide = setTimeout(function () { el.hidden = true; }, 4500);
  }

  function readFileAsBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsArrayBuffer(file);
    });
  }

  async function captureFilesFromInput() {
    var input = qs("file-input");
    if (!input || !input.files || !input.files.length) return null;
    var files = Array.from(input.files);
    var total = 0;
    var out = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (f.size > MAX_FILE_BYTES) {
        console.warn("[RevDev persist] skip large file", f.name, f.size);
        continue;
      }
      total += f.size;
      if (total > MAX_TOTAL_BYTES) {
        console.warn("[RevDev persist] total size limit reached");
        break;
      }
      try {
        var buf = await readFileAsBuffer(f);
        out.push({
          name: f.name,
          type: f.type || "application/octet-stream",
          size: f.size,
          lastModified: f.lastModified || Date.now(),
          buffer: buf
        });
      } catch (e) {
        console.warn("[RevDev persist] read failed", f.name, e);
      }
    }
    return out.length ? out : null;
  }

  function getPreviewText() {
    var preview = qs("preview");
    if (!preview) return "";
    return (preview.innerText || preview.textContent || "").trim();
  }

  function getSettingsSnapshot() {
    var mode = qs("mode-select");
    var count = qs("item-count");
    var topic = qs("topic-select");
    var provider = qs("provider-select");
    var types = [];
    document.querySelectorAll('#exam-options input[type="checkbox"]').forEach(function (cb) {
      if (cb.checked && cb.name) types.push({ name: cb.name, value: cb.value || "on" });
      else if (cb.checked && cb.id) types.push({ id: cb.id, value: cb.value || "on" });
    });
    var timerMode = "off";
    try {
      timerMode = localStorage.getItem("revdev_exam_timer_mode") || "off";
    } catch (e) {}
    return {
      mode: mode ? mode.value : "exam",
      itemCount: count ? count.value : "20",
      topic: topic ? topic.value : "",
      provider: provider ? provider.value : "",
      questionTypes: types,
      timerMode: timerMode
    };
  }

  function collectAnswersFromForm() {
    var form = qs("exam-form");
    if (!form) return {};
    var answers = {};
    form.querySelectorAll(".exam-question").forEach(function (fs, idx) {
      var name = "question-" + idx;
      var checked = form.querySelector('input[name="' + name + '"]:checked');
      if (checked) {
        answers[idx] = { value: checked.value, type: "choice" };
        return;
      }
      var text = form.querySelector('input[name="' + name + '"][type="text"], textarea[name="' + name + '"]');
      if (text && String(text.value || "").trim()) {
        answers[idx] = { value: text.value, type: "text" };
      }
    });
    return answers;
  }

  function getExamItems() {
    if (Array.isArray(window.__revdevFinalExamItems) && window.__revdevFinalExamItems.length) {
      return window.__revdevFinalExamItems;
    }
    if (Array.isArray(window.__revdevPristineExamItems) && window.__revdevPristineExamItems.length) {
      return window.__revdevPristineExamItems;
    }
    var job = window.__revdevJob;
    if (job && Array.isArray(job.collected) && job.collected.length) return job.collected;
    var last = window.__revdevLastResult;
    if (last && Array.isArray(last.items) && last.items.length) return last.items;
    return [];
  }

  function getTimerSnapshot() {
    try {
      if (window.__revdevExamTimer && typeof window.__revdevExamTimer.getState === "function") {
        return window.__revdevExamTimer.getState();
      }
    } catch (e) {}
    return null;
  }

  async function saveSession(partial) {
    if (restoring) return;
    try {
      var prev = (await idbGet("session")) || {};
      var next = Object.assign({}, prev, partial || {}, { savedAt: Date.now() });
      await idbSet("session", next);
    } catch (e) {
      console.warn("[RevDev persist] save failed", e);
    }
  }

  async function saveFilesNow() {
    if (restoring) return;
    try {
      var files = await captureFilesFromInput();
      var text = getPreviewText();
      var patch = { settings: getSettingsSnapshot() };
      if (files) patch.files = files;
      if (text && text.length > 20) patch.extractedText = text;
      await saveSession(patch);
    } catch (e) {
      console.warn("[RevDev persist] files save failed", e);
    }
  }

  function scheduleSaveFiles() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveFilesNow, SAVE_DEBOUNCE_MS);
  }

  async function saveExamProgress() {
    if (restoring) return;
    var items = getExamItems();
    if (!items.length) {
      var form = qs("exam-form");
      if (!form || !form.querySelector(".exam-question")) return;
    }
    var answers = collectAnswersFromForm();
    var timer = getTimerSnapshot();
    var submitted = !!window.__revdevExamSubmitted;
    var payload = {
      exam: {
        items: items,
        answers: answers,
        submitted: submitted,
        results: window.__revdevExamResults || null,
        timer: timer,
        answerState: window.__revdevAnswerState || null
      },
      settings: getSettingsSnapshot(),
      extractedText: getPreviewText() || undefined
    };
    var sig = items.length + ":" + Object.keys(answers).length + ":" + (timer && timer.phase) + ":" + submitted;
    lastSavedExamSig = sig;
    await saveSession(payload);
  }

  function scheduleSaveExam() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveExamProgress(); }, SAVE_DEBOUNCE_MS);
  }

  async function restoreFiles(session) {
    if (!session || !session.files || !session.files.length) return false;
    var input = qs("file-input");
    if (!input) return false;
    try {
      var dt = new DataTransfer();
      session.files.forEach(function (f) {
        var blob = new Blob([f.buffer], { type: f.type || "application/octet-stream" });
        var file = new File([blob], f.name, {
          type: f.type || "application/octet-stream",
          lastModified: f.lastModified || Date.now()
        });
        dt.items.add(file);
      });
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));

      // Update file list UI if present
      var list = qs("file-list");
      var count = qs("file-count");
      if (count) count.textContent = session.files.length + " file(s) restored";
      if (list) {
        list.innerHTML = session.files
          .map(function (f) {
            return "<li>" + escapeHtml(f.name) + " <span class=\"muted\">(" + formatSize(f.size) + ")</span></li>";
          })
          .join("");
      }

      // Restore extracted text into preview so Generate works without re-read
      if (session.extractedText) {
        var preview = qs("preview");
        if (preview) {
          preview.textContent = session.extractedText;
        }
        var meta = qs("preview-meta");
        if (meta) {
          meta.textContent =
            session.files.length + " restored file(s) · " + session.extractedText.length.toLocaleString() + " characters";
        }
        // Common globals used by generators
        try {
          window.__revdevExtractedText = session.extractedText;
          window.__revdevSourceText = session.extractedText;
          if (window.__revdevJob) window.__revdevJob.sourceText = session.extractedText;
        } catch (e) {}
      }

      // Click Read if text not already restored — gives app a chance to re-parse
      if (!session.extractedText) {
        var readBtn = qs("read-button");
        if (readBtn) setTimeout(function () { readBtn.click(); }, 300);
      }

      return true;
    } catch (e) {
      console.warn("[RevDev persist] restore files failed", e);
      return false;
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function restoreSettings(settings) {
    if (!settings) return;
    try {
      var mode = qs("mode-select");
      if (mode && settings.mode) {
        mode.value = settings.mode;
        mode.dispatchEvent(new Event("change", { bubbles: true }));
      }
      var count = qs("item-count");
      var slider = qs("item-count-slider");
      if (count && settings.itemCount) {
        count.value = settings.itemCount;
        count.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (slider && settings.itemCount) {
        slider.value = settings.itemCount;
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      }
      var topic = qs("topic-select");
      if (topic && settings.topic) {
        topic.value = settings.topic;
        topic.dispatchEvent(new Event("change", { bubbles: true }));
      }
      var provider = qs("provider-select");
      if (provider && settings.provider) {
        provider.value = settings.provider;
        provider.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (settings.timerMode) {
        try { localStorage.setItem("revdev_exam_timer_mode", settings.timerMode); } catch (e) {}
        document.querySelectorAll('input[name="exam-timer-mode"]').forEach(function (inp) {
          inp.checked = inp.value === settings.timerMode;
          if (inp.checked) inp.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }
    } catch (e) {
      console.warn("[RevDev persist] settings restore", e);
    }
  }

  function applyAnswersToForm(answers) {
    if (!answers) return 0;
    var form = qs("exam-form");
    if (!form) return 0;
    var n = 0;
    Object.keys(answers).forEach(function (k) {
      var idx = parseInt(k, 10);
      if (isNaN(idx)) return;
      var a = answers[k];
      if (!a) return;
      var name = "question-" + idx;
      if (a.type === "text") {
        var text = form.querySelector('input[name="' + name + '"][type="text"], textarea[name="' + name + '"]');
        if (text) {
          text.value = a.value;
          n++;
        }
        return;
      }
      var radios = form.querySelectorAll('input[name="' + name + '"]');
      radios.forEach(function (r) {
        if (String(r.value) === String(a.value)) {
          r.checked = true;
          r.dispatchEvent(new Event("change", { bubbles: true }));
          var lab = r.closest("label");
          if (lab) lab.classList.add("selected");
          n++;
        }
      });
    });
    if (window.__revdevAnswerState && typeof answers === "object") {
      Object.keys(answers).forEach(function (k) {
        window.__revdevAnswerState[k] = answers[k].value;
      });
    }
    return n;
  }

  async function restoreExam(session) {
    if (!session || !session.exam || !session.exam.items || !session.exam.items.length) return false;
    var items = session.exam.items;
    var answers = session.exam.answers || {};

    window.__revdevFinalExamItems = items;
    window.__revdevPristineExamItems = items.slice();
    window.__revdevLastResult = { items: items, mode: "exam" };
    if (!window.__revdevJob) window.__revdevJob = {};
    window.__revdevJob.collected = items;
    window.__revdevExamReady = true;
    window.__revdevExamSubmitted = !!session.exam.submitted;

    // Render exam
    if (typeof window.__revdevRenderExamClean === "function") {
      window.__revdevRenderExamClean(items);
    }

    // Show exam output section
    var out = qs("exam-output");
    if (out) out.hidden = false;

    // Wait a tick for DOM, then apply answers
    await new Promise(function (r) { setTimeout(r, 200); });
    var applied = applyAnswersToForm(answers);

    // If was in review, re-mark
    if (session.exam.submitted && typeof window.__revdevMarkExamForm === "function") {
      setTimeout(function () {
        try { window.__revdevMarkExamForm(); } catch (e) {}
      }, 300);
    }

    return { count: items.length, answered: applied };
  }

  async function restoreAll() {
    restoring = true;
    try {
      var session = await idbGet("session");
      if (!session) {
        restoring = false;
        return;
      }

      restoreSettings(session.settings);

      var fileOk = await restoreFiles(session);
      var examInfo = null;
      if (session.exam && session.exam.items && session.exam.items.length) {
        // Wait for render helpers from loader
        var tries = 0;
        while (tries < 25 && typeof window.__revdevRenderExamClean !== "function") {
          await new Promise(function (r) { setTimeout(r, 200); });
          tries++;
        }
        examInfo = await restoreExam(session);
      }

      var parts = [];
      if (fileOk) parts.push("files");
      if (session.extractedText) parts.push("extracted text");
      if (examInfo) parts.push(examInfo.count + " exam questions (" + examInfo.answered + " answers kept)");
      if (parts.length) {
        toast("Session restored: " + parts.join(", ") + ". You can continue where you left off.", "ok");
      }
    } catch (e) {
      console.warn("[RevDev persist] restore failed", e);
      toast("Could not fully restore the previous session.", "error");
    } finally {
      setTimeout(function () { restoring = false; }, 800);
    }
  }

  function wireFileCapture() {
    var input = qs("file-input");
    if (input) {
      input.addEventListener("change", function () {
        scheduleSaveFiles();
        // After read completes, text appears in preview — watch that too
        setTimeout(scheduleSaveFiles, 1500);
        setTimeout(scheduleSaveFiles, 4000);
      });
    }
    var drop = qs("dropzone");
    if (drop) {
      drop.addEventListener("drop", function () {
        setTimeout(scheduleSaveFiles, 300);
        setTimeout(scheduleSaveFiles, 2000);
      });
    }
    var readBtn = qs("read-button");
    if (readBtn) {
      readBtn.addEventListener("click", function () {
        setTimeout(scheduleSaveFiles, 1000);
        setTimeout(scheduleSaveFiles, 3000);
        setTimeout(scheduleSaveFiles, 6000);
      });
    }
    var clearBtn = qs("clear-button");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        idbDel("session").catch(function () {});
        toast("Saved session cleared.", "ok");
      });
    }
  }

  function wireExamCapture() {
    document.addEventListener("change", function (ev) {
      var t = ev.target;
      if (!t) return;
      if (t.name && String(t.name).indexOf("question-") === 0) {
        scheduleSaveExam();
        return;
      }
      if (t.id === "mode-select" || t.id === "item-count" || t.id === "item-count-slider" ||
          t.id === "topic-select" || t.id === "provider-select" ||
          (t.name === "exam-timer-mode")) {
        scheduleSaveFiles();
      }
    });
    document.addEventListener("input", function (ev) {
      var t = ev.target;
      if (!t) return;
      if (t.name && String(t.name).indexOf("question-") === 0) scheduleSaveExam();
      if (t.id === "item-count" || t.id === "item-count-slider") scheduleSaveFiles();
    });

    // When generation finishes, save full exam
    var status = qs("generation-status");
    if (status) {
      new MutationObserver(function () {
        var text = status.textContent || "";
        if (/Done\.|Generated \d+/i.test(text)) {
          setTimeout(saveExamProgress, 800);
          setTimeout(saveExamProgress, 2000);
        }
      }).observe(status, { childList: true, characterData: true, subtree: true });
    }

    // Periodic light save while answering
    setInterval(function () {
      if (restoring) return;
      var form = qs("exam-form");
      if (!form || !form.querySelector(".exam-question")) return;
      if (window.__revdevExamSubmitted) return;
      saveExamProgress();
    }, 8000);
  }

  function wirePreviewWatch() {
    var preview = qs("preview");
    if (!preview) return;
    new MutationObserver(function () {
      if (restoring) return;
      var t = getPreviewText();
      if (t && t.length > 40) scheduleSaveFiles();
    }).observe(preview, { childList: true, characterData: true, subtree: true });
  }

  // Boot after app modules load
  function boot() {
    wireFileCapture();
    wireExamCapture();
    wirePreviewWatch();
    // Restore after loaders finish
    setTimeout(restoreAll, 900);
    setTimeout(function () {
      // Second chance if render helpers loaded late
      if (!window.__revdevRenderExamClean) setTimeout(restoreAll, 1500);
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 100); });
  } else {
    setTimeout(boot, 100);
  }

  window.__revdevSessionPersist = {
    saveNow: function () { return saveExamProgress().then(saveFilesNow); },
    clear: function () { return idbDel("session"); },
    restore: restoreAll
  };

  console.info("RevDev: session persist armed (files + exam progress)");
})();
