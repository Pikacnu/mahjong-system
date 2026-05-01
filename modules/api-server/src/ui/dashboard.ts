import {
  pluginDefinitionGuideSteps,
  runnerQuickGuide,
  runtimeNotes,
} from './apiReference';

type DashboardCategory = {
  key: string;
  title: string;
  summary: string;
  detail: string;
};

const dashboardCategories: DashboardCategory[] = [
  {
    key: 'core',
    title: 'Core Calls',
    summary: 'Room, player, and room-state basics.',
    detail:
      'This dashboard keeps the main operations small and readable. Full API descriptions live on the docs page.',
  },
  {
    key: 'plugin',
    title: 'Plugin Definition',
    summary: 'Teach the runtime shape of a plugin.',
    detail:
      'Register the plugin definition first. Uploading executable code and the larger API surface are documented separately.',
  },
  {
    key: 'runner',
    title: 'Temp Runner',
    summary: 'Smoke test function-runner with a temporary endpoint.',
    detail:
      'The temp runner route stores optional code first, then calls function-runner. It is practical for quick checks, not the final runtime contract.',
  },
  {
    key: 'notes',
    title: 'Implementation Notes',
    summary: 'Keep the page honest about its current scope.',
    detail:
      'The current UI is a partial backend-first demo surface and will be removed once the real product UI is ready.',
  },
];

function renderCategoryRail() {
  return dashboardCategories
    .map(
      (category, index) => `
        <button class="category-card ${index === 0 ? 'active' : ''}" type="button" data-category="${category.key}">
          <span class="category-index">0${index + 1}</span>
          <span class="category-title">${category.title}</span>
          <span class="category-summary">${category.summary}</span>
        </button>
      `,
    )
    .join('');
}

function renderCategoryDetails() {
  return dashboardCategories
    .map(
      (category, index) => `
        <article class="category-detail ${index === 0 ? 'active' : ''}" data-category-panel="${category.key}">
          <p class="category-label">${category.title}</p>
          <h3>${category.summary}</h3>
          <p>${category.detail}</p>
        </article>
      `,
    )
    .join('');
}

function renderBasicCallPanel() {
  return `
    <section class="panel-grid">
      <form id="room-create-form" class="action-card">
        <h3>Create room</h3>
        <label>
          Room status
          <select id="room-status">
            <option value="waiting">waiting</option>
            <option value="playing">playing</option>
            <option value="finished">finished</option>
          </select>
        </label>
        <div class="button-row">
          <button type="submit">Create room</button>
          <button type="button" class="secondary" data-fill-room>Sample</button>
        </div>
      </form>

      <form id="player-form" class="action-card">
        <h3>Create player</h3>
        <label>
          Player name
          <input id="player-name" placeholder="TestPlayer1" />
        </label>
        <div class="button-row">
          <button type="submit">Create player</button>
          <button type="button" class="secondary" data-fill-player>Sample</button>
        </div>
      </form>

      <form id="plugin-form" class="action-card">
        <h3>Register plugin definition</h3>
        <div class="split-grid">
          <label>
            Name
            <input id="plugin-name" placeholder="mahjong-core" />
          </label>
          <label>
            Version
            <input id="plugin-version" inputmode="numeric" placeholder="1" />
          </label>
        </div>
        <label>
          defaultStore JSON
          <textarea id="plugin-default-store">{\n  "demo": true\n}</textarea>
        </label>
        <div class="button-row">
          <button type="submit">Register definition</button>
          <button type="button" class="secondary" data-fill-plugin>Sample</button>
        </div>
      </form>

      <form id="room-status-form" class="action-card">
        <h3>Inspect room state</h3>
        <label>
          gameId
          <input id="room-status-id" inputmode="numeric" placeholder="1" />
        </label>
        <div class="button-row">
          <button type="submit">Inspect</button>
          <button type="button" class="secondary" data-fill-status>Sample</button>
        </div>
      </form>

      <form id="runner-form" class="action-card action-card-wide">
        <h3>Temporary function-runner call</h3>
        <div class="split-grid">
          <label>
            Function name
            <input id="runner-name" placeholder="demo-entry" />
          </label>
          <label>
            Version
            <input id="runner-version" inputmode="numeric" placeholder="1" />
          </label>
        </div>
        <div class="split-grid">
          <label>
            this JSON
            <textarea id="runner-this">{}</textarea>
          </label>
          <label>
            args JSON array
            <textarea id="runner-args">[]</textarea>
          </label>
        </div>
        <label>
          Optional code
          <textarea id="runner-code">export function entry(context) {\n  return { ok: true, context };\n}</textarea>
        </label>
        <div class="button-row">
          <button type="submit">Execute</button>
          <button type="button" class="secondary" data-fill-runner>Sample</button>
        </div>
        <p class="card-note">This endpoint is temporary and exists only for smoke testing the function-runner pipeline.</p>
      </form>
    </section>
  `;
}

function renderRuntimeNotes() {
  return `
    <section class="guide-block">
      <div class="section-heading">
        <p class="kicker">Plugin definition teaching</p>
        <h2>Plugin definition teaching</h2>
      </div>
      <ol class="guide-list">
        ${pluginDefinitionGuideSteps.map((item) => `<li>${item}</li>`).join('')}
      </ol>
    </section>
    <section class="guide-block">
      <div class="section-heading">
        <p class="kicker">Temporary runner guide</p>
        <h2>Temporary runner guide</h2>
      </div>
      <ol class="guide-list">
        ${runnerQuickGuide.map((item) => `<li>${item}</li>`).join('')}
      </ol>
    </section>
    <section class="guide-block">
      <div class="section-heading">
        <p class="kicker">Implementation notes</p>
        <h2>What is still partial</h2>
      </div>
      <div class="note-grid">
        <p>The dashboard is a demo surface and will be removed once the product UI is ready.</p>
        <p>Function execution is still partial, so the temp runner route is intentionally framed as a smoke test.</p>
        <p>Advanced API details live on the docs page to keep this surface focused on the basic call flow.</p>
      </div>
    </section>
    <section class="guide-block">
      <div class="section-heading">
        <p class="kicker">Runtime flow</p>
        <h2>Boot and rollout notes</h2>
      </div>
      <div class="note-grid">
        ${runtimeNotes.map((item) => `<p>${item}</p>`).join('')}
      </div>
    </section>
    <section class="guide-block">
      <div class="section-heading">
        <p class="kicker">Reference</p>
        <h2>Full API documentation</h2>
      </div>
      <a class="docs-link" href="/docs">Open the API documentation page</a>
    </section>
  `;
}

function renderBasicResultPanel() {
  return `
    <section class="result-shell">
      <div class="section-heading">
        <p class="kicker">Live response</p>
        <h2>Result console</h2>
      </div>
      <div id="state-bar" class="state-bar"></div>
      <pre id="result" class="result-box">Waiting for the first action...</pre>
    </section>
  `;
}

export function renderDashboardPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mahjong System Dashboard</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0a0e13;
      --surface: rgba(255, 255, 255, 0.03);
      --surface-2: rgba(255, 255, 255, 0.05);
      --text: #edf3f9;
      --muted: #a2b0bc;
      --line: rgba(255, 255, 255, 0.10);
      --accent: #f3bf73;
      --accent-2: #7ecbff;
      --accent-3: #93e5b0;
      --font-ui: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --font-code: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      font-family: var(--font-ui);
      color: var(--text);
      background:
        radial-gradient(circle at 12% 0%, rgba(243, 191, 115, 0.14), transparent 24%),
        radial-gradient(circle at 88% 8%, rgba(126, 203, 255, 0.10), transparent 26%),
        linear-gradient(180deg, #081018 0%, #0a0e13 36%, #0a0e13 100%);
    }
    .page {
      width: 100%;
      min-height: 100vh;
      padding: 24px clamp(18px, 3vw, 44px) 56px;
    }
    .hero {
      padding: 10px 0 18px;
    }
    .eyebrow {
      margin: 0 0 14px;
      color: var(--accent);
      letter-spacing: 0.22em;
      text-transform: uppercase;
      font-size: 12px;
      font-weight: 700;
    }
    h1 {
      margin: 0;
      font-size: clamp(34px, 4vw, 72px);
      line-height: 0.98;
      letter-spacing: -0.055em;
      font-weight: 800;
    }
    .intro,
    .hero-note {
      max-width: 84ch;
      line-height: 1.75;
      margin: 18px 0 0;
      color: var(--muted);
      font-size: 15px;
    }
    .hero-note { color: #cad6e0; }
    .header-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 18px;
    }
    .docs-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: 999px;
      padding: 12px 18px;
      border: 1px solid var(--line);
      color: var(--text);
      text-decoration: none;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.03);
    }
    .tabs {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin: 28px 0 18px;
    }
    .tab-btn {
      border: 1px solid transparent;
      background: rgba(255, 255, 255, 0.03);
      color: var(--muted);
      padding: 10px 18px;
      border-radius: 999px;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
    }
    .tab-btn[aria-selected="true"] {
      background: rgba(243, 191, 115, 0.14);
      color: var(--text);
      border-color: rgba(243, 191, 115, 0.26);
    }
    .divider {
      border: 0;
      border-top: 1px solid var(--line);
      margin: 24px 0 0;
    }
    .surface {
      display: grid;
      gap: 0;
    }
    .panel-shell {
      padding: 24px 0;
      border-top: 1px solid var(--line);
    }
    .panel-shell:first-child { border-top: 0; }
    .section-heading {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 18px;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }
    .section-heading h2 {
      margin: 0;
      font-size: clamp(22px, 2.2vw, 34px);
      line-height: 1.05;
      letter-spacing: -0.04em;
    }
    .kicker {
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 11px;
      font-weight: 700;
      color: var(--accent-2);
    }
    .category-rail {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }
    .category-card {
      border: 0;
      border-radius: 32px;
      padding: 18px;
      color: var(--text);
      background: var(--surface);
      display: grid;
      gap: 8px;
      text-align: left;
      cursor: pointer;
      min-height: 150px;
    }
    .category-card.active {
      background: rgba(243, 191, 115, 0.10);
      outline: 1px solid rgba(243, 191, 115, 0.20);
    }
    .category-index {
      font-family: var(--font-code);
      color: var(--accent);
      font-size: 12px;
      letter-spacing: 0.12em;
    }
    .category-title {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .category-summary {
      color: var(--muted);
      line-height: 1.65;
      font-size: 14px;
    }
    .category-stage {
      margin-top: 16px;
      display: grid;
      gap: 12px;
    }
    .category-detail {
      display: none;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 32px;
      padding: 22px;
      line-height: 1.75;
    }
    .category-detail.active { display: block; }
    .category-detail h3 {
      margin: 0 0 10px;
      font-size: 20px;
      letter-spacing: -0.03em;
    }
    .category-detail p {
      margin: 0;
      color: var(--muted);
    }
    .category-label {
      margin: 0 0 10px;
      color: var(--accent-3);
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 11px;
      font-weight: 700;
    }
    .panel-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .action-card,
    .guide-block,
    .result-shell {
      background: rgba(255, 255, 255, 0.03);
      border-radius: 30px;
      padding: 18px;
    }
    .action-card-wide { grid-column: 1 / -1; }
    .action-card h3 {
      margin: 0;
      font-size: 16px;
      letter-spacing: -0.02em;
    }
    label {
      display: grid;
      gap: 8px;
      color: #dce7f0;
      font-size: 13px;
    }
    input, textarea, select, button { font: inherit; }
    input, textarea, select {
      width: 100%;
      border: 0;
      border-bottom: 1px solid var(--line);
      background: transparent;
      color: var(--text);
      padding: 12px 0;
      outline: none;
      border-radius: 0;
    }
    textarea {
      min-height: 110px;
      resize: vertical;
      font-family: var(--font-code);
      line-height: 1.6;
    }
    input:focus,
    textarea:focus,
    select:focus { border-bottom-color: var(--accent); }
    .split-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    button {
      border: 0;
      border-radius: 999px;
      padding: 11px 16px;
      cursor: pointer;
      font-weight: 700;
      background: var(--text);
      color: #091018;
    }
    button.secondary {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--line);
    }
    .card-note,
    .note-grid p,
    .guide-list li {
      color: var(--muted);
      line-height: 1.75;
      font-size: 14px;
    }
    .card-note { margin: 0; }
    .guide-list {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 12px;
    }
    .note-grid {
      display: grid;
      gap: 12px;
      max-width: 90ch;
    }
    .note-grid p { margin: 0; }
    .state-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
      padding: 12px;
      background: rgba(126, 203, 255, 0.05);
      border-radius: 16px;
      border: 1px solid rgba(126, 203, 255, 0.1);
    }
    .state-item {
      display: grid;
      gap: 4px;
    }
    .state-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--accent-2);
      font-weight: 700;
    }
    .state-value {
      font-family: var(--font-code);
      color: var(--text);
      word-break: break-all;
    }
    .result-box {
      width: 100%;
      min-height: 280px;
      margin: 0;
      padding: 18px;
      border: 0;
      border-radius: 28px;
      background: rgba(255, 255, 255, 0.03);
      color: #dce5ef;
      font-family: var(--font-code);
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .hidden { display: none; }
    @media (max-width: 1100px) {
      .category-rail,
      .panel-grid,
      .split-grid {
        grid-template-columns: 1fr;
      }
      .action-card-wide {
        grid-column: auto;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <p class="eyebrow">Mahjong System / API Server</p>
      <h1>Current Backend Features</h1>
      <p class="intro">This page is a partial implementation focused on backend work. It is an AI-generated demo surface and will be removed later. The main dashboard now keeps only the basic API calls, rounded category units, and a temporary runner entry point.</p>
      <p class="hero-note">The full API descriptions live on the documentation page. If you want the product UI to become stricter, share the desired room flow, plugin contract, or function runtime rules.</p>
      <div class="header-row">
        <a class="docs-link" href="/docs">Open API docs</a>
      </div>
      <div class="tabs" role="tablist" aria-label="Dashboard tabs">
        <button class="tab-btn" type="button" data-tab="overview" aria-selected="true">Overview</button>
        <button class="tab-btn" type="button" data-tab="runtime" aria-selected="false">API & Runtime</button>
      </div>
    </header>

    <hr class="divider" />

    <section id="tab-overview" class="surface">
      <section class="panel-shell">
        <div class="section-heading">
          <p class="kicker">API categories</p>
          <h2>Rounded units for the current API groups</h2>
        </div>
        <div class="category-rail">
          ${renderCategoryRail()}
        </div>
        <div class="category-stage">
          ${renderCategoryDetails()}
        </div>
      </section>

      <section class="panel-shell">
        <div class="section-heading">
          <p class="kicker">Basic calls</p>
          <h2>Keep the dashboard focused on core operations</h2>
        </div>
        ${renderBasicCallPanel()}
      </section>

      <section class="panel-shell">
        ${renderBasicResultPanel()}
      </section>
    </section>

    <section id="tab-runtime" class="surface hidden">
      <section class="panel-shell">
        ${renderRuntimeNotes()}
      </section>
    </section>
  </main>

  <script>
    const appState = { gameId: null, playerId: null, pluginName: null };
    const tabs = Array.from(document.querySelectorAll('.tab-btn'));
    const overviewPanel = document.getElementById('tab-overview');
    const runtimePanel = document.getElementById('tab-runtime');
    const categoryCards = Array.from(document.querySelectorAll('[data-category]'));
    const categoryPanels = Array.from(document.querySelectorAll('[data-category-panel]'));
    const resultEl = document.getElementById('result');
    const stateBarEl = document.getElementById('state-bar');

    const setActiveCategory = (categoryKey) => {
      categoryCards.forEach((card) => card.classList.toggle('active', card.dataset.category === categoryKey));
      categoryPanels.forEach((panel) => panel.classList.toggle('active', panel.dataset.categoryPanel === categoryKey));
    };

    const setActiveTab = (tabName) => {
      const overviewActive = tabName === 'overview';
      overviewPanel.classList.toggle('hidden', !overviewActive);
      runtimePanel.classList.toggle('hidden', overviewActive);
      tabs.forEach((button) => button.setAttribute('aria-selected', button.dataset.tab === tabName ? 'true' : 'false'));
    };

    const renderState = () => {
      if (!stateBarEl) return;
      const items = [];
      if (appState.gameId) items.push(\`<div class="state-item"><div class="state-label">Room</div><div class="state-value">\${appState.gameId}</div></div>\`);
      if (appState.playerId) items.push(\`<div class="state-item"><div class="state-label">Player</div><div class="state-value">\${appState.playerId}</div></div>\`);
      if (appState.pluginName) items.push(\`<div class="state-item"><div class="state-label">Plugin</div><div class="state-value">\${appState.pluginName}</div></div>\`);
      stateBarEl.innerHTML = items.join('');
    };

    const showResult = (title, value) => {
      if (!resultEl) return;
      resultEl.textContent = title + '\\n' + JSON.stringify(value, null, 2);
    };

    const setValue = (id, value) => {
      const field = document.getElementById(id);
      if (field) field.value = value;
    };

    if (tabs && tabs.length) {
      tabs.forEach((button) => {
        button.addEventListener('click', () => setActiveTab(button.dataset.tab));
      });
    }
    if (categoryCards && categoryCards.length) {
      categoryCards.forEach((card) => {
        card.addEventListener('click', () => setActiveCategory(card.dataset.category));
      });
    }
    setActiveTab('overview');
    setActiveCategory(categoryCards[0]?.dataset.category || 'core');
    renderState();

    const fillRoomBtn = document.querySelector('[data-fill-room]');
    if (fillRoomBtn) {
      fillRoomBtn.addEventListener('click', () => setValue('room-status', 'waiting'));
    }

    const fillPlayerBtn = document.querySelector('[data-fill-player]');
    if (fillPlayerBtn) {
      fillPlayerBtn.addEventListener('click', () => setValue('player-name', 'TestPlayer1'));
    }

    const fillPluginBtn = document.querySelector('[data-fill-plugin]');
    if (fillPluginBtn) {
      fillPluginBtn.addEventListener('click', () => {
        setValue('plugin-name', 'mahjong-core');
        setValue('plugin-version', '1');
        setValue('plugin-default-store', JSON.stringify({ demo: true }));
      });
    }

    const fillStatusBtn = document.querySelector('[data-fill-status]');
    if (fillStatusBtn) {
      fillStatusBtn.addEventListener('click', () => {
        if (appState.gameId) {
          setValue('room-status-id', String(appState.gameId));
        } else {
          setValue('room-status-id', '1');
        }
      });
    }

    const fillRunnerBtn = document.querySelector('[data-fill-runner]');
    if (fillRunnerBtn) {
      fillRunnerBtn.addEventListener('click', () => {
        setValue('runner-name', 'demo-entry');
        setValue('runner-version', '1');
        setValue('runner-this', JSON.stringify({ seed: 1 }));
        setValue('runner-args', JSON.stringify([{ message: 'hello' }]));
        setValue('runner-code', 'export function entry(context) {\\n  return { ok: true, context };\\n}');
      });
    }

    const postJson = async (url, body) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (!response.ok) {
        throw new Error((data && data.message) || (data && data.error) || text || response.statusText);
      }
      return data;
    };

    const handleRoomCreate = async () => {
      try {
        const statusEl = document.getElementById('room-status');
        const data = await postJson('/api/game/management', {
          status: statusEl ? statusEl.value : 'waiting',
        });
        appState.gameId = data?.gameId;
        renderState();
        showResult('Room created', data);
        if (data?.gameId) setValue('room-status-id', String(data.gameId));
      } catch (error) {
        showResult('Room creation failed', { message: error.message });
      }
    };

    const handlePlayerCreate = async () => {
      try {
        const nameEl = document.getElementById('player-name');
        const data = await postJson('/api/player/management', {
          playerName: nameEl ? nameEl.value : 'Player1',
        });
        appState.playerId = data?.playerId;
        renderState();
        showResult('Player created', data);
      } catch (error) {
        showResult('Player creation failed', { message: error.message });
      }
    };

    const handlePluginRegister = async () => {
      try {
        const defaultStoreEl = document.getElementById('plugin-default-store');
        const nameEl = document.getElementById('plugin-name');
        const versionEl = document.getElementById('plugin-version');
        const defaultStoreText = defaultStoreEl ? defaultStoreEl.value : '';
        const data = await postJson('/api/plugin/management', {
          methodInfo: {
            name: nameEl ? nameEl.value : '',
            version: Number(versionEl ? versionEl.value : 1),
          },
          defaultStore: defaultStoreText.trim() ? JSON.parse(defaultStoreText) : {},
        });
        appState.pluginName = nameEl ? nameEl.value : null;
        renderState();
        showResult('Plugin registered', data);
      } catch (error) {
        showResult('Plugin registration failed', { message: error.message });
      }
    };

    const handleRoomStatus = async () => {
      try {
        const idEl = document.getElementById('room-status-id');
        const gameId = idEl ? idEl.value : String(appState.gameId || '');
        const response = await fetch('/api/room/management?gameId=' + encodeURIComponent(gameId));
        const data = await response.json();
        if (!response.ok) {
          throw new Error((data && data.message) || 'Failed to inspect room state');
        }
        showResult('Room state', data);
      } catch (error) {
        showResult('Room inspection failed', { message: error.message });
      }
    };

    const handleRunnerExecute = async () => {
      try {
        const nameEl = document.getElementById('runner-name');
        const versionEl = document.getElementById('runner-version');
        const thisEl = document.getElementById('runner-this');
        const argsEl = document.getElementById('runner-args');
        const codeEl = document.getElementById('runner-code');
        const data = await postJson('/api/runner/execute', {
          methodInfo: {
            name: nameEl ? nameEl.value : '',
            version: Number(versionEl ? versionEl.value : 1),
          },
          payload: {
            thisValue: thisEl ? JSON.parse(thisEl.value || '{}') : null,
            args: argsEl ? JSON.parse(argsEl.value || '[]') : [],
          },
          code: codeEl ? codeEl.value : undefined,
        });
        showResult('Function executed', data);
      } catch (error) {
        showResult('Function execution failed', { message: error.message });
      }
    };

    const roomCreateForm = document.getElementById('room-create-form');
    if (roomCreateForm) {
      const roomCreateBtn = roomCreateForm.querySelector('button[type="submit"]');
      if (roomCreateBtn) {
        roomCreateBtn.addEventListener('click', (e) => {
          e.preventDefault();
          handleRoomCreate();
        });
      }
    }

    const playerForm = document.getElementById('player-form');
    if (playerForm) {
      const playerCreateBtn = playerForm.querySelector('button[type="submit"]');
      if (playerCreateBtn) {
        playerCreateBtn.addEventListener('click', (e) => {
          e.preventDefault();
          handlePlayerCreate();
        });
      }
    }

    const pluginForm = document.getElementById('plugin-form');
    if (pluginForm) {
      const pluginRegisterBtn = pluginForm.querySelector('button[type="submit"]');
      if (pluginRegisterBtn) {
        pluginRegisterBtn.addEventListener('click', (e) => {
          e.preventDefault();
          handlePluginRegister();
        });
      }
    }

    const roomStatusForm = document.getElementById('room-status-form');
    if (roomStatusForm) {
      const roomStatusBtn = roomStatusForm.querySelector('button[type="submit"]');
      if (roomStatusBtn) {
        roomStatusBtn.addEventListener('click', (e) => {
          e.preventDefault();
          handleRoomStatus();
        });
      }
    }

    const runnerForm = document.getElementById('runner-form');
    if (runnerForm) {
      const runnerBtn = runnerForm.querySelector('button[type="submit"]');
      if (runnerBtn) {
        runnerBtn.addEventListener('click', (e) => {
          e.preventDefault();
          handleRunnerExecute();
        });
      }
    }
  </script>
</body>
</html>`;
}
