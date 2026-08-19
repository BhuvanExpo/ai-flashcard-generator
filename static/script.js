/**
 * ============================================================================
 * AI FLASHCARD & STUDY NOTES GENERATOR - FRONTEND INTERACTION LAYER
 * ============================================================================
 * 
 * Features:
 * - 3D Card Flipping (Single & Bulk Flip All)
 * - Real-time Search & Multi-criteria Filtering
 * - Interactive Quiz Mode (Practice Carousel with Mastery Tracking)
 * - Anki / CSV / JSON Export Engine
 * - Preset Sample Transcripts (CS, Bio, Econ)
 * - AJAX Generation with Smooth UX & Toast Notifications
 * - Dark / Light Theme State Persistence
 */

'use strict';

// ============================================================================
// GLOBAL APPLICATION STATE
// ============================================================================
const AppState = {
  currentDeck: null,
  activeTab:   'grid',   // 'grid' | 'notes' | 'quiz'
  quizIndex:   0,
  quizScore:   { correct: 0, review: 0 },
  allFlipped:  false,    // tracks bulk-flip state
  searchTerm:  '',
  theme:       localStorage.getItem('ai_flashcards_theme') || 'dark',
};

// ============================================================================
// SAMPLE TRANSCRIPTS FOR INSTANT TESTING & DEMONSTRATION
// ============================================================================
const PRESETS = {
  cs: {
    title: "Operating Systems: Concurrency & Memory",
    text: `An Operating System is defined as system software that manages computer hardware, software resources, and provides common services for computer programs.

Virtual Memory refers to a memory management capability of an operating system that uses hardware and software to allow a computer to compensate for physical memory shortages by temporarily transferring data from random access memory (RAM) to disk storage.

Paging is a memory management scheme by which a computer stores and retrieves data from secondary storage for use in main memory in same-size blocks called pages.

Deadlock is basically a state in which two or more competing processes are unable to proceed because each process is waiting for the other to release resources.

The primary function of the CPU Scheduler is to select processes from the ready queue and allocate CPU execution time according to scheduling algorithms like Round Robin or Shortest Job First.

Thrashing describes a catastrophic condition where excessive paging operations cause the operating system to spend more time swapping pages in and out than executing actual user instructions.

Semaphore denotes a protected synchronization variable or abstract data type that provides a simple mechanism for controlling access to a shared resource in concurrent programming.`
  },
  bio: {
    title: "Cellular Biology: Photosynthesis & Respiration",
    text: `Photosynthesis is defined as the biochemical process by which green plants, algae, and certain bacteria transform light energy into chemical energy stored in glucose molecules.

Chloroplast refers to the specialized membrane-bound plant organelle where the light-dependent and light-independent reactions of photosynthesis occur.

Chlorophyll is an essential green pigment that absorbs light energy predominantly in the blue and red portions of the electromagnetic spectrum while reflecting green light.

Cellular Respiration denotes the metabolic pathway through which cells break down glucose and other organic molecules in the presence of oxygen to produce Adenosine Triphosphate (ATP).

Mitochondria are known as the powerhouses of the cell that generate most of the chemical energy needed to power biochemical reactions.

The primary purpose of ATP Synthase is to synthesize ATP from ADP and inorganic phosphate driven by a transmembrane proton gradient during oxidative phosphorylation.`
  },
  econ: {
    title: "Macroeconomics: Monetary Policy & Inflation",
    text: `Inflation is defined as the general and sustained increase in the overall price level of goods and services in an economy over a given period of time.

Gross Domestic Product refers to the total monetary or market value of all finished goods and services produced within a country's borders during a specific time interval.

Monetary Policy denotes the macroeconomic policy laid down by the central bank involving the management of interest rates and total supply of money in circulation.

Demand-Pull Inflation is basically a scenario where aggregate demand for goods and services outpaces aggregate supply in an expanding economy.

The main function of a Central Bank is to oversee the monetary system, regulate commercial banking operations, and maintain overall price stability.

Fiscal Policy signifies the use of government spending and taxation to influence macroeconomic conditions including employment, aggregate demand, and economic growth.`
  }
};

// ============================================================================
// DOM ELEMENTS CACHE
// ============================================================================
const DOM = {
  themeToggle:      document.getElementById('themeToggle'),
  themeIcon:        document.getElementById('themeIcon'),
  deckForm:         document.getElementById('deckForm'),
  deckTitle:        document.getElementById('deckTitle'),
  transcriptInput:  document.getElementById('transcriptInput'),
  charCounter:      document.getElementById('charCounter'),
  generateBtn:      document.getElementById('generateBtn'),
  btnText:          document.querySelector('.btn-text'),
  historyList:      document.getElementById('historyList'),

  // Display containers
  emptyState:       document.getElementById('emptyState'),
  activeDeckView:   document.getElementById('activeDeckView'),
  currentDeckTitle: document.getElementById('currentDeckTitle'),
  statCardsCount:   document.getElementById('statCardsCount'),
  statWordsCount:   document.getElementById('statWordsCount'),
  statEngineType:   document.getElementById('statEngineType'),

  // Tabs & controls
  tabButtons:       document.querySelectorAll('.tab-btn'),
  tabPanes:         document.querySelectorAll('.tab-pane'),
  searchInput:      document.getElementById('searchCards'),
  btnShuffle:       document.getElementById('btnShuffle'),
  btnFlipAll:       document.getElementById('btnFlipAll'),
  btnExportJson:    document.getElementById('btnExportJson'),
  btnExportCsv:     document.getElementById('btnExportCsv'),
  btnPrint:         document.getElementById('btnPrint'),

  // Content panes
  flashcardsGrid:   document.getElementById('flashcardsGrid'),
  notesList:        document.getElementById('notesList'),

  // Quiz elements
  quizProgressBar:  document.getElementById('quizProgressBar'),
  quizCounterText:  document.getElementById('quizCounterText'),
  quizCardWrapper:  document.getElementById('quizCardWrapper'),
  btnQuizGotIt:     document.getElementById('btnQuizGotIt'),
  btnQuizReview:    document.getElementById('btnQuizReview'),

  toastContainer:   document.getElementById('toastContainer'),
};

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
  loadDecksHistory();

  // If page loaded with a sample preset ready
  if (DOM.transcriptInput && DOM.transcriptInput.value.trim() === '') {
    loadPreset('cs');
  }
});

// ============================================================================
// THEME MANAGEMENT
// ============================================================================
function initTheme() {
  document.documentElement.setAttribute('data-theme', AppState.theme);
  updateThemeIcon();
}

function toggleTheme() {
  AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', AppState.theme);
  localStorage.setItem('ai_flashcards_theme', AppState.theme);
  updateThemeIcon();
  showToast(`Switched to ${AppState.theme} mode`, 'info');
}

function updateThemeIcon() {
  if (DOM.themeIcon) {
    DOM.themeIcon.className = AppState.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }
}

// ============================================================================
// EVENT LISTENERS SETUP
// ============================================================================
function setupEventListeners() {
  // Theme Toggle
  DOM.themeToggle?.addEventListener('click', toggleTheme);

  // Form Submission
  DOM.deckForm?.addEventListener('submit', handleFormSubmit);

  // Character Counter
  DOM.transcriptInput?.addEventListener('input', () => {
    const len = DOM.transcriptInput.value.length;
    DOM.charCounter.textContent = `${len.toLocaleString()} chars`;
  });

  // Preset Buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const presetKey = e.currentTarget.getAttribute('data-preset');
      loadPreset(presetKey);
    });
  });

  // Tab Navigation
  DOM.tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetTab = e.currentTarget.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Search Filter
  DOM.searchInput?.addEventListener('input', (e) => {
    AppState.searchTerm = e.target.value.toLowerCase().trim();
    filterFlashcards();
  });

  // Toolbar Actions
  DOM.btnShuffle?.addEventListener('click', shuffleCurrentCards);
  DOM.btnFlipAll?.addEventListener('click', toggleFlipAllCards);
  DOM.btnExportJson?.addEventListener('click', exportDeckAsJson);
  DOM.btnExportCsv?.addEventListener('click', exportDeckAsCsv);
  DOM.btnPrint?.addEventListener('click', () => window.print());

  // Quiz Mode Actions
  DOM.btnQuizGotIt?.addEventListener('click', () => answerQuizCard(true));
  DOM.btnQuizReview?.addEventListener('click', () => answerQuizCard(false));
  DOM.quizCardWrapper?.addEventListener('click', () => {
    DOM.quizCardWrapper.classList.toggle('flipped');
  });

  // Keyboard Navigation for Quiz Mode
  document.addEventListener('keydown', (e) => {
    if (AppState.activeTab === 'quiz') {
      if (e.code === 'Space') {
        e.preventDefault();
        DOM.quizCardWrapper?.classList.toggle('flipped');
      } else if (e.key === 'ArrowRight' || e.key === '1') {
        answerQuizCard(true);
      } else if (e.key === 'ArrowLeft' || e.key === '2') {
        answerQuizCard(false);
      }
    }
  });
}

// ============================================================================
// PRESET LOADER
// ============================================================================
function loadPreset(key) {
  const preset = PRESETS[key];
  if (preset && DOM.transcriptInput && DOM.deckTitle) {
    DOM.deckTitle.value = preset.title;
    DOM.transcriptInput.value = preset.text;
    DOM.charCounter.textContent = `${preset.text.length.toLocaleString()} chars`;
    showToast(`Loaded sample: ${preset.title}`, 'info');
  }
}

// ============================================================================
// GENERATION HANDLER (AJAX FETCH TO GENERATE.PHP)
// ============================================================================
async function handleFormSubmit(e) {
  e.preventDefault();

  const title = DOM.deckTitle.value.trim();
  const transcript = DOM.transcriptInput.value.trim();

  if (transcript.length < 25) {
    showToast('Please enter at least 25 characters of lecture transcript.', 'error');
    DOM.transcriptInput.focus();
    return;
  }

  setGeneratingState(true);

  try {
    const response = await fetch('generate.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        title: title || 'Lecture Study Deck',
        transcript: transcript
      })
    });

    const data = await response.json();

    if (!response.ok || data.status !== 'success') {
      throw new Error(data.message || 'Failed to process transcript with NLP.');
    }

    // Success: Update Active Deck
    AppState.currentDeck = data.deck;
    renderActiveDeck(data.deck, data.stats);
    loadDecksHistory();
    showToast('Flashcards and notes generated successfully!', 'success');

  } catch (error) {
    console.error('Generation error:', error);
    showToast(error.message || 'An unexpected error occurred.', 'error');
  } finally {
    setGeneratingState(false);
  }
}

function setGeneratingState(isGenerating) {
  if (isGenerating) {
    DOM.generateBtn.disabled = true;
    DOM.generateBtn.classList.add('loading');
    DOM.btnText.textContent = 'Processing with NLP...';
  } else {
    DOM.generateBtn.disabled = false;
    DOM.generateBtn.classList.remove('loading');
    DOM.btnText.textContent = 'Generate Flashcards';
  }
}

// ============================================================================
// RENDER ACTIVE DECK & CONTENT TABS
// ============================================================================
function renderActiveDeck(deck, stats = null) {
  if (!deck) return;

  DOM.emptyState.style.display    = 'none';
  DOM.activeDeckView.style.display = 'flex';

  DOM.currentDeckTitle.textContent = deck.title;

  const cards = deck.flashcards  || [];
  const notes = deck.study_notes || [];

  DOM.statCardsCount.textContent = `${cards.length} Cards`;
  DOM.statWordsCount.textContent = `${deck.word_count || 0} Words`;
  DOM.statEngineType.textContent = stats?.nlp_engine || 'Scikit-Learn TF-IDF + Heuristics';

  renderFlashcardsGrid(cards);
  renderStudyNotes(notes);
  initQuizMode(cards);
  switchTab('grid');
}

// ============================================================================
// FLASHCARDS 3D GRID RENDERER
// ============================================================================
function renderFlashcardsGrid(cards) {
  DOM.flashcardsGrid.innerHTML = '';

  if (!cards || cards.length === 0) {
    DOM.flashcardsGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i class="fas fa-layer-group empty-icon"></i>
        <h3>No Flashcards Found</h3>
        <p>Try pasting a longer transcript with formal definitions or key terms.</p>
      </div>`;
    return;
  }

  cards.forEach((card, index) => {
    const cardEl = createFlashcardElement(card, index);
    DOM.flashcardsGrid.appendChild(cardEl);
  });
}

function createFlashcardElement(card, index) {
  const wrapper = document.createElement('div');
  wrapper.className = 'flashcard-wrapper';
  wrapper.setAttribute('data-index', index);
  wrapper.setAttribute('tabindex', '0');
  wrapper.setAttribute('role', 'button');
  wrapper.setAttribute('aria-label', `Flashcard for ${escapeHtml(card.term)}. Click or press Enter to flip.`);

  const diffClass = `diff-${(card.difficulty || 'medium').toLowerCase()}`;

  wrapper.innerHTML = `
    <div class="flashcard-inner">
      <!-- FRONT FACE -->
      <div class="card-face card-front">
        <div class="card-meta-top">
          <span class="card-type-tag">${escapeHtml(card.card_type || 'Concept')}</span>
          <span class="card-difficulty ${diffClass}">${escapeHtml(card.difficulty || 'Medium')}</span>
        </div>
        <div class="card-body-content">
          <h3 class="card-term">${escapeHtml(card.term)}</h3>
        </div>
        <div class="card-footer-action">
          <span class="flip-prompt"><i class="fas fa-sync-alt"></i> Click to reveal</span>
          <span>Card #${index + 1}</span>
        </div>
      </div>

      <!-- BACK FACE -->
      <div class="card-face card-back">
        <div class="card-meta-top">
          <span class="card-type-tag">Definition & Context</span>
          <span class="card-difficulty ${diffClass}">${escapeHtml(card.difficulty || 'Medium')}</span>
        </div>
        <div class="card-body-content">
          <p class="card-definition">${escapeHtml(card.definition)}</p>
        </div>
        <div class="card-footer-action">
          <span class="flip-prompt"><i class="fas fa-undo"></i> Flip back</span>
          <span>Importance: ${Math.round((card.importance_score || 0.8) * 100)}%</span>
        </div>
      </div>
    </div>
  `;

  // Flip on Click
  wrapper.addEventListener('click', () => {
    wrapper.classList.toggle('flipped');
  });

  // Accessibility: Flip on Enter / Space
  wrapper.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      wrapper.classList.toggle('flipped');
    }
  });

  return wrapper;
}

// ============================================================================
// STUDY NOTES RENDERER
// ============================================================================
function renderStudyNotes(notes) {
  DOM.notesList.innerHTML = '';

  if (!notes || notes.length === 0) {
    DOM.notesList.innerHTML = `
      <li class="note-item">
        <div class="note-text">No summary notes extracted for this transcript.</div>
      </li>`;
    return;
  }

  notes.forEach((note, index) => {
    const noteText = typeof note === 'object' ? (note.note_text || '') : note;
    const li = document.createElement('li');
    li.className = 'note-item';
    li.innerHTML = `
      <span class="note-number">${index + 1}</span>
      <div class="note-text">${escapeHtml(noteText)}</div>
    `;
    DOM.notesList.appendChild(li);
  });
}

// ============================================================================
// QUIZ & PRACTICE CAROUSEL ENGINE
// ============================================================================
function initQuizMode(cards) {
  AppState.quizIndex = 0;
  AppState.quizScore = { correct: 0, review: 0 };
  renderQuizCard();
}

function renderQuizCard() {
  const cards = AppState.currentDeck?.flashcards || [];
  if (!cards.length) return;

  const total = cards.length;
  const current = AppState.quizIndex;

  // Check if finished
  if (current >= total) {
    renderQuizSummary();
    return;
  }

  const card = cards[current];
  const progressPct = ((current) / total) * 100;

  DOM.quizProgressBar.style.width = `${progressPct}%`;
  DOM.quizCounterText.textContent = `Card ${current + 1} of ${total}`;

  DOM.quizCardWrapper.classList.remove('flipped');
  const diffClass = `diff-${(card.difficulty || 'medium').toLowerCase()}`;

  DOM.quizCardWrapper.innerHTML = `
    <div class="flashcard-inner">
      <!-- FRONT FACE -->
      <div class="card-face card-front">
        <div class="card-meta-top">
          <span class="card-type-tag">Quiz Question</span>
          <span class="card-difficulty ${diffClass}">${escapeHtml(card.difficulty || 'Medium')}</span>
        </div>
        <div class="card-body-content" style="align-items: center; text-align: center;">
          <span style="font-size: 0.85rem; color: var(--text-faint); margin-bottom: 0.5rem;">What is the definition of:</span>
          <h3 class="card-term">${escapeHtml(card.term)}</h3>
        </div>
        <div class="card-footer-action">
          <span class="flip-prompt"><i class="fas fa-lightbulb"></i> Click or press Space to check answer</span>
          <span>[Space: Flip]</span>
        </div>
      </div>

      <!-- BACK FACE -->
      <div class="card-face card-back">
        <div class="card-meta-top">
          <span class="card-type-tag">Answer & Explanation</span>
          <span class="card-difficulty ${diffClass}">${escapeHtml(card.difficulty || 'Medium')}</span>
        </div>
        <div class="card-body-content" style="text-align: center;">
          <p class="card-definition">${escapeHtml(card.definition)}</p>
        </div>
        <div class="card-footer-action">
          <span>Did you know this? Use buttons below</span>
          <span>[1: Got it | 2: Needs Review]</span>
        </div>
      </div>
    </div>
  `;
}

function answerQuizCard(gotIt) {
  if (gotIt) {
    AppState.quizScore.correct++;
    showToast('Mastered concept! +1', 'success');
  } else {
    AppState.quizScore.review++;
    showToast('Marked for review', 'info');
  }

  AppState.quizIndex++;
  renderQuizCard();
}

function renderQuizSummary() {
  DOM.quizProgressBar.style.width = '100%';
  DOM.quizCounterText.textContent = 'Quiz Completed!';

  const total    = AppState.currentDeck.flashcards.length;
  const scorePct = Math.round((AppState.quizScore.correct / total) * 100);

  // Build DOM nodes — never use inline onclick strings (XSS risk)
  const face = document.createElement('div');
  face.className = 'card-face';
  face.style.cssText = 'position:relative;text-align:center;justify-content:center;gap:1rem;';

  face.innerHTML = `
    <i class="fas fa-trophy" style="font-size:3rem;color:#f59e0b;"></i>
    <h2 style="font-family:var(--font-heading);font-size:1.8rem;">Practice Session Complete!</h2>
    <p style="font-size:1.1rem;color:var(--text-muted);">
      Mastery Score:
      <strong style="color:var(--accent-emerald);">${scorePct}%</strong>
      (${AppState.quizScore.correct} of ${total} cards)
    </p>
    <div style="display:flex;gap:1rem;justify-content:center;margin-top:1rem;">
      <button id="quizRestartBtn" class="btn btn-primary">
        <i class="fas fa-redo"></i> Restart Quiz
      </button>
      <button id="quizBackBtn" class="btn btn-secondary">
        <i class="fas fa-th-large"></i> Back to 3D Cards
      </button>
    </div>
  `;

  DOM.quizCardWrapper.innerHTML = '';
  DOM.quizCardWrapper.appendChild(face);

  face.querySelector('#quizRestartBtn').addEventListener('click',
    () => initQuizMode(AppState.currentDeck.flashcards));
  face.querySelector('#quizBackBtn').addEventListener('click',
    () => switchTab('grid'));
}

// ============================================================================
// TAB NAVIGATION
// ============================================================================
function switchTab(tabId) {
  AppState.activeTab = tabId;

  // Update tab buttons
  DOM.tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  // Update tab panes
  DOM.tabPanes.forEach(pane => {
    pane.style.display = pane.id === `${tabId}Pane` ? 'block' : 'none';
  });
}

// ============================================================================
// TOOLBAR ACTIONS: SEARCH, FLIP ALL, SHUFFLE, EXPORT
// ============================================================================
function filterFlashcards() {
  const cards = DOM.flashcardsGrid.querySelectorAll('.flashcard-wrapper');
  cards.forEach(cardEl => {
    const term = cardEl.querySelector('.card-term')?.textContent.toLowerCase() || '';
    const def = cardEl.querySelector('.card-definition')?.textContent.toLowerCase() || '';
    const matches = term.includes(AppState.searchTerm) || def.includes(AppState.searchTerm);
    cardEl.style.display = matches ? 'block' : 'none';
  });
}

function toggleFlipAllCards() {
  AppState.allFlipped = !AppState.allFlipped;
  DOM.flashcardsGrid.querySelectorAll('.flashcard-wrapper').forEach(card => {
    card.classList.toggle('flipped', AppState.allFlipped);
  });
  showToast(AppState.allFlipped ? 'Revealed all definitions' : 'Flipped all cards to terms', 'info');
}

function shuffleCurrentCards() {
  if (!AppState.currentDeck?.flashcards?.length) return;
  const cards = [...AppState.currentDeck.flashcards];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  AppState.currentDeck.flashcards = cards;
  renderFlashcardsGrid(cards);
  showToast('Cards shuffled randomly', 'info');
}

function exportDeckAsJson() {
  if (!AppState.currentDeck) return;
  const jsonStr = JSON.stringify(AppState.currentDeck, null, 2);
  downloadBlob(jsonStr, `${slugify(AppState.currentDeck.title)}.json`, 'application/json');
  showToast('Deck exported to JSON file', 'success');
}

function exportDeckAsCsv() {
  if (!AppState.currentDeck?.flashcards?.length) return;
  const headers = ['Front / Term', 'Back / Definition', 'Difficulty', 'Type'];
  const rows = AppState.currentDeck.flashcards.map(c => [
    `"${(c.term || '').replace(/"/g, '""')}"`,
    `"${(c.definition || '').replace(/"/g, '""')}"`,
    `"${c.difficulty || 'medium'}"`,
    `"${c.card_type || 'definition'}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadBlob(csvContent, `${slugify(AppState.currentDeck.title)}.csv`, 'text/csv;charset=utf-8;');
  showToast('Deck exported to Anki-compatible CSV', 'success');
}

function downloadBlob(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// DECK HISTORY & SIDEBAR MANAGEMENT
// ============================================================================
async function loadDecksHistory() {
  try {
    const res = await fetch('generate.php?action=list_decks');
    const data = await res.json();

    if (data.status === 'success' && DOM.historyList) {
      renderDecksHistory(data.decks || []);
    }
  } catch (err) {
    console.warn('Could not load history list:', err);
  }
}

function renderDecksHistory(decks) {
  DOM.historyList.innerHTML = '';

  if (!decks.length) {
    DOM.historyList.innerHTML = '<li style="font-size: 0.78rem; color: var(--text-faint); padding: 0.5rem;">No saved decks yet.</li>';
    return;
  }

  decks.forEach(deck => {
    const li = document.createElement('li');
    li.className = `history-item ${AppState.currentDeck?.id === deck.id ? 'active' : ''}`;
    
    li.innerHTML = `
      <div class="history-info">
        <div class="history-name">${escapeHtml(deck.title)}</div>
        <div class="history-meta">${deck.card_count || 0} cards • ${deck.created_at ? new Date(deck.created_at).toLocaleDateString() : 'Recent'}</div>
      </div>
      <button class="history-delete" title="Delete Deck" data-id="${deck.id}">
        <i class="fas fa-trash-alt"></i>
      </button>
    `;

    // Click to Load Deck
    li.querySelector('.history-info').addEventListener('click', () => loadDeckById(deck.id));

    // Click to Delete Deck
    li.querySelector('.history-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDeckById(deck.id, deck.title);
    });

    DOM.historyList.appendChild(li);
  });
}

async function loadDeckById(deckId) {
  try {
    const res = await fetch(`generate.php?action=get_deck&id=${deckId}`);
    const data = await res.json();

    if (data.status === 'success') {
      AppState.currentDeck = data.deck;
      renderActiveDeck(data.deck);
      loadDecksHistory();
      showToast(`Loaded deck: ${data.deck.title}`, 'info');
    }
  } catch (err) {
    showToast('Failed to load selected deck.', 'error');
  }
}

async function deleteDeckById(deckId, title) {
  if (!confirm(`Are you sure you want to delete "${title}"?`)) {
    return;
  }

  try {
    const res = await fetch('generate.php?action=delete_deck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deckId })
    });
    const data = await res.json();

    if (data.status === 'success') {
      showToast('Deck deleted.', 'info');
      if (AppState.currentDeck?.id === deckId) {
        AppState.currentDeck = null;
        DOM.activeDeckView.style.display = 'none';
        DOM.emptyState.style.display = 'flex';
      }
      loadDecksHistory();
    }
  } catch (err) {
    showToast('Failed to delete deck.', 'error');
  }
}

// ============================================================================
// UTILITIES (TOAST NOTIFICATIONS, ESCAPING, SLUGIFY)
// ============================================================================
function showToast(message, type = 'info') {
  if (!DOM.toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconMap = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
  };

  toast.innerHTML = `
    <i class="fas ${iconMap[type] || 'fa-bell'}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '_')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}
