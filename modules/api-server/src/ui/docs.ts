import {
  apiReferenceRows,
  pluginDefinitionGuideSteps,
  runnerQuickGuide,
  runtimeNotes,
} from './apiReference';

function renderRows() {
  return apiReferenceRows
    .map(
      (row) => `
        <div class="api-row">
          <div class="api-meta">
            <span class="api-category">${row.category}</span>
            <span class="api-method">${row.method}</span>
          </div>
          <div class="api-path">${row.path}</div>
          <div class="api-desc">${row.description}</div>
          <div class="api-detail">Request: ${row.request}</div>
          <div class="api-detail">Response: ${row.response}</div>
          <div class="api-detail">Note: ${row.note}</div>
        </div>
      `,
    )
    .join('');
}

function renderGuide(title: string, items: string[]) {
  return `
    <section class="guide-card">
      <p class="kicker">${title}</p>
      <ol>
        ${items.map((item) => `<li>${item}</li>`).join('')}
      </ol>
    </section>
  `;
}

export function renderApiDocsPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mahjong System API Docs</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #090d12;
      --text: #edf3f9;
      --muted: #a7b4bf;
      --line: rgba(255, 255, 255, 0.10);
      --surface: rgba(255, 255, 255, 0.03);
      --accent: #f3bf73;
      --accent-2: #7ecbff;
      --font-ui: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --font-code: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--font-ui);
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(243, 191, 115, 0.12), transparent 24%),
        linear-gradient(180deg, #081018 0%, #090d12 100%);
    }
    .page {
      width: 100%;
      min-height: 100vh;
      padding: 24px clamp(18px, 3vw, 44px) 56px;
    }
    .hero {
      display: grid;
      gap: 16px;
      margin-bottom: 24px;
    }
    .eyebrow {
      margin: 0;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.22em;
      font-size: 12px;
      font-weight: 700;
    }
    h1 {
      margin: 0;
      font-size: clamp(34px, 4vw, 68px);
      line-height: 0.98;
      letter-spacing: -0.055em;
    }
    .intro {
      margin: 0;
      max-width: 90ch;
      color: var(--muted);
      line-height: 1.75;
    }
    .topbar {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      padding: 11px 18px;
      border: 1px solid var(--line);
      color: var(--text);
      text-decoration: none;
      background: var(--surface);
      font-weight: 700;
    }
    .section {
      padding: 24px 0;
      border-top: 1px solid var(--line);
    }
    .section h2 {
      margin: 0 0 14px;
      font-size: clamp(22px, 2vw, 30px);
      letter-spacing: -0.04em;
    }
    .kicker {
      margin: 0 0 10px;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 11px;
      font-weight: 700;
      color: var(--accent-2);
    }
    .guide-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .guide-card {
      background: var(--surface);
      border-radius: 30px;
      padding: 18px;
    }
    .guide-card ol {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 12px;
      color: var(--muted);
      line-height: 1.75;
    }
    .api-table {
      display: grid;
      gap: 0;
    }
    .api-row {
      display: grid;
      gap: 10px;
      padding: 18px 0;
      border-top: 1px solid var(--line);
    }
    .api-row:first-child {
      border-top: 0;
    }
    .api-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .api-category,
    .api-method {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 10px;
      border-radius: 999px;
      font-family: var(--font-code);
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .api-category {
      background: rgba(126, 203, 255, 0.14);
      color: #c7e8ff;
    }
    .api-method {
      background: rgba(243, 191, 115, 0.16);
      color: #ffdca3;
    }
    .api-path {
      font-family: var(--font-code);
      font-size: 14px;
      color: var(--text);
      word-break: break-all;
    }
    .api-desc,
    .api-detail {
      color: var(--muted);
      line-height: 1.75;
      font-size: 14px;
    }
    @media (max-width: 1024px) {
      .guide-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <p class="eyebrow">Mahjong System / API Docs</p>
      <h1>API Reference and Plugin Notes</h1>
      <p class="intro">This page contains the full API descriptions that were removed from the main dashboard. The dashboard now keeps only the core call flow, while this page acts as the single reference for request shapes, response shapes, plugin teaching, and the temporary runner flow.</p>
      <div class="topbar">
        <a class="pill" href="/">Back to dashboard</a>
      </div>
    </header>

    <section class="section">
      <p class="kicker">Reference guide</p>
      <h2>Plugin definition teaching</h2>
      <div class="guide-grid">
        ${renderGuide('Plugin definition', pluginDefinitionGuideSteps)}
        ${renderGuide('Temp runner', runnerQuickGuide)}
      </div>
    </section>

    <section class="section">
      <p class="kicker">Runtime notes</p>
      <h2>How the current system runs</h2>
      <div class="guide-grid">
        <section class="guide-card">
          <ol>
            ${runtimeNotes.map((item) => `<li>${item}</li>`).join('')}
          </ol>
        </section>
        <section class="guide-card">
          <ol>
            <li>The docs page intentionally owns the complete API list, so the dashboard can stay compact.</li>
            <li>The temp runner endpoint stores code only when code is provided, then forwards the call to function-runner.</li>
            <li>Plugin resource upload remains available for the full runtime path, even though it is not on the main dashboard.</li>
          </ol>
        </section>
      </div>
    </section>

    <section class="section">
      <p class="kicker">API catalog</p>
      <h2>All current API descriptions</h2>
      <div class="api-table">
        ${renderRows()}
      </div>
    </section>
  </main>
</body>
</html>`;
}
