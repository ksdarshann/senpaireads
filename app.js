(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const uploadInput = $("book-upload");
  const bookshelf = $("bookshelf");
  const emptyState = $("empty-state");
  const status = $("status");
  const librarySection = document.querySelector(".library-section");
  const readerView = $("reader-view");
  const viewer = $("viewer");

  if (!uploadInput || !bookshelf || !readerView || !viewer) {
    console.error("SenpaiReads: Required HTML elements are missing.");
    return;
  }

  if (!window.ePub || !window.localforage) {
    if (status) status.textContent =
      "Reader libraries did not load. Check your connection and refresh.";
    return;
  }

  localforage.config({
    name: "SenpaiReads",
    storeName: "books"
  });

  let activeBook = null;
  let rendition = null;
  let activePdfDocument = null;
  let activePdfPage = 1;
  let activeBookId = null;
  let isOpening = false;
  let currentTheme = "warm";
  let currentFont = "serif";
  let currentFontSize = 19;
  let currentLineSpacing = 1.8;
  let currentMargin = 9;
  let isFullscreen = false;

  const prevButtonRef = $("prev-button");
  const nextButtonRef = $("next-button");
  const bookGrid = bookshelf;
  const readerContent = viewer;
  const prevPageButton = prevButtonRef;
  const nextPageButton = nextButtonRef;
  const closeReaderButton = $("back-button");
  let chapterSelect = null;

  const themes = {
    warm: {
      label: "Warm Paper",
      background: "#f4efe5",
      foreground: "#302d28",
      link: "#7655a4"
    },
    light: {
      label: "Pure White",
      background: "#ffffff",
      foreground: "#222222",
      link: "#5741a5"
    },
    sage: {
      label: "Sage",
      background: "#e4eadf",
      foreground: "#273329",
      link: "#42684b"
    },
    dark: {
      label: "Dark",
      background: "#191a20",
      foreground: "#e6e3eb",
      link: "#c4a7ff"
    }
  };

  const fonts = {
    serif: 'Georgia, "Times New Roman", serif',
    sans: 'Arial, Helvetica, sans-serif',
    readable: 'Verdana, Arial, sans-serif'
  };

  function setStatus(message, error = false) {
    if (!status) return;
    status.textContent = message;
    status.style.color = error ? "#ff8b96" : "";
  }

  function updateCount() {
    const count = bookshelf.querySelectorAll(".book-card").length;
    const counter = $("book-count");
    if (counter) counter.textContent = count;
    if (emptyState) emptyState.hidden = count > 0;
  }

  function fallbackCover(title) {
    const box = document.createElement("div");
    box.className = "cover-fallback";

    const icon = document.createElement("span");
    icon.textContent = "本";

    const text = document.createElement("strong");
    text.textContent = title;

    box.append(icon, text);
    return box;
  }

  async function createBook(data) {
    const book = ePub();
    try {
      await book.open(data, "binary");
      await book.ready;
      return book;
    } catch (error) {
      try { book.destroy(); } catch (_) {}
      throw error;
    }
  }

  function applyReaderSettings() {
    if (!rendition) return;
    const selected = themes[currentTheme] || themes.warm;

    rendition.themes.select(currentTheme);
    rendition.themes.override("font-family", fonts[currentFont]);
    rendition.themes.override("font-size", `${currentFontSize}px`);
    rendition.themes.override("line-height", String(currentLineSpacing));
    rendition.themes.override("color", selected.foreground);
    rendition.themes.override("background", selected.background);

    viewer.style.background = selected.background;
    viewer.style.color = selected.foreground;
    viewer.style.setProperty("--reader-margin", `${currentMargin}%`);
  }

  function registerThemes() {
    if (!rendition) return;

    for (const [name, theme] of Object.entries(themes)) {
      rendition.themes.register(name, {
        body: {
          color: `${theme.foreground} !important`,
          background: `${theme.background} !important`,
          "font-family": `${fonts[currentFont]} !important`,
          "font-size": `${currentFontSize}px !important`,
          "line-height": `${currentLineSpacing} !important`,
          "padding-left": `${currentMargin}% !important`,
          "padding-right": `${currentMargin}% !important`,
          "box-sizing": "border-box"
        },
        p: {
          "line-height": `${currentLineSpacing} !important`,
          "margin-top": "0.7em !important",
          "margin-bottom": "0.7em !important"
        },
        a: {
          color: `${theme.link} !important`
        },
        img: {
          "max-width": "100% !important",
          "height": "auto !important"
        }
      });
    }

    rendition.themes.select(currentTheme);
    applyReaderSettings();
  }

  function injectReaderStyles() {
    if ($("senpai-reader-styles")) return;

    const style = document.createElement("style");
    style.id = "senpai-reader-styles";
    style.textContent = `
      .reader-toolbar { gap: 10px; }

      .senpai-reader-options {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 9px;
        padding: 12px 16px;
        background: var(--surface, #191a1f);
        border-top: 1px solid rgba(255,255,255,.08);
      }

      .senpai-reader-options select,
      .senpai-reader-options input,
      .senpai-reader-options button {
        max-width: 100%;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 8px;
        padding: 8px 10px;
        background: #222329;
        color: #f3f0e9;
        font: inherit;
      }

      .senpai-reader-options select { min-width: 115px; }

      .senpai-reader-options label {
        display: flex;
        align-items: center;
        gap: 7px;
        color: #c7c3d0;
        font-size: .8rem;
      }

      .senpai-reader-options input[type="range"] {
        width: 90px;
        padding: 0;
        accent-color: #b7a0ff;
      }

      .senpai-reader-options button { cursor: pointer; }
      .senpai-reader-options button:hover { border-color: #b7a0ff; }

      .senpai-reader-options .reader-value {
        color: #b7a0ff;
        min-width: 28px;
      }

      #reader-view.senpai-fullscreen {
        position: fixed;
        inset: 0;
        z-index: 99999;
        width: 100%;
        height: 100%;
        margin: 0;
        border: 0;
        border-radius: 0;
        overflow: auto;
        background: var(--reader-bg, #f4efe5);
      }

      #reader-view.senpai-fullscreen .viewer {
        height: calc(100vh - 145px) !important;
        min-height: 250px;
      }

      #reader-view.senpai-fullscreen.toolbar-hidden .reader-toolbar,
      #reader-view.senpai-fullscreen.toolbar-hidden .senpai-reader-options {
        display: none;
      }

      #reader-view.senpai-fullscreen.toolbar-hidden .viewer {
        height: 100vh !important;
      }

      .senpai-reader-progress {
        width: 100%;
        height: 3px;
        background: rgba(128,128,128,.25);
      }

      .senpai-reader-progress-fill {
        width: 0;
        height: 100%;
        background: #a88cf7;
        transition: width .2s ease;
      }

      @media (max-width: 650px) {
        .senpai-reader-options { gap: 7px; padding: 10px; }
        .senpai-reader-options select { min-width: 105px; }
        .senpai-reader-options input[type="range"] { width: 65px; }

        #reader-view.senpai-fullscreen .viewer {
          height: calc(100dvh - 190px) !important;
        }
      }

      #viewer.pdf-viewer {
        overflow: auto;
        padding: 18px;
        box-sizing: border-box;
        background: #24242b;
        text-align: center;
      }

      #viewer.pdf-viewer .pdf-page-wrap {
        margin: 0 auto 18px;
        width: fit-content;
        max-width: 100%;
        background: #fff;
        box-shadow: 0 5px 24px rgba(0,0,0,.3);
      }

      #viewer.pdf-viewer canvas {
        display: block;
        max-width: 100%;
        height: auto;
      }

      #viewer.pdf-viewer .pdf-page-status {
        color: #f3f0e9;
        padding: 10px;
        font-size: .9rem;
      }
    `;
    document.head.appendChild(style);
  }
    function addReaderControls() {
    const toolbar = readerView.querySelector(".reader-toolbar");
    if (!toolbar) return;

    let controls = $("senpai-reader-options");

    if (!controls) {
      controls = document.createElement("div");
      controls.id = "senpai-reader-options";
      controls.className = "senpai-reader-options";

      const themeSelect = document.createElement("select");
      themeSelect.setAttribute("aria-label", "Reading theme");

      for (const [value, item] of Object.entries(themes)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = item.label;
        themeSelect.appendChild(option);
      }

      themeSelect.value = currentTheme;
      themeSelect.addEventListener("change", () => {
        currentTheme = themeSelect.value;
        applyReaderSettings();
        saveSettings();
      });

      const fontSelect = document.createElement("select");
      fontSelect.setAttribute("aria-label", "Reading font");

      for (const [value, label] of [
        ["serif", "Book Serif"],
        ["sans", "Modern Sans"],
        ["readable", "Readable Sans"]
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        fontSelect.appendChild(option);
      }

      fontSelect.value = currentFont;
      fontSelect.addEventListener("change", () => {
        currentFont = fontSelect.value;
        applyReaderSettings();
        saveSettings();
      });

      function addRangeControl(label, min, max, step, initial, onChange) {
        const wrapper = document.createElement("label");
        wrapper.append(label);

        const input = document.createElement("input");
        input.type = "range";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(initial);

        const value = document.createElement("span");
        value.className = "reader-value";

        const update = () => {
          const result = onChange(Number(input.value));
          value.textContent = result;
          applyReaderSettings();
          saveSettings();
        };

        input.addEventListener("input", update);
        wrapper.append(input, value);
        update();
        return wrapper;
      }

      const sizeControl = addRangeControl(
        "Text", 12, 34, 1, currentFontSize,
        value => {
          currentFontSize = value;
          return `${value}px`;
        }
      );

      const spacingControl = addRangeControl(
        "Spacing", 1.2, 2.4, 0.1, currentLineSpacing,
        value => {
          currentLineSpacing = value;
          return `${value.toFixed(1)}×`;
        }
      );

      const marginControl = addRangeControl(
        "Margins", 2, 16, 1, currentMargin,
        value => {
          currentMargin = value;
          return `${value}%`;
        }
      );

      const tocSelect = document.createElement("select");
      tocSelect.id = "senpai-toc";
      chapterSelect = tocSelect;
      tocSelect.setAttribute("aria-label", "Chapter navigation");

      const firstChapter = document.createElement("option");
      firstChapter.value = "";
      firstChapter.textContent = "Chapters";
      tocSelect.appendChild(firstChapter);

      tocSelect.addEventListener("change", () => {
        if (rendition && tocSelect.value) {
          rendition.display(tocSelect.value).catch(console.warn);
        }
      });

      const fullscreenButton = document.createElement("button");
      fullscreenButton.type = "button";
      fullscreenButton.textContent = "⛶ Full screen";
      fullscreenButton.addEventListener("click", toggleFullscreen);

      const hideButton = document.createElement("button");
      hideButton.type = "button";
      hideButton.textContent = "Hide controls";
      hideButton.addEventListener("click", () => {
        readerView.classList.toggle("toolbar-hidden");
        hideButton.textContent =
          readerView.classList.contains("toolbar-hidden")
            ? "Show controls"
            : "Hide controls";
      });

      controls.append(
        themeSelect, fontSelect, sizeControl,
        spacingControl, marginControl, tocSelect,
        fullscreenButton, hideButton
      );

      const progress = document.createElement("div");
      progress.className = "senpai-reader-progress";

      const fill = document.createElement("div");
      fill.id = "senpai-progress-fill";
      fill.className = "senpai-reader-progress-fill";
      progress.appendChild(fill);

      readerView.insertBefore(controls, viewer);
      readerView.insertBefore(progress, viewer);
    }
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await readerView.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      isFullscreen = !isFullscreen;
      readerView.classList.toggle("senpai-fullscreen", isFullscreen);
    }
  }

  document.addEventListener("fullscreenchange", () => {
    isFullscreen = Boolean(document.fullscreenElement);
    readerView.classList.toggle("senpai-fullscreen", isFullscreen);
  });

  function saveSettings() {
    try {
      localStorage.setItem("senpaireads-settings", JSON.stringify({
        theme: currentTheme,
        font: currentFont,
        fontSize: currentFontSize,
        lineSpacing: currentLineSpacing,
        margin: currentMargin
      }));
    } catch (_) {}
  }

  function loadSettings() {
    try {
      const settings = JSON.parse(
        localStorage.getItem("senpaireads-settings") || "{}"
      );

      if (themes[settings.theme]) currentTheme = settings.theme;
      if (fonts[settings.font]) currentFont = settings.font;

      if (Number.isFinite(settings.fontSize)) {
        currentFontSize = Math.min(34, Math.max(12, settings.fontSize));
      }

      if (Number.isFinite(settings.lineSpacing)) {
        currentLineSpacing = Math.min(2.4, Math.max(1.2, settings.lineSpacing));
      }

      if (Number.isFinite(settings.margin)) {
        currentMargin = Math.min(16, Math.max(2, settings.margin));
      }
    } catch (_) {}
  }

  function updateProgress(location) {
    const fill = $("senpai-progress-fill");
    if (!fill || !location?.start) return;

    const percentage = location.start.percentage;
    if (Number.isFinite(percentage)) {
      fill.style.width =
        `${Math.max(0, Math.min(100, percentage * 100))}%`;
    }
  }

  async function destroyReader() {
    try {
      if (rendition) rendition.destroy();
    } catch (_) {}

    try {
      if (activeBook) activeBook.destroy();
    } catch (_) {}

    try {
      if (activePdfDocument) await activePdfDocument.destroy();
    } catch (_) {}

    rendition = null;
    activeBook = null;
    activePdfDocument = null;
    activePdfPage = 1;
    activeBookId = null;
    viewer.classList.remove("pdf-viewer");
    viewer.replaceChildren();
  }

  async function closeReader() {
    await destroyReader();
    readerView.hidden = true;
    readerView.classList.remove("active", "toolbar-hidden");
    document.body.classList.remove("reading");
    if (librarySection) librarySection.hidden = false;

    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch (_) {}
    }

    setStatus("Back at your bookshelf.");
  }

  async function renderPdfPage(pageNumber) {
    if (!activePdfDocument) return;

    activePdfPage = Math.max(
      1, Math.min(activePdfDocument.numPages, pageNumber)
    );

    const page = await activePdfDocument.getPage(activePdfPage);
    const base = page.getViewport({ scale: 1 });
    const available = Math.max(280, (viewer.clientWidth || 800) - 36);
    const scale = Math.min(2, available / base.width);
    const viewport = page.getViewport({ scale });

    viewer.replaceChildren();
    viewer.classList.add("pdf-viewer");

    const wrapper = document.createElement("div");
    wrapper.className = "pdf-page-wrap";

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    const ratio = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    wrapper.appendChild(canvas);
    viewer.appendChild(wrapper);

    await page.render({
      canvasContext: context,
      viewport,
      transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null
    }).promise;

    const pageStatus = document.createElement("div");
    pageStatus.className = "pdf-page-status";
    pageStatus.textContent =
      `Page ${activePdfPage} of ${activePdfDocument.numPages}`;
    viewer.appendChild(pageStatus);

    const fill = $("senpai-progress-fill");
    if (fill) {
      fill.style.width =
        `${activePdfPage / activePdfDocument.numPages * 100}%`;
    }

    if (activeBookId) {
      localforage.setItem(`progress_${activeBookId}`, {
        page: activePdfPage
      }).catch(console.warn);
    }

    if (prevButtonRef) prevButtonRef.disabled = activePdfPage <= 1;
    if (nextButtonRef) {
      nextButtonRef.disabled =
        activePdfPage >= activePdfDocument.numPages;
    }
  }
  
async function openPdf(id, data, title) {
  try {
    setStatus("Opening PDF...");

    if (!window.pdfjsLib) {
      throw new Error("PDF.js is not loaded. Check index.html.");
    }
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    const buffer = data instanceof Blob
      ? await data.arrayBuffer()
      : data instanceof ArrayBuffer
        ? data.slice(0)
        : data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength
          );

    const bytes = new Uint8Array(buffer.slice(0));

    activeBookId = id;
    readerTitle.textContent = title;
    readerView.hidden = false;
    readerView.classList.add("active");
    if (librarySection) librarySection.hidden = true;
    document.body.classList.add("reading");

    activePdfDocument = await pdfjsLib.getDocument({
      data: bytes
    }).promise;

    const savedProgress = await localforage.getItem("progress_" + id);
    const savedPage = Number(
      savedProgress && typeof savedProgress === "object"
        ? savedProgress.page
        : savedProgress
    ) || 1;

    activePdfPage = Math.min(
      Math.max(1, savedPage),
      activePdfDocument.numPages
    );

    addReaderControls();
    await renderPdfPage(activePdfPage);

    setStatus(
      `PDF opened · ${activePdfDocument.numPages} pages`
    );
  } catch (error) {
    console.error("PDF opening failed:", error);
    setStatus("Could not open PDF: " + error.message);
  }
}

async function openBook(id, data, title) {
  try {
    if (!window.ePub) {
      throw new Error("EPUB.js is not loaded. Check index.html.");
    }

    setStatus("Opening EPUB...");

    await destroyReader();

    activeBookId = id;
    readerTitle.textContent = title;
    readerView.hidden = false;
    readerView.classList.add("active");
    if (librarySection) librarySection.hidden = true;
    document.body.classList.add("reading");

    const book = ePub(data);
    activeBook = book;

    rendition = book.renderTo(readerContent, {
      width: "100%",
      height: "100%",
      spread: "auto",
      flow: "paginated"
    });

    registerThemes();

    await book.ready;
    addReaderControls();

    if (book.navigation && book.navigation.toc) {
      const toc = book.navigation.toc;
      chapterSelect.innerHTML =
        '<option value="">Select chapter</option>';

      function addChapters(items, prefix = "") {
        items.forEach((item, index) => {
          const option = document.createElement("option");
          option.value = item.href;
          option.textContent =
            prefix + (item.label || `Chapter ${index + 1}`).trim();

          chapterSelect.appendChild(option);

          if (item.subitems && item.subitems.length) {
            addChapters(item.subitems, "— ");
          }
        });
      }

      addChapters(toc);
    }

    const saved = await localforage.getItem("progress_" + id);

    rendition.on("relocated", async location => {
      if (!location || !location.start) return;

      const progress = {
        href: location.start.href,
        cfi: location.start.cfi
      };

      await localforage.setItem(
        "progress_" + id,
        progress
      );

      updateProgress(location);
    });

    if (saved && saved.cfi) {
      await rendition.display(saved.cfi);
    } else {
      await rendition.display();
    }

    setStatus("EPUB opened");
  } catch (error) {
    console.error("EPUB opening failed:", error);
    setStatus("Could not open EPUB: " + error.message);
  }
}

async function displayBook(id, record) {
  const data = record.data;
  const title = record.title || "Untitled book";
  const author = record.author || "Unknown author";

  const card = document.createElement("article");
  card.className = "book-card";

  const cover = document.createElement("div");
  cover.className = "book-cover";

  if (record.cover) {
    const image = document.createElement("img");
    image.src = record.cover;
    image.alt = title + " cover";
    cover.appendChild(image);
  } else {
    cover.appendChild(fallbackCover(title));
  }

  const details = document.createElement("div");
  details.className = "book-details";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const authorText = document.createElement("p");
  authorText.textContent = author;

  const typeText = document.createElement("small");
  typeText.textContent = record.type === "pdf" ? "PDF" : "EPUB";

  const openButton = document.createElement("button");
  openButton.textContent = "Read";
  openButton.addEventListener("click", async () => {
    if (record.type === "pdf") {
      await openPdf(id, data, title);
    } else {
      await openBook(id, data, title);
    }
  });

  const deleteButton = document.createElement("button");
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", async () => {
    if (!confirm(`Delete "${title}" from your library?`)) return;

    await localforage.removeItem(id);
    await localforage.removeItem("progress_" + id);
    card.remove();
    updateCount();
    setStatus("Book deleted");
  });

  details.append(heading, authorText, typeText);
  details.append(openButton, deleteButton);
  card.append(cover, details);
  bookGrid.appendChild(card);
}

async function loadLibrary() {
  try {
    setStatus("Preparing your library...");
    bookGrid.innerHTML = "";

    const keys = await localforage.keys();

    for (const key of keys) {
      if (key.startsWith("progress_")) continue;

      const record = await localforage.getItem(key);

      if (!record || !record.data) continue;

      await displayBook(key, record);
    }

    updateCount();
    setStatus("Your library is ready");
  } catch (error) {
    console.error("Library loading failed:", error);
    setStatus("Library error: " + error.message);
  }
}

async function handleUpload(event) {
  const files = Array.from(event.target.files || []);

  if (!files.length) return;

  for (const file of files) {
    try {
      const extension = file.name.split(".").pop().toLowerCase();

      if (!["epub", "pdf"].includes(extension)) {
        setStatus("Only EPUB and PDF files are supported");
        continue;
      }

      setStatus("Importing " + file.name + "...");

      const id = "book_" + Date.now() + "_" +
        Math.random().toString(36).slice(2, 8);

      const isPdf = extension === "pdf";
      const fileBuffer = await file.arrayBuffer();

      if (isPdf) {
        if (!window.pdfjsLib) {
          throw new Error("PDF.js is not loaded in index.html.");
        }

        // Validate using a separate copy so PDF.js cannot detach
        // the buffer that will be stored in the library.
        await pdfjsLib.getDocument({
          data: new Uint8Array(fileBuffer.slice(0))
        }).promise.then(pdf => pdf.destroy());

        const record = {
          title: file.name.replace(/\.pdf$/i, ""),
          author: "Unknown author",
          type: "pdf",
          data: new Blob([fileBuffer.slice(0)], {
            type: "application/pdf"
          }),
          addedAt: Date.now()
        };

        await localforage.setItem(id, record);
      } else {
        const record = {
          title: file.name.replace(/\.epub$/i, ""),
          author: "Unknown author",
          type: "epub",
          data: fileBuffer.slice(0),
          addedAt: Date.now()
        };

        await localforage.setItem(id, record);
      }

      setStatus(file.name + " added successfully");
    } catch (error) {
      console.error("Import failed:", file.name, error);
      setStatus("Import failed: " + error.message);
    }
  }

  event.target.value = "";
  await loadLibrary();
}

// Reader navigation
if (prevPageButton) {
  prevPageButton.addEventListener("click", async () => {
    if (rendition) {
      await rendition.prev();
    } else if (activePdfDocument && activePdfPage > 1) {
      activePdfPage--;
      await renderPdfPage(activePdfPage);
      await localforage.setItem(
        "progress_" + activeBookId,
        activePdfPage
      );
    }
  });
}

if (nextPageButton) {
  nextPageButton.addEventListener("click", async () => {
    if (rendition) {
      await rendition.next();
    } else if (
      activePdfDocument &&
      activePdfPage < activePdfDocument.numPages
    ) {
      activePdfPage++;
      await renderPdfPage(activePdfPage);
      await localforage.setItem(
        "progress_" + activeBookId,
        activePdfPage
      );
    }
  });
}

if (closeReaderButton) {
  closeReaderButton.addEventListener("click", closeReader);
}

if (uploadInput) {
  uploadInput.addEventListener("change", handleUpload);
}

if (chapterSelect) {
  chapterSelect.addEventListener("change", async () => {
    if (rendition && chapterSelect.value) {
      await rendition.display(chapterSelect.value);
    }
  });
}

document.addEventListener("keydown", event => {
  if (!readerView.classList.contains("active")) return;

  if (event.key === "Escape") {
    closeReader();
  } else if (event.key === "ArrowLeft" && rendition) {
    rendition.prev();
  } else if (event.key === "ArrowRight" && rendition) {
    rendition.next();
  }
});

// Start the app
loadSettings();
injectReaderStyles();
loadLibrary();

})();