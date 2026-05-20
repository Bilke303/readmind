const SPINE_COLORS = ['#2D4A3E','#4a7c66','#8B7355','#6B5B7B','#4A6B8A','#7A5C4A','#3D6B5A'];

const DEFAULT_STATE = {
  view: 'library',
  selectedBook: null,
  books: [],
  matrix: null,
  matrixLoading: false,
  showAddBook: false,
  showAddHighlight: false,
  newBook: { title: '', author: '' },
  newHighlight: { text: '', page: '' },
  apiKey: '',
  showSettings: false,
  friendName: 'Laura'
};

let state = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem('readmind_v2') || 'null');
    return saved ? { ...DEFAULT_STATE, ...saved, matrixLoading: false } : DEFAULT_STATE;
  } catch { return DEFAULT_STATE; }
})();

function save() {
  const toSave = { ...state, matrixLoading: false, showAddBook: false, showAddHighlight: false, showSettings: false };
  localStorage.setItem('readmind_v2', JSON.stringify(toSave));
}

function setState(partial) {
  state = { ...state, ...partial };
  render();
  save();
}

function totalHighlights() { return state.books.reduce((s, b) => s + b.highlights.length, 0); }
function getBook(id) { return state.books.find(b => b.id === id); }

// ── ACTIONS ──

window.selectBook = (id) => setState({ view: 'book', selectedBook: id });
window.setState = setState;

window.addBook = () => {
  const title = document.getElementById('newBookTitle')?.value?.trim();
  const author = document.getElementById('newBookAuthor')?.value?.trim();
  if (!title || !author) { showToast('Bitte Titel und Autor angeben.'); return; }
  const color = SPINE_COLORS[state.books.length % SPINE_COLORS.length];
  const newBooks = [...state.books, {
    id: Date.now(), title, author, color,
    addedAt: new Date().toISOString().split('T')[0],
    highlights: []
  }];
  setState({ books: newBooks, showAddBook: false, newBook: { title: '', author: '' } });
  showToast('Buch hinzugefügt ✓');
};

window.addHighlight = () => {
  const text = document.getElementById('newHighlightText')?.value?.trim();
  const page = document.getElementById('newHighlightPage')?.value?.trim();
  if (!text) { showToast('Bitte Text eingeben.'); return; }
  const newBooks = state.books.map(b => {
    if (b.id !== state.selectedBook) return b;
    return { ...b, highlights: [...b.highlights, { id: Date.now(), text, page, addedAt: new Date().toISOString().split('T')[0] }] };
  });
  setState({ books: newBooks, showAddHighlight: false, newHighlight: { text: '', page: '' }, matrix: null });
  showToast('Highlight gespeichert ✓');
};

window.deleteHighlight = (bookId, highlightId) => {
  if (!confirm('Highlight löschen?')) return;
  const newBooks = state.books.map(b => {
    if (b.id !== bookId) return b;
    return { ...b, highlights: b.highlights.filter(h => h.id !== highlightId) };
  });
  setState({ books: newBooks, matrix: null });
};

window.deleteBook = (bookId) => {
  if (!confirm('Buch und alle Highlights löschen?')) return;
  setState({ books: state.books.filter(b => b.id !== bookId), view: 'library', selectedBook: null, matrix: null });
  showToast('Buch entfernt');
};

window.saveSettings = () => {
  const apiKey = document.getElementById('apiKeyInput')?.value?.trim() || '';
  const friendName = document.getElementById('friendNameInput')?.value?.trim() || 'Laura';
  setState({ apiKey, friendName, showSettings: false });
  showToast('Gespeichert ✓');
};

window.analyzeMatrix = async () => {
  if (!state.apiKey) { showToast('Bitte zuerst API Key in den Einstellungen hinterlegen.'); setState({ showSettings: true }); return; }
  if (totalHighlights() < 2) { showToast('Mindestens 2 Highlights für die Analyse erforderlich.'); return; }

  setState({ matrixLoading: true, view: 'matrix' });

  const allHighlights = state.books.flatMap(b =>
    b.highlights.map(h => `[${b.title} von ${b.author}] "${h.text}"`)
  ).join('\n\n');

  const prompt = `Du analysierst die persönliche Lese-Bibliothek einer Nutzerin. Hier sind ihre markierten Stellen:\n\n${allHighlights}\n\nErstelle eine präzise Wissensmatrix und Blind-Spot-Analyse. Antworte NUR als JSON ohne Markdown-Backticks:\n\n{"matrix":[{"thema":"Themenname","prozent":28,"beschreibung":"Kurze Beschreibung"}],"dominanteMuster":["Muster 1","Muster 2","Muster 3"],"blindSpots":[{"vorhanden":"Was viel vorkommt","fehlend":"Was unterrepräsentiert ist"},{"vorhanden":"...","fehlend":"..."},{"vorhanden":"...","fehlend":"..."}],"puzzleStueck":"Ein konkreter Satz über das verbindende Puzzlestück.","naechstesBuch":"Buchtitel — Autor","kerninsight":"Ein präziser ehrlicher Satz über das Leseprofil dieser Person."}\n\nDie matrix-Einträge sollten 4-6 Themen umfassen, deren prozent-Werte sich auf 100 summieren.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await response.json();
    if (data.error) { throw new Error(data.error.message); }
    const text = data.content?.[0]?.text || '';
    const matrix = JSON.parse(text.replace(/```json|```/g, '').trim());
    setState({ matrix, matrixLoading: false });
  } catch(e) {
    setState({ matrixLoading: false });
    showToast('Fehler: ' + (e.message || 'API Key prüfen'));
  }
};

// ── TOAST ──
function showToast(msg) {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#1a1814;color:#fff;padding:10px 20px;border-radius:100px;font-size:13px;z-index:9999;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,0.3)';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ── RENDER ──

function renderSidebar() {
  const bookItems = state.books.map(b =>
    `<div class="book-nav-item" onclick="selectBook(${b.id})">
      <div class="book-dot" style="background:${b.color}"></div>
      <span>${b.title}</span>
    </div>`
  ).join('');

  return `<div class="sidebar">
    <div class="sidebar-logo">readmind<span>Deine Wissensmatrix</span></div>
    <nav>
      <div class="nav-item ${state.view==='library'&&!state.selectedBook?'active':''}" onclick="setState({view:'library',selectedBook:null})">
        <span>📚</span> Bibliothek
      </div>
      <div class="nav-item ${state.view==='matrix'?'active':''}" onclick="setState({view:'matrix'})">
        <span>🧠</span> Matrix & Analyse
      </div>
      <div class="nav-item ${state.view==='friend'?'active':''}" onclick="setState({view:'friend'})">
        <span>👤</span> ${state.friendName}s Profil
      </div>
      ${state.books.length > 0 ? `<div class="nav-section">Bücher</div>${bookItems}` : ''}
    </nav>
    <div style="margin-top:auto;padding:24px 24px 0">
      <div class="nav-item" onclick="setState({showSettings:true})">
        <span>⚙️</span> Einstellungen
      </div>
    </div>
  </div>`;
}

function renderBottomNav() {
  const items = [
    { icon: '📚', label: 'Bücher', view: 'library' },
    { icon: '🧠', label: 'Matrix', view: 'matrix' },
    { icon: '👤', label: state.friendName, view: 'friend' },
    { icon: '⚙️', label: 'Settings', view: 'settings' },
  ];
  return `<div class="bottom-nav">
    ${items.map(i => `
      <div class="bottom-nav-item ${state.view===i.view?'active':''}" onclick="${i.view==='settings'?'setState({showSettings:true})':'setState({view:\''+i.view+'\',selectedBook:null})'}">
        <span class="bottom-nav-icon">${i.icon}</span>
        <span>${i.label}</span>
      </div>
    `).join('')}
  </div>`;
}

function renderLibrary() {
  const bookCards = state.books.map(b => `
    <div class="card book-card" onclick="selectBook(${b.id})">
      <div class="book-spine" style="background:${b.color}"></div>
      <div class="book-title">${b.title}</div>
      <div class="book-author">${b.author}</div>
      <div class="book-meta">
        <span>✦ ${b.highlights.length} Highlights</span>
      </div>
    </div>
  `).join('');

  return `
    <div class="page-header">
      <div>
        <div class="page-title">Bibliothek</div>
        <div class="page-subtitle">${state.books.length} Bücher · ${totalHighlights()} Highlights</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="setState({showAddBook:true})">+ Buch</button>
      </div>
    </div>
    <div class="content">
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Bücher</div><div class="stat-value">${state.books.length}</div></div>
        <div class="stat-card"><div class="stat-label">Highlights</div><div class="stat-value">${totalHighlights()}</div></div>
        <div class="stat-card"><div class="stat-label">Freundin</div><div class="stat-value" style="font-size:18px;margin-top:6px">${state.friendName}</div></div>
        <div class="stat-card"><div class="stat-label">Matrix</div><div class="stat-value" style="font-size:18px;margin-top:6px">${state.matrix ? '✓' : '—'}</div></div>
      </div>
      ${state.books.length === 0 ? `
        <div class="empty">
          <div class="empty-icon">📖</div>
          <div class="empty-title">Noch keine Bücher</div>
          <div class="empty-sub">Füge dein erstes Buch hinzu und beginne, Highlights zu sammeln.</div>
          <button class="btn btn-primary" onclick="setState({showAddBook:true})">Erstes Buch hinzufügen</button>
        </div>
      ` : `<div class="grid-auto">${bookCards}</div>`}
    </div>
    <button class="fab" onclick="setState({showAddBook:true})">+</button>
  `;
}

function renderBookView(book) {
  const highlights = book.highlights.map(h => `
    <div class="highlight-item">
      <div class="highlight-text">${h.text}</div>
      <div class="highlight-meta">
        ${h.page ? `<span>S. ${h.page}</span>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="deleteHighlight(${book.id},${h.id})">×</button>
      </div>
    </div>
  `).join('');

  return `
    <div class="page-header">
      <div>
        <div style="font-size:13px;color:var(--text3);margin-bottom:4px;cursor:pointer" onclick="setState({view:'library',selectedBook:null})">← Bibliothek</div>
        <div class="page-title">${book.title}</div>
        <div class="page-subtitle">${book.author} · ${book.highlights.length} Highlights</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="deleteBook(${book.id})">Löschen</button>
        <button class="btn btn-primary" onclick="setState({showAddHighlight:true})">+ Highlight</button>
      </div>
    </div>
    <div class="content">
      <div class="card">
        ${book.highlights.length === 0 ? `
          <div class="empty" style="padding:40px 20px">
            <div class="empty-title" style="font-size:17px">Keine Highlights</div>
            <div class="empty-sub">Füge deine ersten markierten Stellen hinzu.</div>
            <button class="btn btn-primary" onclick="setState({showAddHighlight:true})">Highlight hinzufügen</button>
          </div>
        ` : highlights}
      </div>
    </div>
    <button class="fab" onclick="setState({showAddHighlight:true})">+</button>
  `;
}

function renderMatrix() {
  if (state.matrixLoading) {
    return `
      <div class="page-header"><div><div class="page-title">Wissensmatrix</div><div class="page-subtitle">Analyse läuft...</div></div></div>
      <div class="content"><div class="card"><div class="analyzing">
        <div class="analyzing-spinner"></div>
        <div class="analyzing-text">Deine Highlights werden analysiert...</div>
        <div style="font-size:13px;color:var(--text3);margin-top:8px">Muster, Themen, blinde Flecken</div>
      </div></div></div>
    `;
  }

  if (!state.matrix) {
    return `
      <div class="page-header"><div><div class="page-title">Wissensmatrix</div><div class="page-subtitle">KI-Analyse deiner Highlights</div></div></div>
      <div class="content"><div class="card"><div class="empty">
        <div class="empty-icon">🧠</div>
        <div class="empty-title">Noch keine Analyse</div>
        <div class="empty-sub">Die KI analysiert deine Highlights und erstellt eine persönliche Wissensmatrix — mit blinden Flecken und Buchempfehlung.</div>
        ${totalHighlights() < 2 ? `<div style="font-size:13px;color:var(--text3);margin-bottom:16px">Mindestens 2 Highlights erforderlich.</div>` : ''}
        <button class="btn btn-primary" onclick="analyzeMatrix()" ${totalHighlights() < 2 ? 'disabled style="opacity:0.5"' : ''}>Analyse starten</button>
      </div></div></div>
    `;
  }

  const m = state.matrix;
  const bars = m.matrix.map(t => `
    <div class="matrix-bar-row">
      <div class="matrix-bar-header">
        <span class="matrix-bar-label">${t.thema}</span>
        <span class="matrix-bar-pct">${t.prozent}%</span>
      </div>
      <div class="matrix-bar-track"><div class="matrix-bar-fill" style="width:${t.prozent}%"></div></div>
      <div style="font-size:12px;color:var(--text3);margin-top:3px">${t.beschreibung}</div>
    </div>
  `).join('');

  const blindSpots = m.blindSpots.map(bs => `
    <div class="blind-spot-pair">
      <span class="blind-spot-have">viel ${bs.vorhanden}</span>
      <span class="blind-spot-arrow">→</span>
      <span class="blind-spot-missing">wenig ${bs.fehlend}</span>
    </div>
  `).join('');

  const muster = m.dominanteMuster.map(p => `<span class="tag" style="margin-right:6px;margin-bottom:6px">${p}</span>`).join('');

  return `
    <div class="page-header">
      <div><div class="page-title">Wissensmatrix</div><div class="page-subtitle">${totalHighlights()} Highlights · ${state.books.length} Bücher</div></div>
      <button class="btn btn-secondary btn-sm" onclick="analyzeMatrix()">Neu analysieren</button>
    </div>
    <div class="content">
      <div class="grid-2" style="margin-bottom:20px">
        <div class="card">
          <div class="section-header"><div class="section-title">Themenverteilung</div></div>
          ${bars}
        </div>
        <div>
          <div class="card" style="margin-bottom:16px">
            <div class="section-title" style="margin-bottom:12px">Kerninsight</div>
            <div class="insight-card" style="margin-bottom:0">
              <div class="insight-text" style="font-family:var(--serif);font-style:italic;font-size:15px">"${m.kerninsight}"</div>
            </div>
          </div>
          <div class="card">
            <div class="section-title" style="margin-bottom:12px">Dominante Muster</div>
            <div style="display:flex;flex-wrap:wrap">${muster}</div>
          </div>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="section-header"><div class="section-title">Blinde Flecken</div></div>
          <div style="font-size:13px;color:var(--text3);margin-bottom:14px">Systematische Unterrepräsentation</div>
          ${blindSpots}
        </div>
        <div class="card">
          <div class="section-title" style="margin-bottom:12px">Fehlendes Puzzlestück</div>
          <div class="insight-card">
            <div class="insight-label">Entwicklungsbrücke</div>
            <div class="insight-text">${m.puzzleStueck}</div>
          </div>
          <div style="margin-top:16px">
            <div style="font-size:13px;font-weight:500;color:var(--text2);margin-bottom:6px">Nächste Empfehlung</div>
            <div style="font-size:14px;font-family:var(--serif);font-style:italic;color:var(--accent)">→ ${m.naechstesBuch}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderFriendView() {
  return `
    <div class="page-header"><div><div class="page-title">${state.friendName}s Profil</div><div class="page-subtitle">Social Reading · Coming soon</div></div></div>
    <div class="content">
      <div class="card" style="text-align:center;padding:48px 24px">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--accent);color:#e8f0ec;display:flex;align-items:center;justify-content:center;font-size:28px;font-family:var(--serif);margin:0 auto 20px">${state.friendName[0]}</div>
        <div style="font-family:var(--serif);font-size:20px;margin-bottom:8px">${state.friendName}</div>
        <div style="font-size:14px;color:var(--text3);max-width:280px;margin:0 auto 28px;line-height:1.65">In der nächsten Version kann ${state.friendName} sich registrieren, ihre Bibliothek teilen und eure Matrizen vergleichen.</div>
        <div style="background:var(--accent-light);padding:14px 18px;border-radius:var(--radius-sm);font-size:13px;color:var(--accent);display:inline-block">
          Stufe 2: Matrizen vergleichen · gemeinsame Highlights · gegenseitige Blind Spots
        </div>
      </div>
    </div>
  `;
}

function renderSettings() {
  return `
    <div class="modal-overlay" onclick="if(event.target===this)setState({showSettings:false})">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Einstellungen</div>
          <button class="btn-icon" onclick="setState({showSettings:false})">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Anthropic API Key</label>
            <input type="password" id="apiKeyInput" value="${state.apiKey}" placeholder="sk-ant-..." style="font-family:monospace;font-size:13px" />
            <div style="font-size:12px;color:var(--text3);margin-top:6px">Wird nur lokal auf deinem Gerät gespeichert. Nie weitergegeben.</div>
          </div>
          <div class="form-group">
            <label>Name deiner Freundin</label>
            <input type="text" id="friendNameInput" value="${state.friendName}" placeholder="Laura" />
          </div>
          <div class="divider"></div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:16px">
            API Key bekommst du unter <a href="https://console.anthropic.com" target="_blank" style="color:var(--accent2)">console.anthropic.com</a>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button class="btn btn-secondary" onclick="setState({showSettings:false})">Abbrechen</button>
            <button class="btn btn-primary" onclick="saveSettings()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAddBook() {
  return `
    <div class="modal-overlay" onclick="if(event.target===this)setState({showAddBook:false})">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Buch hinzufügen</div>
          <button class="btn-icon" onclick="setState({showAddBook:false})">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Titel</label>
            <input type="text" id="newBookTitle" placeholder="Buchtitel..." autofocus />
          </div>
          <div class="form-group">
            <label>Autor:in</label>
            <input type="text" id="newBookAuthor" placeholder="Name..." />
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
            <button class="btn btn-secondary" onclick="setState({showAddBook:false})">Abbrechen</button>
            <button class="btn btn-primary" onclick="addBook()">Hinzufügen</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAddHighlight() {
  const book = getBook(state.selectedBook);
  return `
    <div class="modal-overlay" onclick="if(event.target===this)setState({showAddHighlight:false})">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Highlight hinzufügen</div>
          <button class="btn-icon" onclick="setState({showAddHighlight:false})">✕</button>
        </div>
        <div class="modal-body">
          <div style="font-size:13px;color:var(--text3);margin-bottom:14px;font-style:italic">${book?.title}</div>
          <div class="form-group">
            <label>Markierte Stelle</label>
            <textarea id="newHighlightText" placeholder="Text einfügen oder eingeben..." rows="5"></textarea>
          </div>
          <div class="form-group">
            <label>Seite (optional)</label>
            <input type="text" id="newHighlightPage" placeholder="z.B. 47" inputmode="numeric" />
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
            <button class="btn btn-secondary" onclick="setState({showAddHighlight:false})">Abbrechen</button>
            <button class="btn btn-primary" onclick="addHighlight()">Speichern</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function render() {
  const app = document.getElementById('app');
  if (!app) return;

  let mainContent = '';
  if (state.view === 'book' && state.selectedBook) mainContent = renderBookView(getBook(state.selectedBook));
  else if (state.view === 'matrix') mainContent = renderMatrix();
  else if (state.view === 'friend') mainContent = renderFriendView();
  else mainContent = renderLibrary();

  let modals = '';
  if (state.showSettings) modals = renderSettings();
  else if (state.showAddBook) modals = renderAddBook();
  else if (state.showAddHighlight && state.selectedBook) modals = renderAddHighlight();

  app.innerHTML = `${renderSidebar()}<div class="main">${mainContent}${renderBottomNav()}</div>${modals}`;
}

render();

// Service Worker registrieren
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
