
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
  let savedProgress = {};
  let currentTheme = "warm";
  let currentFont = "serif";
  let currentFontSize = 19;
  let currentLineSpacing = 1.8;
  let currentMargin = 9;
  let isFullscreen = false;

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
    const count = bookshelf.querySelectorAll(".book-item").length;
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
      .reader-toolbar {
        gap: 10px;
      }

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

      .senpai-reader-options select {
        min-width: 115px;
      }

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

      .senpai-reader-options button {
        cursor: pointer;
      }

      .senpai-reader-options button:hover {
        border-color: #b7a0ff;
      }

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
        .senpai-reader-options {
          gap: 7px;
          padding: 10px;
        }

        .senpai-reader-options select {
          min-width: 105px;
        }

        .senpai-reader-options input[type="range"] {
          width: 65px;
        }

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
      themeSelect.id = "senpai-theme";
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
      fontSelect.id = "senpai-font";
      fontSelect.setAttribute("aria-label", "Reading font");

      [
        ["serif", "Book Serif"],
        ["sans", "Modern Sans"],
        ["readable", "Readable Sans"]
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        fontSelect.appendChild(option);
      });

      fontSelect.value = currentFont;
      fontSelect.addEventListener("change", () => {
        currentFont = fontSelect.value;
        applyReaderSettings();
        saveSettings();
      });

      const sizeLabel = document.createElement("label");
      sizeLabel.append("Text");

      const sizeInput = document.createElement("input");
      sizeInput.type = "range";
      sizeInput.min = "12";
      sizeInput.max = "34";
      sizeInput.value = String(currentFontSize);
      sizeInput.setAttribute("aria-label", "Font size");

      const sizeValue = document.createElement("span");
      sizeValue.className = "reader-value";
      sizeValue.textContent = `${currentFontSize}`;

      sizeInput.addEventListener("input", () => {
        currentFontSize = Number(sizeInput.value);
        sizeValue.textContent = String(currentFontSize);
        applyReaderSettings();
        saveSettings();
      });

      sizeLabel.append(sizeInput, sizeValue);

      const spacingLabel = document.createElement("label");
      spacingLabel.append("Spacing");

      const spacingInput = document.createElement("input");
      spacingInput.type = "range";
      spacingInput.min = "1.2";
      spacingInput.max = "2.4";
      spacingInput.step = "0.1";
      spacingInput.value = String(currentLineSpacing);
      spacingInput.setAttribute("aria-label", "Line spacing");

      const spacingValue = document.createElement("span");
      spacingValue.className = "reader-value";
      spacingValue.textContent = `${currentLineSpacing.toFixed(1)}×`;

      spacingInput.addEventListener("input", () => {
        currentLineSpacing = Number(spacingInput.value);
        spacingValue.textContent = `${currentLineSpacing.toFixed(1)}×`;
        applyReaderSettings();
        saveSettings();
      });

      spacingLabel.append(spacingInput, spacingValue);

      const marginLabel = document.createElement("label");
      marginLabel.append("Margins");

      const marginInput = document.createElement("input");
      marginInput.type = "range";
      marginInput.min = "2";
      marginInput.max = "16";
      marginInput.value = String(currentMargin);
      marginInput.setAttribute("aria-label", "Page margins");

      const marginValue = document.createElement("span");
      marginValue.className = "reader-value";
      marginValue.textContent = `${currentMargin}%`;

      marginInput.addEventListener("input", () => {
        currentMargin = Number(marginInput.value);
        marginValue.textContent = `${currentMargin}%`;
        applyReaderSettings();
        saveSettings();
      });

      marginLabel.append(marginInput, marginValue);

      const tocSelect = document.createElement("select");
      tocSelect.id = "senpai-toc";
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
      fullscreenButton.id = "senpai-fullscreen";
      fullscreenButton.textContent = "⛶ Full screen";

      fullscreenButton.addEventListener("click", toggleFullscreen);

      const hideToolbarButton = document.createElement("button");
      hideToolbarButton.type = "button";
      hideToolbarButton.textContent = "Hide controls";
      hideToolbarButton.addEventListener("click", () => {
        readerView.classList.toggle("toolbar-hidden");
        hideToolbarButton.textContent =
          readerView.classList.contains("toolbar-hidden")
            ? "Show controls"
            : "Hide controls";
      });

      const progress = document.createElement("div");
      progress.className = "senpai-reader-progress";

      const progressFill = document.createElement("div");
      progressFill.id = "senpai-progress-fill";
      progressFill.className = "senpai-reader-progress-fill";

      progress.appendChild(progressFill);

      controls.append(
        themeSelect,
        fontSelect,
        sizeLabel,
        spacingLabel,
        marginLabel,
        tocSelect,
        fullscreenButton,
        hideToolbarButton
      );

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
      // CSS fullscreen fallback when browser fullscreen is unavailable.
      isFullscreen = !isFullscreen;
      readerView.classList.toggle("senpai-fullscreen", isFullscreen);
    }
  }

  document.addEventListener("fullscreenchange", () => {
    isFullscreen = Boolean(document.fullscreenElement);
    readerView.classList.toggle(
      "senpai-fullscreen",
      isFullscreen
    );

    const button = $("senpai-fullscreen");
    if (button) {
      button.textContent = isFullscreen
        ? "⛶ Exit full screen"
        : "⛶ Full screen";
    }
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
    if (!fill || !location || !location.start) return;

    const percentage = location.start.percentage;
    if (Number.isFinite(percentage)) {
      fill.style.width = `${Math.max(0, Math.min(100, percentage * 100))}%`;
    }
  }

  async function destroyReader() {
    try {
      if (rendition) rendition.destroy();
    } catch (error) {
      console.warn(error);
    }

    try {
      if (activeBook) activeBook.destroy();
    } catch (error) {
      console.warn(error);
    }

    try {
      if (activePdfDocument) await activePdfDocument.destroy();
    } catch (error) {
      console.warn(error);
    }

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
    if (librarySection) librarySection.hidden = false;

    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch (_) {}
    }

    setStatus("Back at your bookshelf.");
  }

  async function renderPdfPage(pageNumber) {
    if (!activePdfDocument) return;

    activePdfPage = Math.max(1, Math.min(activePdfDocument.numPages, pageNumber));
    const page = await activePdfDocument.getPage(activePdfPage);
    const baseViewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(280, (viewer.clientWidth || 800) - 36);
    const scale = Math.min(2, availableWidth / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const ratio = window.devicePixelRatio || 1;

    viewer.replaceChildren();
    viewer.classList.add("pdf-viewer");

    const wrapper = document.createElement("div");
    wrapper.className = "pdf-page-wrap";

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
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
    pageStatus.textContent = `Page ${activePdfPage} of ${activePdfDocument.numPages}`;
    viewer.appendChild(pageStatus);

    const fill = $("senpai-progress-fill");
    if (fill) fill.style.width = `${activePdfPage / activePdfDocument.numPages * 100}%`;

    if (activeBookId) {
      localforage.setItem(`progress_${activeBookId}`, { page: activePdfPage })
        .catch(console.warn);
    }

    const prevButton = $("prev-button");
    const nextButton = $("next-button");
    if (prevButton) prevButton.disabled = activePdfPage <= 1;
    if (nextButton) nextButton.disabled = activePdfPage >= activePdfDocument.numPages;
  }

  async function openPdf(id, data, title) {
    if (isOpening) return;
    isOpening = true;
    setStatus(`Opening PDF "${title}"…`);

    try {
      if (!window.pdfjsLib) {
        throw new Error("PDF.js did not load. Check your internet connection and refresh.");
      }

      await destroyReader();

      const buffer = data instanceof Blob
        ? await data.arrayBuffer()
        : data instanceof ArrayBuffer
          ? data.slice(0)
          : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

      activePdfDocument = await pdfjsLib.getDocument({
        data: new Uint8Array(buffer.slice(0))
      }).promise;

      activeBookId = id;
      const titleElement = $("reader-title");
      if (titleElement) titleElement.textContent = title;

      if (librarySection) librarySection.hidden = true;
      readerView.hidden = false;

      addReaderControls();

      const saved = await localforage.getItem(`progress_${id}`);
      const savedPage = saved && typeof saved === "object" ? saved.page : saved;
      activePdfPage = Math.min(
        Math.max(1, Number(savedPage) || 1),
        activePdfDocument.numPages
      );

      await renderPdfPage(activePdfPage);
      setStatus(`Now reading PDF: ${title}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Could not open PDF:", error);
      await destroyReader();
      setStatus(`Could not open PDF "${title}": ${error?.message || "Invalid or damaged PDF."}`, true);
    } finally {
      isOpening = false;
    }
  }

  async function openBook(id, data, title) {
    if (isOpening) return;

    isOpening = true;
    setStatus(`Opening "${title}"…`);

    try {
      await destroyReader();

      activeBook = await createBook(data);

      rendition = activeBook.renderTo(viewer, {
        width: "100%",
        height: "100%",
        spread: "none",
        flow: "paginated"
      });

      registerThemes();
      injectReaderStyles();
      addReaderControls();

      const toc = $("senpai-toc");
      const navigation = await activeBook.loaded.navigation;

      if (toc && navigation && navigation.toc) {
        toc.replaceChildren();

        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "Chapters";
        toc.appendChild(defaultOption);

        function addTocItems(items, depth = 0) {
          for (const item of items || []) {
            const option = document.createElement("option");
            option.value = item.href;
            option.textContent = `${"— ".repeat(depth)}${item.label || "Chapter"}`;
            toc.appendChild(option);

            if (item.subitems && item.subitems.length) {
              addTocItems(item.subitems, depth + 1);
            }
          }
        }

        addTocItems(navigation.toc);
      }

      const previousLocation = await localforage.getItem(`progress_${id}`);

      if (previousLocation && previousLocation.cfi) {
        await rendition.display(previousLocation.cfi);
      } else {
        await rendition.display();
      }

      rendition.on("relocated", (location) => {
        updateProgress(location);

        if (location && location.start && location.start.cfi) {
          localforage.setItem(`progress_${id}`, {
            cfi: location.start.cfi,
            percentage: location.start.percentage || 0
          }).catch(console.warn);
        }
      });

      activeBookId = id;

      const titleElement = $("reader-title");
      if (titleElement) titleElement.textContent = title;

      if (librarySection) librarySection.hidden = true;
      readerView.hidden = false;

      applyReaderSettings();
      setStatus(`Now reading: ${title}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Could not open EPUB:", error);
      await destroyReader();

      setStatus(
        `Could not open "${title}": ${error?.message || "Unsupported or damaged EPUB."}`,
        true
      );
    } finally {
      isOpening = false;
    }
  }

  async function displayBook(id, record) {
    const data = record?.data || record;
    const title = record?.title || record?.name || "Untitled book";
    const author = record?.author || "EPUB";

    if (!data) return;

    const oldCard = Array.from(bookshelf.children).find(
      (card) => card.dataset.bookId === id
    );

    if (oldCard) oldCard.remove();

    const card = document.createElement("article");
    card.className = "book-item";
    card.dataset.bookId = id;

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "book-open";
    openButton.setAttribute("aria-label", `Read ${title}`);

    const cover = document.createElement("div");
    cover.className = "cover-wrap";
    cover.appendChild(fallbackCover(title));

    const name = document.createElement("p");
    name.className = "book-name";
    name.textContent = title;

    const meta = document.createElement("p");
    meta.className = "book-meta";
    meta.textContent = author;

    openButton.append(cover, name, meta);
    const bookType = record?.type || "epub";
    openButton.addEventListener("click", () => {
      if (bookType === "pdf") openPdf(id, data, title);
      else openBook(id, data, title);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "×";
    deleteButton.title = `Delete ${title}`;

    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();

      if (!confirm(`Remove "${title}" from SenpaiReads?`)) return;

      try {
        await localforage.removeItem(id);
        await localforage.removeItem(`progress_${id}`);
        card.remove();

        if (activeBookId === id) await closeReader();

        updateCount();
        setStatus(`Removed "${title}".`);
      } catch (error) {
        console.error(error);
        setStatus("Could not delete this book.", true);
      }
    });

    card.append(openButton, deleteButton);
    bookshelf.appendChild(card);
    updateCount();

    let coverBook;

    try {
      coverBook = await createBook(data);
      const url = await coverBook.coverUrl();

      if (url) {
        const image = document.createElement("img");
        image.alt = `Cover of ${title}`;
        image.src = url;
        image.onerror = () => cover.replaceChildren(fallbackCover(title));
        cover.replaceChildren(image);
      }
    } catch (error) {
      console.warn("Cover unavailable:", error);
    } finally {
      if (coverBook) {
        try { coverBook.destroy(); } catch (_) {}
      }
    }
  }

  async function loadLibrary() {
    setStatus("Loading your bookshelf…");
    bookshelf.replaceChildren();

    try {
      const records = [];

      await localforage.iterate((record, key) => {
        if (record) records.push({ id: key, record });
      });

      for (const item of records) {
        // Do not display reading progress entries as books.
        if (String(item.id).startsWith("progress_")) continue;
        await displayBook(item.id, item.record);
      }

      updateCount();
      setStatus(
        records.length
          ? "Your bookshelf is ready."
          : "Your library is ready. Add your first EPUB."
      );
    } catch (error) {
      console.error("Could not load library:", error);
      setStatus("Could not load your library. Refresh and try again.", true);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files && event.target.files[0];
    uploadInput.value = "";

    if (!file) return;

    const lowerName = file.name.toLowerCase();

    const isPdf = lowerName.endsWith(".pdf") || file.type === "application/pdf";
    const isEpub = lowerName.endsWith(".epub") || file.type === "application/epub+zip";

    if (!isPdf && !isEpub) {
      setStatus("Please select an EPUB or PDF file.", true);
      return;
    }

    setStatus(`Importing "${file.name}"…`);

    let book;

    try {
      const id = `book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const titleFromName = file.name.replace(/\.(epub|pdf)$/i, "");

      if (isPdf) {
        if (!window.pdfjsLib) {
          throw new Error("PDF.js did not load. Check your internet connection and refresh.");
        }

        const buffer = await file.arrayBuffer();
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const testDocument = await pdfjsLib.getDocument({
          data: new Uint8Array(buffer.slice(0))
        }).promise;
        const pageCount = testDocument.numPages;
        await testDocument.destroy();

        const record = {
          title: titleFromName,
          author: `PDF · ${pageCount} pages`,
          type: "pdf",
          data: new Blob([buffer.slice(0)], { type: "application/pdf" }),
          addedAt: new Date().toISOString()
        };

        await localforage.setItem(id, record);
        await displayBook(id, record);
        setStatus(`Added PDF "${record.title}" to SenpaiReads.`);
        return;
      }

      const data = await file.arrayBuffer();
      book = await createBook(data);

      const metadata = await book.loaded.metadata;
      const title = metadata?.title || titleFromName;
      const author = metadata?.creator || "EPUB";

      const record = {
        title,
        author,
        type: "epub",
        data,
        addedAt: new Date().toISOString()
      };

      await localforage.setItem(id, record);
      await displayBook(id, record);
      setStatus(`Added "${title}" to SenpaiReads.`);
    } catch (error) {
      console.error("Book import failed:", error);
      setStatus(
        `Import failed: ${error?.message || "Invalid or unsupported file."}`,
        true
      );
    } finally {
      if (book) {
        try { book.destroy(); } catch (_) {}
      }
    }
  }

  const backButton = $("back-button");
  const prevButton = $("prev-button");
  const nextButton = $("next-button");

  if (backButton) backButton.addEventListener("click", closeReader);

  if (prevButton) {
    prevButton.addEventListener("click", () => {
      if (rendition) rendition.prev().catch(console.warn);
      else if (activePdfDocument && activePdfPage > 1) {
        renderPdfPage(activePdfPage - 1).catch(console.warn);
      }
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      if (rendition) rendition.next().catch(console.warn);
      else if (activePdfDocument && activePdfPage < activePdfDocument.numPages) {
        renderPdfPage(activePdfPage + 1).catch(console.warn);
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (readerView.hidden || event.altKey || event.ctrlKey || event.metaKey) return;

    if (event.key === "Escape") {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(console.warn);
      } else if (isFullscreen) {
        isFullscreen = false;
        readerView.classList.remove("senpai-fullscreen");
      } else {
        closeReader();
      }
    }

    if (event.key === "ArrowLeft" && rendition) {
      event.preventDefault();
      rendition.prev().catch(console.warn);
    } else if (event.key === "ArrowLeft" && activePdfDocument && activePdfPage > 1) {
      event.preventDefault();
      renderPdfPage(activePdfPage - 1).catch(console.warn);
    }

    if (event.key === "ArrowRight" && rendition) {
      event.preventDefault();
      rendition.next().catch(console.warn);
    } else if (event.key === "ArrowRight" && activePdfDocument && activePdfPage < activePdfDocument.numPages) {
      event.preventDefault();
      renderPdfPage(activePdfPage + 1).catch(console.warn);
    }
  });

  loadSettings();
  injectReaderStyles();
  uploadInput.addEventListener("change", handleUpload);
  loadLibrary();
})();
