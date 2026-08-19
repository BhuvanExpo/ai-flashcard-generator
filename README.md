# AI-Powered Flashcard & Study Notes Generator

**An Intelligent Knowledge Extraction & Interactive Revision System**  
*Academic Project | B.Tech Computer Science & Engineering*

---

## 1. Project Overview & Abstract

The **AI-Powered Flashcard & Study Notes Generator** is a full-stack educational technology application designed to convert unstructured lecture transcripts, academic articles, and study material into structured learning assets.

Using **Natural Language Processing (NLP)** heuristics combined with **Scikit-learn TF-IDF** vectorization, the system automatically generates:
1. **Interactive 3D Flip Flashcards** with difficulty classification and category tagging.
2. **Extractive Study Notes** for rapid pre-exam revision.
3. **Practice Quiz Mode** with real-time mastery tracking.

---

## 2. Architecture & Data Flow

```
BROWSER (HTML5 + Vanilla JS + CSS3)
         |
   HTTP POST (JSON)
         |
 PHP 8.x Backend (generate.php)
   - Input validation & XSS sanitisation
   - proc_open() IPC via stdin/stdout pipes
   - PDO SQLite transactions
         |
   JSON over stdin
         |
 Python NLP Engine (nlp_engine.py)
   - Sentence segmentation & normalisation
   - Regex definition pattern extraction
   - Scikit-learn TF-IDF vectorisation
   - Extractive summarisation
         |
   JSON to stdout
         |
 SQLite Database (flashcards.db)
   - decks, flashcards, study_notes tables
```

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3 (Glassmorphism / 3D flip), Vanilla JS ES6+ |
| Backend | PHP 8.x, PDO SQLite |
| NLP Engine | Python 3.9+, Scikit-learn, NumPy, Regex |
| Database | SQLite 3 (WAL mode, FK constraints) |
| Security | Apache `.htaccess`, proc_open pipes, prepared statements |

---

## 4. Security Engineering

1. **SQL Injection:** 100% PDO prepared statements with bound parameters.
2. **XSS Mitigation:** `strip_tags()` server-side + `textContent`/`escapeHtml()` client-side.
3. **Subprocess Isolation:** Data passed via `stdin` pipe, never as shell arguments.
4. **Error Exposure:** Python `stderr` is logged server-side only, never sent to the client.
5. **Access Control:** `.htaccess` blocks direct HTTP access to `.db`, `.py`, `.json` files.
6. **Route Safety:** `filter_input()` for all GET parameters; strict action/method gating.

---

## 5. Project Structure

```
ai-flashcard-generator/
|
+-- index.php          # Frontend dashboard & UI
+-- generate.php       # PHP/Python bridge & REST endpoints
+-- database.php       # SQLite connection & schema
+-- nlp_engine.py      # Python NLP & TF-IDF extraction engine
+-- .htaccess          # Apache security rules
+-- requirements.txt   # Python dependencies
+-- README.md
|
+-- static/
    +-- style.css      # 3D CSS design system & dark/light themes
    +-- script.js      # DOM controller, quiz engine, export logic
```

---

## 6. Quick Start

### Prerequisites
- PHP 8.0+ with `pdo_sqlite` extension enabled
- Python 3.8+ with pip

### Setup
```bash
# 1. Install Python NLP dependencies
pip install -r requirements.txt

# 2. Start the PHP local development server
php -S localhost:8000

# 3. Open in browser
# http://localhost:8000
```

---

## 7. NLP Algorithm

### TF-IDF Weighting
For term `t` in sentence `d` across corpus `D`:
```
TF-IDF(t, d, D) = TF(t, d) x IDF(t, D)
IDF(t, D) = ln((1 + |D|) / (1 + |{d : t in d}|)) + 1  [smooth]
```

### Definition Grammar Patterns
- `[Term] is/are defined as [Definition]`
- `[Term] refers to / denotes / signifies [Definition]`
- `[Term] is a/an [Type] that/which [Function]`
- `The primary function of [Term] is to [Action]`
- `[Term] : [Definition]` (key-value notation)

---

## 8. Viva Q&A

**Q: How does PHP communicate with Python?**  
A: Via `proc_open()` — the JSON payload is written to Python's `stdin` pipe; output is read from `stdout`. No shell arguments are used, eliminating injection vectors.

**Q: What if Scikit-learn is unavailable?**  
A: The engine detects the `ImportError` and silently falls back to a pure-Python frequency-based keyword extractor.

**Q: How does the 3D card flip work?**  
A: Pure CSS3 — `perspective`, `transform-style: preserve-3d`, `backface-visibility: hidden`. JavaScript toggles the `.flipped` class which triggers `rotateY(180deg)`.

**Q: How is SQL injection prevented?**  
A: All queries use PDO parameterized statements with `:named` placeholders, completely separating query logic from user data.
