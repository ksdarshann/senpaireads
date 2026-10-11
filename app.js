
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
    if (status) status.textContent = "Setup error: required HTML elements are missing.";
    return;
  }

  if (!window.localforage || !window.ePub) {
    if (status) {
      status.textContent = "Reader libraries failed to load. Check your internet connection and refresh.";
      status.style.color = "#ff8b96";
    }
    return;
  }

  localforage.config({
    name: "SenpaiReads",
    storeName: "books",
    description: "Your personal EPUB bookshelf"
  });

  let activeBook = null;
  let activeRendition = null;
  let activeBookId = null;
  let isOpening = false;

  function setStatus(message, error = false) {
    if (!status) return;
    status.textContent = message;
    status.style.color = error ? "#ff8b96" : "";
  }

  function updateEmptyState() {
    const count = bookshelf.querySelectorAll(".book-item").length;

    if (emptyState) emptyState.hidden = count > 0;

    const counter = $("book-count");
    if (counter) counter.textContent = String(count);
  }

  function fallbackCover(title) {
    const fallback = document.createElement("div");
    fallback.className = "cover-fallback";

    const symbol = document.createElement("span");
    symbol.textContent = "本";

    const label = document.createElement("strong");
    label.textContent = title;

    fallback.append(symbol, label);
    return fallback;
  }

  async function createEpubBook(data) {
    const book = ePub();

    try {
      await book.open(data, "binary");
      await book.ready;
      return book;
    } catch (error) {
      try {
        book.destroy();
      } catch (_) {}
      throw error;
    }
  }

  async function destroyReader() {
    try {
      if (activeRendition) activeRendition.destroy();
    } catch (error) {
      console.warn("Rendition cleanup:", error);
    }

    try {
      if (activeBook) activeBook.destroy();
    } catch (error) {
      console.warn("Book cleanup:", error);
    }

    activeRendition = null;
    activeBook = null;
    activeBookId = null;
    viewer.replaceChildren();
  }

  async function closeReader() {
    await destroyReader();
    readerView.hidden = true;

    if (librarySection) librarySection.hidden = false;

    setStatus("Back at your bookshelf.");
  }

  async function openBook(id, data, title) {
    if (isOpening) return;

    isOpening = true;
    setStatus(`Opening "${title}"…`);

    try {
      await destroyReader();

      activeBook = await createEpubBook(data);

      activeRendition = activeBook.renderTo(viewer, {
        width: "100%",
        height: "100%",
        spread: "none",
        flow: "paginated"
      });

      await activeRendition.display();
      activeBookId = id;

      const titleElement = $("reader-title");
      if (titleElement) titleElement.textContent = title;

      if (librarySection) librarySection.hidden = true;
      readerView.hidden = false;

      setStatus(`Now reading: ${title}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Could not open EPUB:", error);
      await destroyReader();

      setStatus(
        `Could not open "${title}". ${error?.message || "The EPUB may be damaged or unsupported."}`,
        true
      );
    } finally {
      isOpening = false;
    }
  }

  async function displayBook(id, record) {
    // Support the current record format and older saved formats.
    const data = record?.data || record;
    const title = record?.title || record?.name || "Untitled book";
    const author = record?.author || "EPUB";

    if (!data) return;

    const existing = Array.from(bookshelf.children).find(
      (card) => card.dataset.bookId === id
    );

    if (existing) existing.remove();

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
    openButton.addEventListener("click", () => openBook(id, data, title));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "×";
    deleteButton.title = `Remove ${title}`;
    deleteButton.setAttribute("aria-label", `Delete ${title}`);

    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();

      if (!confirm(`Remove "${title}" from SenpaiReads?`)) return;

      try {
        await localforage.removeItem(id);
        card.remove();

        if (activeBookId === id) await closeReader();

        updateEmptyState();
        setStatus(`Removed "${title}".`);
      } catch (error) {
        console.error("Delete failed:", error);
        setStatus("Could not delete this book.", true);
      }
    });

    card.append(openButton, deleteButton);
    bookshelf.appendChild(card);
    updateEmptyState();

    let coverBook;

    try {
      coverBook = await createEpubBook(data);
      const coverUrl = await coverBook.coverUrl();

      if (coverUrl) {
        const image = document.createElement("img");
        image.alt = `Cover of ${title}`;
        image.src = coverUrl;

        image.onerror = () => {
          cover.replaceChildren(fallbackCover(title));
        };

        cover.replaceChildren(image);
      }
    } catch (error) {
      console.warn(`Cover unavailable for "${title}":`, error);
    } finally {
      if (coverBook) {
        try {
          coverBook.destroy();
        } catch (_) {}
      }
    }
  }

  async function loadLibrary() {
    setStatus("Loading your bookshelf…");
    bookshelf.replaceChildren();

    try {
      const savedBooks = [];

      await localforage.iterate((record, key) => {
        if (record) savedBooks.push({ id: key, record });
      });

      for (const item of savedBooks) {
        await displayBook(item.id, item.record);
      }

      updateEmptyState();

      setStatus(
        savedBooks.length
          ? `${savedBooks.length} saved item${savedBooks.length === 1 ? "" : "s"} in your library.`
          : "Your library is ready. Add your first EPUB to begin."
      );
    } catch (error) {
      console.error("Library loading failed:", error);
      setStatus("Could not load your library. Refresh and try again.", true);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    uploadInput.value = "";

    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isPDF =
      file.type === "application/pdf" || fileName.endsWith(".pdf");
    const isEPUB =
      file.type === "application/epub+zip" || fileName.endsWith(".epub");

    if (isPDF) {
      setStatus(
        "PDF conversion is not available yet. We'll add it next.",
        true
      );
      return;
    }

    if (!isEPUB) {
      setStatus("Please select an .epub file.", true);
      return;
    }

    setStatus(`Checking "${file.name}"…`);

    let validationBook;

    try {
      const data = await file.arrayBuffer();

      // Open as binary and validate before saving.
      validationBook = await createEpubBook(data);

      const metadata = await validationBook.loaded.metadata;
      const title =
        metadata?.title || file.name.replace(/\.epub$/i, "");
      const author = metadata?.creator || "EPUB";

      const id =
        `book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const record = {
        title,
        author,
        data,
        addedAt: new Date().toISOString()
      };

      await localforage.setItem(id, record);
      await displayBook(id, record);

      setStatus(`Added "${title}" to SenpaiReads.`);
    } catch (error) {
      console.error("EPUB import error:", error);

      setStatus(
        `EPUB import failed: ${error?.message || "Invalid, damaged, encrypted, or unsupported EPUB."}`,
        true
      );
    } finally {
      if (validationBook) {
        try {
          validationBook.destroy();
        } catch (_) {}
      }
    }
  }

  const backButton = $("back-button");
  const prevButton = $("prev-button");
  const nextButton = $("next-button");

  if (backButton) {
    backButton.addEventListener("click", closeReader);
  }

  if (prevButton) {
    prevButton.addEventListener("click", () => {
      if (activeRendition) {
        activeRendition.prev().catch(console.warn);
      }
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      if (activeRendition) {
        activeRendition.next().catch(console.warn);
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (readerView.hidden || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    if (event.key === "Escape") {
      closeReader();
    } else if (event.key === "ArrowLeft" && activeRendition) {
      event.preventDefault();
      activeRendition.prev().catch(console.warn);
    } else if (event.key === "ArrowRight" && activeRendition) {
      event.preventDefault();
      activeRendition.next().catch(console.warn);
    }
  });

  uploadInput.addEventListener("change", handleUpload);
  loadLibrary();
})();
