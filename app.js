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

    if (isPdf && !window.pdfjsLib) {
      setStatus("PDF support could not load. Check your internet connection and refresh.", true);
      return;
    }

    setStatus(`Importing "${file.name}"…`);
    let book;

    try {
      const fileBuffer = await file.arrayBuffer();
      let title = file.name.replace(/\.(epub|pdf)$/i, "");
      let author = isPdf ? "PDF document" : "EPUB";

      if (isEpub) {
        book = await createBook(fileBuffer);
        const metadata = await book.loaded.metadata;
        title = metadata?.title || title;
        author = metadata?.creator || "EPUB";
      } else {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        // Give PDF.js its own copy so it cannot detach the stored buffer.
        const validationBytes = new Uint8Array(fileBuffer.slice(0));
        const checkDoc = await window.pdfjsLib.getDocument({
          data: validationBytes
        }).promise;

        await checkDoc.destroy();
      }

      const id = `book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Always store a fresh, independent buffer.
      const storedData = fileBuffer.slice(0);

      const record = {
        type: isPdf ? "pdf" : "epub",
        title,
        author,
        data: storedData,
        addedAt: new Date().toISOString()
      };

      await localforage.setItem(id, record);
      await displayBook(id, record);
      setStatus(`Added "${title}" to SenpaiReads.`);
    } catch (error) {
      console.error("Book import failed:", error);
      setStatus(
        `${isPdf ? "PDF" : "EPUB"} import failed: ${error?.message || "Invalid or damaged file."}`,
        true
      );
    } finally {
      if (book) {
        try { book.destroy(); } catch (_) {}
      }
    }
  }
