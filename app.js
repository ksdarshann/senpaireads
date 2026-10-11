
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
  const backButton = $("back-button");
  const prevButton = $("prev-button");
  const nextButton = $("next-button");

  if (!uploadInput || !bookshelf || !readerView || !viewer) {
    console.error("SenpaiReads: Required HTML elements are missing.");
    return;
  }

  if (!window.ePub || !window.localforage) {
    if (status) status.textContent =
      "Reader libraries did not load. Check your connection and refresh.";
    return;
  }

  localforage.config({ name: "SenpaiReads", storeName: "books" });

  let activeBook = null;
  let rendition = null;
  let activePdfDocument = null;
  let activePdfPage = 1;
  let activeBookId = null;
  let isOpening = false;
  let isFullscreen = false;
  let currentTheme = "warm";
  let currentFont = "serif";
  let currentFontSize = 19;
  let currentLineSpacing = 1.8;
  let currentMargin = 9;

  const themes = {
    warm: { label: "Warm Paper", background: "#f4efe5", foreground: "#302d28", link: "#7655a4" },
    light: { label: "Pure White", background: "#ffffff", foreground: "#222222", link: "#5741a5" },
    sage: { label: "Sage", background: "#e4eadf", foreground: "#273329", link: "#42684b" },
    dark: { label: "Dark", background: "#191a20", foreground: "#e6e3eb", link: "#c4a7ff" }
  };

  const fonts = {
    serif: 'Georgia, "Times New Roman", serif',
    sans: "Arial, Helvetica, sans-serif",
    readable: "Verdana, Arial, sans-serif"
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
      const s = JSON.parse(localStorage.getItem("senpaireads-settings") || "{}");
      if (themes[s.theme]) currentTheme = s.theme;
      if (fonts[s.font]) currentFont = s.font;
      if (Number.isFinite(s.fontSize)) currentFontSize = Math.max(12, Math.min(34, s.fontSize));
      if (Number.isFinite(s.lineSpacing)) currentLineSpacing = Math.max(1.2, Math.min(2.4, s.lineSpacing));
      if (Number.isFinite(s.margin)) currentMargin = Math.max(2, Math.min(16, s.margin));
    } catch (_) {}
  }

  function injectReaderStyles() {
    if ($("senpai-reader-styles")) return;
    const style = document.createElement("style");
    style.id = "senpai-reader-styles";
    style.textContent = `
      .reader-toolbar{gap:10px}
      .senpai-reader-options{display:flex;flex-wrap:wrap;align-items:center;gap:9px;padding:12px 16px;background:var(--surface,#191a1f);border-top:1px solid rgba(255,255,255,.08)}
      .senpai-reader-options select,.senpai-reader-options input,.senpai-reader-options button{max-width:100%;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:8px 10px;background:#222329;color:#f3f0e9;font:inherit}
      .senpai-reader-options select{min-width:115px}
      .senpai-reader-options label{display:flex;align-items:center;gap:7px;color:#c7c3d0;font-size:.8rem}
      .senpai-reader-options input[type=range]{width:90px;padding:0;accent-color:#b7a0ff}
      .senpai-reader-options button{cursor:pointer}
      .senpai-reader-options button:hover{border-color:#b7a0ff}
      .senpai-reader-options .reader-value{color:#b7a0ff;min-width:28px}
      #reader-view.senpai-fullscreen{position:fixed;inset:0;z-index:99999;width:100%;height:100%;margin:0;border:0;border-radius:0;overflow:auto;background:var(--reader-bg,#f4efe5)}
      #reader-view.senpai-fullscreen .viewer{height:calc(100vh - 145px)!important;min-height:250px}
      #reader-view.senpai-fullscreen.toolbar-hidden .reader-toolbar,#reader-view.senpai-fullscreen.toolbar-hidden .senpai-reader-options{display:none}
      #reader-view.senpai-fullscreen.toolbar-hidden .viewer{height:100vh!important}
      .senpai-reader-progress{width:100%;height:3px;background:rgba(128,128,128,.25)}
      .senpai-reader-progress-fill{width:0;height:100%;background:#a88cf7;transition:width .2s ease}
      #viewer.pdf-viewer{overflow:auto;padding:18px;box-sizing:border-box;background:#24242b;text-align:center}
      #viewer.pdf-viewer .pdf-page-wrap{margin:0 auto 18px;width:fit-content;max-width:100%;background:#fff;box-shadow:0 5px 24px rgba(0,0,0,.3)}
      #viewer.pdf-viewer canvas{display:block;max-width:100%;height:auto}
      #viewer.pdf-viewer .pdf-page-status{color:#f3f0e9;padding:10px;font-size:.9rem}
      .pdf-cover{position:relative;background:#292735}
      .pdf-cover-badge{display:block;margin:12px;padding:8px;background:#a88cf7;color:#17151f;border-radius:6px;font-weight:bold}
      @media(max-width:650px){.senpai-reader-options{gap:7px;padding:10px}.senpai-reader-options select{min-width:105px}.senpai-reader-options input[type=range]{width:65px}#reader-view.senpai-fullscreen .viewer{height:calc(100dvh - 190px)!important}}
    `;
    document.head.appendChild(style);
  }

  function applyReaderSettings() {
    const selected = themes[currentTheme] || themes.warm;
    viewer.style.background = selected.background;
    viewer.style.color = selected.foreground;
    viewer.style.setProperty("--reader-margin", `${currentMargin}%`);

    if (rendition) {
      rendition.themes.select(currentTheme);
      rendition.themes.override("font-family", fonts[currentFont]);
      rendition.themes.override("font-size", `${currentFontSize}px`);
      rendition.themes.override("line-height", String(currentLineSpacing));
      rendition.themes.override("color", selected.foreground);
      rendition.themes.override("background", selected.background);
    }
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
        a: { color: `${theme.link} !important` },
        img: { "max-width": "100% !important", height: "auto !important" }
      });
    }
    applyReaderSettings();
  }

  function addReaderControls() {
    if ($("senpai-reader-options")) return;

    const controls = document.createElement("div");
    controls.id = "senpai-reader-options";
    controls.className = "senpai-reader-options";

    function makeSelect(id, label, options, selected, callback) {
      const select = document.createElement("select");
      select.id = id;
      select.setAttribute("aria-label", label);
      options.forEach(([value, text]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        select.appendChild(option);
      });
      select.value = selected;
      select.addEventListener("change", () => callback(select.value));
      return select;
    }

    controls.appendChild(makeSelect(
      "senpai-theme", "Reading theme",
      Object.entries(themes).map(([k, v]) => [k, v.label]),
      currentTheme, (v) => { currentTheme = v; applyReaderSettings(); saveSettings(); }
    ));

    controls.appendChild(makeSelect(
      "senpai-font", "Reading font",
      [["serif", "Book Serif"], ["sans", "Modern Sans"], ["readable", "Readable Sans"]],
      currentFont, (v) => { currentFont = v; applyReaderSettings(); saveSettings(); }
    ));

    function makeRange(labelText, min, max, step, value, suffix, callback) {
      const label = document.createElement("label");
      label.append(labelText);
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      input.setAttribute("aria-label", labelText);
      const output = document.createElement("span");
      output.className = "reader-value";
      output.textContent = `${value}${suffix}`;
      input.addEventListener("input", () => {
        const v = Number(input.value);
        output.textContent = `${v}${suffix}`;
        callback(v);
        saveSettings();
      });
      label.append(input, output);
      return label;
    }

    controls.appendChild(makeRange("Text", 12, 34, 1, currentFontSize, "px", v => {
      currentFontSize = v; applyReaderSettings();
    }));
    controls.appendChild(makeRange("Spacing", 1.2, 2.4, 0.1, currentLineSpacing, "×", v => {
      currentLineSpacing = v; applyReaderSettings();
    }));
    controls.appendChild(makeRange("Margins", 2, 16, 1, currentMargin, "%", v => {
      currentMargin = v; applyReaderSettings();
    }));

    const toc = document.createElement("select");
    toc.id = "senpai-toc";
    toc.setAttribute("aria-label", "Chapter navigation");
    const first = document.createElement("option");
    first.value = "";
    first.textContent = "Chapters";
    toc.appendChild(first);
    toc.addEventListener("change", () => {
      if (rendition && toc.value) rendition.display(toc.value).catch(console.warn);
    });
    controls.appendChild(toc);

    const fullscreen = document.createElement("button");
    fullscreen.type = "button";
    fullscreen.id = "senpai-fullscreen";
    fullscreen.textContent = "⛶ Full screen";
    fullscreen.addEventListener("click", toggleFullscreen);
    controls.appendChild(fullscreen);

    const hide = document.createElement("button");
    hide.type = "button";
    hide.textContent = "Hide controls";
    hide.addEventListener("click", () => {
      readerView.classList.toggle("toolbar-hidden");
      hide.textContent = readerView.classList.contains("toolbar-hidden") ? "Show controls" : "Hide controls";
    });
    controls.appendChild(hide);

    const progress = document.createElement("div");
    progress.className = "senpai-reader-progress";
    const fill = document.createElement("div");
    fill.id = "senpai-progress-fill";
    fill.className = "senpai-reader-progress-fill";
    progress.appendChild(fill);

    readerView.insertBefore(controls, viewer);
    readerView.insertBefore(progress, viewer);
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await readerView.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {
      isFullscreen = !isFullscreen;
      readerView.classList.toggle("senpai-fullscreen", isFullscreen);
    }
  }

  document.addEventListener("fullscreenchange", () => {
    isFullscreen = Boolean(document.fullscreenElement);
    readerView.classList.toggle("senpai-fullscreen", isFullscreen);
    const button = $("senpai-fullscreen");
    if (button) button.textContent = isFullscreen ? "⛶ Exit full screen" : "⛶ Full screen";
  });

  function updateProgress(location) {
    const fill = $("senpai-progress-fill");
    if (fill && location?.start && Number.isFinite(location.start.percentage)) {
      fill.style.width = `${Math.max(0, Math.min(100, location.start.percentage * 100))}%`;
    }
  }

  async function destroyReader() {
    try { if (rendition) rendition.destroy(); } catch (_) {}
    try { if (activeBook) activeBook.destroy(); } catch (_) {}
    try { if (activePdfDocument) await activePdfDocument.destroy(); } catch (_) {}

    rendition = null;
    activeBook = null;
    activePdfDocument = null;
    activePdfPage = 1;
    activeBookId = null;
    viewer.classList.remove("pdf-viewer");
    viewer.replaceChildren();

    if (prevButton) prevButton.disabled = false;
    if (nextButton) nextButton.disabled = false;
    const toc = $("senpai-toc");
    if (toc) toc.disabled = false;
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
    const base = page.getViewport({ scale: 1 });
    const width = Math.max(280, (viewer.clientWidth || 800) - 36);
    const scale = Math.min(2, width / base.width);
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
    pageStatus.textContent = `Page ${activePdfPage} of ${activePdfDocument.numPages}`;
    viewer.appendChild(pageStatus);

    const fill = $("senpai-progress-fill");
    if (fill) fill.style.width = `${activePdfPage / activePdfDocument.numPages * 100}%`;

    if (activeBookId) {
      await localforage.setItem(`progress_${activeBookId}`, { page: activePdfPage }).catch(console.warn);
    }

    if (prevButton) prevButton.disabled = activePdfPage <= 1;
    if (nextButton) nextButton.disabled = activePdfPage >= activePdfDocument.numPages;
  }

  async function openPdf(id, data, title) {
    if (isOpening) return;
    if (!window.pdfjsLib) {
      setStatus("PDF library did not load. Check your internet connection and refresh.", true);
      return;
    }

    isOpening = true;
    setStatus(`Opening PDF: ${title}…`);

    try {
      await destroyReader();
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

      activePdfDocument = await window.pdfjsLib.getDocument({
        data: data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data)
      }).promise;

      activeBookId = id;
      injectReaderStyles();
      addReaderControls();

      const titleElement = $("reader-title");
      if (titleElement) titleElement.textContent = title;

      const toc = $("senpai-toc");
      if (toc) {
        toc.replaceChildren();
        const option = document.createElement("option");
        option.textContent = "PDF pages";
        toc.appendChild(option);
        toc.disabled = true;
      }

      if (librarySection) librarySection.hidden = true;
      readerView.hidden = false;

      const saved = await localforage.getItem(`progress_${id}`);
      await renderPdfPage(saved?.page || 1);
      setStatus(`Now reading PDF: ${title}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Could not open PDF:", error);
      await destroyReader();
      setStatus(`Could not open PDF: ${error?.message || "Invalid or damaged PDF."}`, true);
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
      if (toc) {
        toc.disabled = false;
        toc.replaceChildren();
        const first = document.createElement("option");
        first.value = "";
        first.textContent = "Chapters";
        toc.appendChild(first);
      }

      const navigation = await activeBook.loaded.navigation;
      if (toc && navigation?.toc) {
        function addItems(items, depth = 0) {
          for (const item of items || []) {
            const option = document.createElement("option");
            option.value = item.href;
            option.textContent = `${"— ".repeat(depth)}${item.label || "Chapter"}`;
            toc.appendChild(option);
            if (item.subitems?.length) addItems(item.subitems, depth + 1);
          }
        }
        addItems(navigation.toc);
      }

      const saved = await localforage.getItem(`progress_${id}`);
      if (saved?.cfi) await rendition.display(saved.cfi);
      else await rendition.display();

      rendition.on("relocated", location => {
        updateProgress(location);
        if (location?.start?.cfi) {
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
      setStatus(`Could not open "${title}": ${error?.message || "Invalid EPUB."}`, true);
    } finally {
      isOpening = false;
    }
  }

  async function displayBook(id, record) {
    const data = record?.data || record;
    const title = record?.title || record?.name || "Untitled book";
    const author = record?.author || (record?.type === "pdf" ? "PDF document" : "EPUB");
    if (!data) return;

    const oldCard = Array.from(bookshelf.children).find(card => card.dataset.bookId === id);
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
    openButton.addEventListener("click", () => {
      if (record?.type === "pdf") openPdf(id, data, title);
      else openBook(id, data, title);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "×";
    deleteButton.title = `Delete ${title}`;

    deleteButton.addEventListener("click", async event => {
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

    if (record?.type === "pdf") {
      cover.classList.add("pdf-cover");
      const badge = document.createElement("span");
      badge.textContent = "PDF";
      badge.className = "pdf-cover-badge";
      cover.appendChild(badge);
      return;
    }

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
        if (String(item.id).startsWith("progress_")) continue;
        await displayBook(item.id, item.record);
      }

      updateCount();
      setStatus(records.length ? "Your bookshelf is ready." : "Your library is ready. Add your first EPUB or PDF.");
    } catch (error) {
      console.error("Could not load library:", error);
      setStatus("Could not load your library. Refresh and try again.", true);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    uploadInput.value = "";
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const isPdf = lowerName.endsWith(".pdf") || file.type === "application/pdf";
    const isEpub = lowerName.endsWith(".epub") || file.type === "application/epub+zip";

    if (!isPdf && !isEpub) {
      setStatus("Please select an EPUB or PDF file.", true);
      return;
    }

    if (isPdf && !window.pdfjsLib) {
      setStatus("PDF support could not load. Check your internet connection and refresh.", true);
      return;
    }

    setStatus(`Importing "${file.name}"…`);
    let book;

    try {
      const data = await file.arrayBuffer();
      let title = file.name.replace(/\.(epub|pdf)$/i, "");
      let author = isPdf ? "PDF document" : "EPUB";

      if (isEpub) {
        book = await createBook(data);
        const metadata = await book.loaded.metadata;
        title = metadata?.title || title;
        author = metadata?.creator || "EPUB";
      } else {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        const check = await window.pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
        await check.destroy();
      }

      const id = `book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const record = {
        type: isPdf ? "pdf" : "epub",
        title,
        author,
        data,
        addedAt: new Date().toISOString()
      };

      await localforage.setItem(id, record);
      await displayBook(id, record);
      setStatus(`Added "${title}" to SenpaiReads.`);
    } catch (error) {
      console.error("Book import failed:", error);
      setStatus(`${isPdf ? "PDF" : "EPUB"} import failed: ${error?.message || "Invalid or damaged file."}`, true);
    } finally {
      if (book) {
        try { book.destroy(); } catch (_) {}
      }
    }
  }

  if (backButton) backButton.addEventListener("click", closeReader);

  if (prevButton) {
    prevButton.addEventListener("click", () => {
      if (activePdfDocument) renderPdfPage(activePdfPage - 1).catch(console.warn);
      else if (rendition) rendition.prev().catch(console.warn);
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      if (activePdfDocument) renderPdfPage(activePdfPage + 1).catch(console.warn);
      else if (rendition) rendition.next().catch(console.warn);
    });
  }

  document.addEventListener("keydown", event => {
    if (readerView.hidden || event.altKey || event.ctrlKey || event.metaKey) return;

    if (event.key === "Escape") {
      if (document.fullscreenElement) document.exitFullscreen().catch(console.warn);
      else if (isFullscreen) {
        isFullscreen = false;
        readerView.classList.remove("senpai-fullscreen");
      } else closeReader();
    }

    if (event.key === "ArrowLeft") {
      if (activePdfDocument) {
        event.preventDefault();
        renderPdfPage(activePdfPage - 1).catch(console.warn);
      } else if (rendition) {
        event.preventDefault();
        rendition.prev().catch(console.warn);
      }
    }

    if (event.key === "ArrowRight") {
      if (activePdfDocument) {
        event.preventDefault();
        renderPdfPage(activePdfPage + 1).catch(console.warn);
      } else if (rendition) {
        event.preventDefault();
        rendition.next().catch(console.warn);
      }
    }
  });

  loadSettings();
  injectReaderStyles();
  uploadInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];

  if (!file) return;

  status.textContent = `Selected: ${file.name}`;

  handleUpload(event);
});
  loadLibrary();
})();
