import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.mjs";

const CONFIG = Object.freeze({
  maxPreviewCharacters: 12000,
  supportedExtensions: ["pdf", "docx", "pptx", "txt", "md", "markdown"]
});

const state = {
  files: [],
  extracted: []
};

const elements = {
  fileInput: document.getElementById("file-input"),
  dropzone: document.getElementById("dropzone"),
  fileList: document.getElementById("file-list"),
  fileCount: document.getElementById("file-count"),
  readButton: document.getElementById("read-button"),
  clearButton: document.getElementById("clear-button"),
  status: document.getElementById("status"),
  preview: document.getElementById("preview"),
  previewMeta: document.getElementById("preview-meta")
};

function getExtension(fileName) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1024) return String(bytes || 0) + " B";
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return value.toFixed(value >= 10 ? 0 : 1) + " " + units[index];
}

function hasReadableText(text) {
  return /[A-Za-z0-9À-ÖØ-öø-ÿ]/.test(text || "");
}

function cleanText(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function setStatus(message, type = "") {
  elements.status.textContent = message;
  elements.status.className = "status-message" + (type ? " " + type : "");
}

function renderFileList() {
  if (state.files.length === 0) {
    elements.fileList.className = "file-list empty-state";
    elements.fileList.textContent = "No files selected yet.";
    elements.fileCount.textContent = "0 files";
    elements.readButton.disabled = true;
    elements.clearButton.disabled = true;
    return;
  }

  elements.fileList.className = "file-list";
  elements.fileList.replaceChildren();

  state.files.forEach(function (file, index) {
    const row = document.createElement("div");
    row.className = "file-item";

    const main = document.createElement("div");
    main.className = "file-main";

    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = file.name;

    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.textContent = getExtension(file.name).toUpperCase() + " · " + formatBytes(file.size);

    main.append(name, meta);

    const stateLabel = document.createElement("span");
    stateLabel.className = "file-state";
    stateLabel.textContent = "Ready";

    if (file._status === "reading") {
      stateLabel.textContent = "Reading…";
    } else if (file._status === "success") {
      stateLabel.textContent = file._readable ? "Readable" : "No text";
      stateLabel.classList.add(file._readable ? "ready" : "warn");
    } else if (file._status === "error") {
      stateLabel.textContent = "Failed";
      stateLabel.classList.add("warn");
    }

    row.dataset.index = String(index);
    row.append(main, stateLabel);
    elements.fileList.appendChild(row);
  });

  elements.fileCount.textContent =
    state.files.length + (state.files.length === 1 ? " file" : " files");
  elements.readButton.disabled = false;
  elements.clearButton.disabled = false;
}

function selectFiles(fileList) {
  const files = Array.from(fileList || []);
  const supported = files.filter(function (file) {
    return CONFIG.supportedExtensions.includes(getExtension(file.name));
  });
  const rejected = files.length - supported.length;

  state.files = supported;
  state.extracted = [];
  elements.preview.className = "preview empty-preview";
  elements.preview.textContent = supported.length
    ? "Click “Read files” to extract text."
    : "Upload supported files and click “Read files” to see the extracted text.";
  elements.previewMeta.textContent = "Nothing extracted yet";
  renderFileList();

  if (rejected > 0) {
    setStatus(
      rejected +
        " unsupported " +
        (rejected === 1 ? "file was" : "files were") +
        " ignored. Use PDF, DOCX, PPTX, TXT, or MD.",
      "error"
    );
  } else if (supported.length > 0) {
    setStatus(
      supported.length +
        " " +
        (supported.length === 1 ? "file is" : "files are") +
        " ready to read."
    );
  }
}

async function extractPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map(function (item) {
        return item.str || "";
      })
      .join(" ");
    pages.push(text);
  }

  return cleanText(pages.join("\n\n"));
}

async function extractDocx(file) {
  if (!window.mammoth || typeof window.mammoth.extractRawText !== "function") {
    throw new Error("The DOCX reader library did not load. Refresh the page and try again.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
  return cleanText(result && result.value);
}

async function extractPptx(file) {
  if (!window.JSZip) {
    throw new Error("The PPTX reader library did not load. Refresh the page and try again.");
  }

  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const slideNames = Object.keys(zip.files)
    .filter(function (name) {
      return /^ppt\/slides\/slide\d+\.xml$/i.test(name) && !zip.files[name].dir;
    })
    .sort(function (left, right) {
      const leftNumber = Number(left.match(/slide(\d+)\.xml$/i)[1]);
      const rightNumber = Number(right.match(/slide(\d+)\.xml$/i)[1]);
      return leftNumber - rightNumber;
    });

  const slides = [];

  for (let i = 0; i < slideNames.length; i += 1) {
    const xml = await zip.files[slideNames[i]].async("text");
    const document = new DOMParser().parseFromString(xml, "application/xml");

    if (document.querySelector("parsererror")) {
      continue;
    }

    const textParts = Array.from(document.getElementsByTagName("a:t"))
      .map(function (node) {
        return node.textContent || "";
      })
      .filter(Boolean);

    slides.push(textParts.join(" "));
  }

  return cleanText(slides.join("\n\n"));
}

async function extractPlainText(file) {
  return cleanText(await file.text());
}

async function extractFile(file) {
  const extension = getExtension(file.name);

  switch (extension) {
    case "pdf":
      return extractPdf(file);
    case "docx":
      return extractDocx(file);
    case "pptx":
      return extractPptx(file);
    case "txt":
    case "md":
    case "markdown":
      return extractPlainText(file);
    default:
      throw new Error("Unsupported file type.");
  }
}

function renderPreview() {
  if (state.extracted.length === 0) {
    elements.preview.className = "preview empty-preview";
    elements.preview.textContent = "No readable text was extracted.";
    elements.previewMeta.textContent = "0 readable files";
    return;
  }

  elements.preview.className = "preview";
  elements.preview.replaceChildren();

  let totalCharacters = 0;

  state.extracted.forEach(function (item) {
    const wrapper = document.createElement("section");
    wrapper.className = "preview-file";

    const label = document.createElement("span");
    label.className = "preview-file-label";
    label.textContent =
      item.file.name +
      " · " +
      item.text.length.toLocaleString() +
      " characters";

    const text = document.createElement("div");
    const shownText = item.text.slice(0, CONFIG.maxPreviewCharacters);
    text.textContent =
      shownText +
      (item.text.length > CONFIG.maxPreviewCharacters
        ? "\n\n[Preview truncated. The full extracted text remains available to the next generation milestone.]"
        : "");

    wrapper.append(label, text);
    elements.preview.appendChild(wrapper);
    totalCharacters += item.text.length;
  });

  const unreadableCount = state.files.length - state.extracted.length;
  elements.previewMeta.textContent =
    state.extracted.length +
    " readable " +
    (state.extracted.length === 1 ? "file" : "files") +
    " · " +
    totalCharacters.toLocaleString() +
    " characters";

  if (unreadableCount > 0) {
    elements.previewMeta.textContent +=
      " · " +
      unreadableCount +
      " file" +
      (unreadableCount === 1 ? "" : "s") +
      " had no readable text";
  }
}

async function readFiles() {
  if (state.files.length === 0) return;

  state.extracted = [];
  setStatus("Reading " + state.files.length + " file" + (state.files.length === 1 ? "" : "s") + "…");
  elements.readButton.disabled = true;
  renderFileList();

  const unreadable = [];

  for (let index = 0; index < state.files.length; index += 1) {
    const file = state.files[index];
    file._status = "reading";
    renderFileList();

    try {
      const text = await extractFile(file);
      file._status = "success";
      file._readable = hasReadableText(text);

      if (file._readable) {
        state.extracted.push({ file: file, text: text });
      } else {
        unreadable.push(file.name);
      }
    } catch (error) {
      file._status = "error";
      unreadable.push(file.name);
      console.error("RevDev could not read " + file.name, error);
    }

    renderFileList();
  }

  renderPreview();
  elements.readButton.disabled = state.files.length === 0;

  if (unreadable.length === 0) {
    setStatus("Finished. All selected files produced readable text.", "success");
  } else {
    setStatus(
      "Finished with " +
        unreadable.length +
        " file" +
        (unreadable.length === 1 ? "" : "s") +
        " that produced no readable text or could not be read. Scanned/image-only files may need OCR in a future version.",
      "error"
    );
  }
}

function clearAll() {
  state.files = [];
  state.extracted = [];
  elements.fileInput.value = "";
  elements.preview.className = "preview empty-preview";
  elements.preview.textContent =
    "Upload files and click “Read files” to see the extracted text.";
  elements.previewMeta.textContent = "Nothing extracted yet";
  setStatus("");
  renderFileList();
}

elements.fileInput.addEventListener("change", function (event) {
  selectFiles(event.target.files);
});

elements.readButton.addEventListener("click", readFiles);
elements.clearButton.addEventListener("click", clearAll);

["dragenter", "dragover"].forEach(function (eventName) {
  elements.dropzone.addEventListener(eventName, function (event) {
    event.preventDefault();
    elements.dropzone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach(function (eventName) {
  elements.dropzone.addEventListener(eventName, function (event) {
    event.preventDefault();
    elements.dropzone.classList.remove("is-dragover");
  });
});

elements.dropzone.addEventListener("drop", function (event) {
  selectFiles(event.dataTransfer.files);
});

renderFileList();
