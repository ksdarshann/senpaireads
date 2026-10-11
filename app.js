
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

  if (!window.localforage || !window.ePub) {
    if (status) {
      status.textContent =
        "Reader libraries failed to load. Check your internet connection and refresh.";
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
    if (counter) counter.textContent = count;
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

  async function destroyReader() {
    try {
      if (activeRendition) activeRendition.destroy();
      if (activeBook) activeBook.destroy();
    } catch (error) {
      console.warn("Reader cleanup:", error);
    }

    activeRendition = null;
    activeBook = null;
    activeBookId = null;
    viewer.replaceChildren();
  }

  async function openBook(id, data, title) {
    if (isOpening) return;
    isOpening = true;
    setStatus(`Opening ${title}…`);

    try {
      await destroyReader();

      activeBook = ePub(data);
      await activeBook.ready;

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
      console.error("Unable to open EPUB:", error);
      await destroyReader();
      setStatus("Unable to open this book. Please try another EPUB file.", true);
    } finally {
      isOpening = false;
    }
  }

  async function displayBook(id, record) {
    const data = record.data;
    const title = record.title || record.name || "Untitled book";

    // Avoid duplicate cards.
    const existing = Array.from(bookshelf.children)
      .find((card) => card.dataset.bookId === id);

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
    meta.textContent = record.author || "EPUB";

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

      if (!window.confirm(`Remove "${title}" from SenpaiReads?`)) return;

      try {
        await localforage.removeItem(id);
        card.remove();

        if (activeBookId === id) {
          await closeReader();
        }

        updateEmptyState();
        setStatus(`Removed ${title}.`);
      } catch (error) {
        console.error(error);
        setStatus("Could not delete this book.", true);
      }
    });

    card.append(openButton, deleteButton);
    bookshelf.appendChild(card);
    updateEmptyState();

    // Try to retrieve the book's cover.
    let coverBook;

    try {
      coverBook = ePub(data);
      const url = await coverBook.coverUrl();

      if (url) {
        const image = document.createElement("img");
        image.alt = `Cover of ${title}`;
        image.src = url;

        image.onerror = () => {
          image.remove();
          cover.replaceChildren(fallbackCover(title));
        };

        cover.replaceChildren(image);
      }
    } catch (error) {
      console.warn("Cover unavailable:", error);
    } finally {
      if (coverBook) coverBook.destroy();
    }
  }

  async function loadLibrary() {
    setStatus("Loading your bookshelf…");
    bookshelf.replaceChildren();

    try {
      const saved = [];

      await localforage.iterate((record, key) => {
        if (record && record.data) {
          saved.push({ id: key, record });
        }
      });

      for (const item of saved) {
        await displayBook(item.id, item.record);
      }

      updateEmptyState();
      setStatus(
        saved.length
          ? `${saved.length} book${saved.length === 1 ? "" : "s"} in your library.`
          : "Your library is ready. Add your first EPUB to begin."
      );
    } catch (error) {
      console.error("Library loading failed:", error);
      setStatus("Could not load your library. Refresh and try again.", true);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files && event.target.files[0];
    uploadInput.value = "";

    if (!file) return;

    const isPDF =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    const isEPUB =
      file.type === "application/epub+zip" ||
      file.name.toLowerCase().endsWith(".epub");

    if (isPDF) {
      setStatus(
        "PDF conversion is not enabled yet. We'll add the converter in the next stage.",
        true
      );
      return;
    }

    if (!isEPUB) {
      setStatus("Please select a valid .epub file.", true);
      return;
    }

    setStatus(`Importing ${file.name}…`);

    let book;

    try {
      const data = await file.arrayBuffer();

      book = ePub(data);
      await book.ready;

      const metadata = await book.loaded.metadata;
      const title =
        (metadata && metadata.title) ||
        file.name.replace(/\.epub$/i, "");

      const record = {
        title,
        author: (metadata && metadata.creator) || "EPUB",
        data,
        addedAt: new Date().toISOString()
      };

      const id =
        `book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      await localforage.setItem(id, record);
      await displayBook(id, record);

      setStatus(`Added "${title}" to SenpaiReads.`);
    } catch (error) {
      console.error("Import failed:", error);
      setStatus(
        "This EPUB could not be imported. Check that it is a valid EPUB file.",
        true
      );
    } finally {
      if (book) book.destroy();
    }
  }

  async function closeReader() {
    await destroyReader();
    readerView.hidden = true;

    if (librarySection) librarySection.hidden = false;

    setStatus("Back at your bookshelf.");
  }

  const backButton = $("back-button");
  const prevButton = $("prev-button");
  const nextButton = $("next-button");

  if (backButton) backButton.addEventListener("click", closeReader);

  if (prevButton) {
    prevButton.addEventListener("click", () => {
      if (activeRendition) activeRendition.prev();
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      if (activeRendition) activeRendition.next();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (readerView.hidden) return;

    if (event.key === "Escape") closeReader();

    if (event.key === "ArrowLeft" && activeRendition) {
      event.preventDefault();
      activeRendition.prev();
    }

    if (event.key === "ArrowRight" && activeRendition) {
      event.preventDefault();
      activeRendition.next();
    }
  });

  uploadInput.addEventListener("change", handleUpload);

  loadLibrary();
})();
