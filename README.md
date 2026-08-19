# AI-Powered Flashcard & Study Notes Generator

**An Intelligent Knowledge Extraction & Interactive Revision System**  
*Academic Project | B.Tech Computer Science & Engineering*

---

## 📌 1. Project Overview & Abstract

The **AI-Powered Flashcard & Study Notes Generator** is a full-stack educational technology application designed to convert unstructured lecture transcripts, academic articles, and study material into structured learning assets. 

Using **Natural Language Processing (NLP)** heuristics combined with **Scikit-learn's TF-IDF (Term Frequency–Inverse Document Frequency)** vectorization, the system identifies key definitions, acronyms, and high-salience concepts. It automatically generates:
1. **Interactive 3D Flip Flashcards** with difficulty classification and category tagging.
2. **Extractive Study Notes & Key Takeaways** for rapid pre-exam revision.
3. **Practice Quiz Mode** with real-time mastery tracking.

---

## 🏗️ 2. Architecture & Data Flow

```
+-------------------------------------------------------------------------+
|                              CLIENT (BROWSER)                           |
|  - HTML5 / Vanilla CSS3 (Glassmorphism & 3D CSS `preserve-3d` Flip)     |
|  - Vanilla JavaScript DOM Controller (AJAX, State, Quiz Engine)         |
+------------------------------------+------------------------------------+
                                     |
                          HTTP POST (JSON Payload)
                                     |
                                     v
+-------------------------------------------------------------------------+
|                        BACKEND BRIDGE (PHP 8.x)                         |
|  - Input Validation & XSS Sanitization (`strip_tags`, bounds check)     |
|  - Sub-process IPC via `proc_open()` (Non-blocking I/O stream)          |
|  - SQLite PDO Storage Layer with Prepared Statements (Transactions)     |
+------------------------------------+------------------------------------+
                                     |
                         Standard I/O Streams (JSON)
                                     |
                                     v
+-------------------------------------------------------------------------+
|                     NLP EXTRACTION ENGINE (Python 3)                    |
|  - Sentence Boundary Segmentation & Token Normalization                 |
|  - Rule-Based Regex Definition & Copular Pattern Extractor              |
|  - Scikit-learn TF-IDF Vectorizer (N-grams: 1-3) & Salience Ranking     |
|  - Extractive Summarizer (Sentence Centrality Scoring)                  |
+------------------------------------+------------------------------------+
                                     |
                                JSON Output
                                     v
+-------------------------------------------------------------------------+
|                       DATABASE LAYER (SQLite 3)                         |
|  - `decks` (Metadata, Transcript, Word Count)                           |
|  - `flashcards` (Term, Definition, Difficulty, Importance Score)        |
|  - `study_notes` (Extracted Bullet Points & Ordering)                   |
+-------------------------------------------------------------------------+
```

---

## 💻 3. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JS (ES6+) | Hardware-accelerated 3D card flips, responsive CSS Grid, Quiz Mode |
| **Backend** | PHP 8.x (PDO SQLite) | Request routing, security filtering, sub-process bridge via `proc_open` |
| **NLP Engine** | Python 3.9+, Scikit-learn, NumPy, Regex | TF-IDF term weighting, grammar pattern parsing, extractive summarization |
| **Database** | SQLite 3 | Zero-configuration relational storage with WAL mode & foreign keys |
| **Security** | Apache `.htaccess` | Blocks direct HTTP access to `.db`, `.py`, and config files |

---

## 🧠 4. NLP Algorithm & Mathematical Foundation

### 4.1. TF-IDF Weighting Formulation
For a term $t$ in a sentence or document $d$ within corpus $D$:
$$\text{TF-IDF}(t, d, D) = \text{TF}(t, d) \times \text{IDF}(t, D)$$

Where:
- $\text{TF}(t, d) = \frac{f_{t,d}}{\sum_{t' \in d} f_{t',d}}$ (Term Frequency)
- $\text{IDF}(t, D) = \ln\left(\frac{1 + |D|}{1 + |\{d \in D : t \in d\}|}\right) + 1$ (Smooth Inverse Document Frequency)

### 4.2. Heuristic Definition Patterns
The Python engine evaluates grammatical cues matching copular and definitional constructs:
- **Formal Definition:** `[Term] (is/are) defined as [Definition]`
- **Concept Reference:** `[Term] refers to / denotes / signifies [Definition]`
- **Descriptive Predicate:** `[Term] (is/are) a/an [Type] that/which [Function]`
- **Functional Role:** `The primary (purpose/function) of [Term] is to [Action]`
- **Key-Value Syntax:** `[Term] : [Definition]`

---

## 🛡️ 5. Security & Reliability Engineering

1. **SQL Injection Prevention:** 100% of database queries utilize PDO prepared statements with strict parameter binding.
2. **Cross-Site Scripting (XSS) Mitigation:** Multi-tiered defense using `strip_tags()` server-side and `textContent` / HTML entity escaping client-side.
3. **Subprocess Isolation:** `proc_open()` passes data directly via memory pipes (STDIN / STDOUT) rather than shell command arguments, eliminating shell injection vectors.
4. **Access Control (`.htaccess`):** Restricts direct browser requests to `.db`, `.py`, `.json`, and environment files.
5. **Database Integrity:** Foreign key cascading (`ON DELETE CASCADE`) and atomic transactions ensure consistent states upon deck creation or deletion.

---

## 📁 6. Complete Project Structure

```
ai-flashcards/
│
├── index.php             # Frontend dashboard & UI views
├── generate.php          # PHP/Python bridge & API endpoints
├── database.php          # SQLite connection & schema initialization
├── nlp_engine.py         # Python NLP & TF-IDF extraction script
├── .htaccess             # Apache server security rules
├── requirements.txt      # Python dependencies
├── README.md             # Project documentation
│
└── static/
    ├── style.css         # Modern 3D CSS design system & themes
    └── script.js         # Interactive DOM controller & quiz logic
```

---

## 🚀 7. Installation & Quick Start Guide

### Prerequisites
- **PHP 8.0+** with `pdo_sqlite` enabled
- **Python 3.8+** with `pip`

### Step 1: Clone or Navigate to Project Directory
```bash
cd "ai flash cards"
```

### Step 2: Set Up Python Virtual Environment & Dependencies
```bash
# Create a virtual environment
python3 -m venv venv

# Activate the virtual environment
# On macOS / Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install required NLP packages
pip install -r requirements.txt
```

### Step 3: Launch Local PHP Development Server
```bash
php -S localhost:8000
```

### Step 4: Open in Web Browser
Open your browser and navigate to:
```
http://localhost:8000
```

---

## 🎓 8. University Viva / Oral Examination FAQ

**Q1: How does the PHP backend communicate with the Python NLP script?**  
> **Answer:** Communication is established using PHP's `proc_open()` function. Instead of passing text via command-line arguments (which risks buffer overflow and shell injection), the payload is transmitted as a JSON string over the standard input stream (`stdin`). The Python script processes the stream and writes the resulting JSON directly to standard output (`stdout`), where PHP reads and parses it.

**Q2: What happens if Scikit-learn is not installed on the host machine?**  
> **Answer:** `nlp_engine.py` implements a resilient fallback architecture. If `sklearn` is unavailable, the script gracefully switches to an internal heuristic frequency-based keyword extractor without throwing uncaught exceptions.

**Q3: How is the 3D card flip animation achieved?**  
> **Answer:** The flip effect is powered by pure CSS3 3D transforms. The card container utilizes `perspective: 1200px` and `transform-style: preserve-3d`. The front and back faces have `backface-visibility: hidden`. When the `.flipped` class is toggled via JavaScript, `transform: rotateY(180deg)` smoothly reveals the back face using a custom cubic-bezier timing function.

**Q4: How does the system prevent SQL injection?**  
> **Answer:** All database operations in `database.php` use PHP Data Objects (PDO) with parameterized queries (`:param`), completely separating query logic from user-supplied data.
