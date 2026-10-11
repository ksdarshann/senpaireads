
  function injectReaderStyles() {
    if ($("senpai-reader-styles")) {
      $("senpai-reader-styles").remove();
    }

    const style = document.createElement("style");
    style.id = "senpai-reader-styles";
    style.textContent = `
      .reader-toolbar {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 14px 18px;
        padding: 16px 20px;
      }

      #reader-title {
        min-width: 0;
        overflow-wrap: anywhere;
        font-size: 1rem;
        line-height: 1.45;
      }

      .reader-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .senpai-reader-options {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        padding: 14px 18px;
        background: var(--surface, #191a1f);
        border-top: 1px solid rgba(255,255,255,.08);
      }

      .senpai-reader-options select,
      .senpai-reader-options input,
      .senpai-reader-options button {
        max-width: 100%;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 9px;
        padding: 9px 11px;
        background: #222329;
        color: #f3f0e9;
        font: inherit;
      }

      .senpai-reader-options select {
        min-width: 125px;
      }

      .senpai-reader-options label {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
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
        transition: border-color .2s, background .2s;
      }

      .senpai-reader-options button:hover {
        border-color: #b7a0ff;
        background: #302b3c;
      }

      .senpai-reader-options .reader-value {
        min-width: 28px;
        color: #b7a0ff;
        font-variant-numeric: tabular-nums;
      }

      #senpai-toc {
        flex: 1 1 200px;
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

      @media (max-width: 760px) {
        .reader-toolbar {
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          padding: 14px;
        }

        #reader-title {
          grid-column: 1 / -1;
          grid-row: 2;
        }

        .reader-controls {
          grid-column: 2;
          grid-row: 1;
        }

        .senpai-reader-options {
          gap: 10px;
          padding: 12px;
        }

        .senpai-reader-options select {
          min-width: 110px;
        }

        .senpai-reader-options input[type="range"] {
          width: 75px;
        }

        #senpai-toc {
          flex-basis: 100%;
        }

        #reader-view.senpai-fullscreen .viewer {
          height: calc(100dvh - 190px) !important;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .senpai-reader-options button,
        .senpai-reader-progress-fill {
          transition: none;
        }
      }
    `;

    document.head.appendChild(style);
  }
