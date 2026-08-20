"""
AI Flashcard & Study Notes Generator - Vercel Python API
=========================================================
Vercel serverless entrypoint (Flask WSGI app).
Replaces the PHP bridge: runs the NLP engine directly in-process
and uses an in-memory session store (Vercel has a read-only filesystem,
so flashcards.db is kept in /tmp which is writable but ephemeral).
"""

import sys
import os
import json
import sqlite3

from flask import Flask, request, jsonify, send_from_directory

# Make the repo root importable so nlp_engine.py can be resolved
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from nlp_engine import NLPEngine  # noqa: E402 – sibling import after path fix

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__, static_folder=os.path.join(ROOT, 'static'))

# Writable ephemeral path on Vercel (reset on cold-starts, fine for demos)
DB_PATH = '/tmp/flashcards.db'

# ---------------------------------------------------------------------------
# Database helpers  (lean SQLite – no PHP PDO needed here)
# ---------------------------------------------------------------------------

def get_db():
    """Return a cached SQLite connection stored on the app context."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA journal_mode = WAL')
    _init_schema(conn)
    return conn


def _init_schema(conn: sqlite3.Connection) -> None:
    stmts = [
        """CREATE TABLE IF NOT EXISTS decks (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT    NOT NULL,
            transcript TEXT    NOT NULL,
            word_count INTEGER DEFAULT 0,
            card_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS flashcards (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            deck_id          INTEGER NOT NULL,
            term             TEXT    NOT NULL,
            definition       TEXT    NOT NULL,
            card_type        TEXT    DEFAULT 'definition',
            difficulty       TEXT    DEFAULT 'medium',
            importance_score REAL    DEFAULT 0.0,
            FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS study_notes (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            deck_id      INTEGER NOT NULL,
            note_text    TEXT    NOT NULL,
            bullet_order INTEGER DEFAULT 0,
            FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
        )""",
        'CREATE INDEX IF NOT EXISTS idx_fc_deck ON flashcards(deck_id)',
        'CREATE INDEX IF NOT EXISTS idx_sn_deck ON study_notes(deck_id)',
    ]
    for sql in stmts:
        conn.execute(sql)
    conn.commit()


def _save_deck(title, transcript, cards, notes, word_count):
    conn = get_db()
    try:
        cur = conn.execute(
            'INSERT INTO decks (title, transcript, word_count, card_count) VALUES (?,?,?,?)',
            (title, transcript, word_count, len(cards))
        )
        deck_id = cur.lastrowid

        for card in cards:
            conn.execute(
                'INSERT INTO flashcards (deck_id, term, definition, card_type, difficulty, importance_score) VALUES (?,?,?,?,?,?)',
                (deck_id,
                 str(card.get('term', 'Concept'))[:255],
                 str(card.get('definition', ''))[:2000],
                 str(card.get('type', 'definition'))[:80],
                 str(card.get('difficulty', 'medium'))[:20],
                 float(card.get('importance', 0.5)))
            )

        for i, note in enumerate(notes, start=1):
            text = note if isinstance(note, str) else note.get('note_text', '')
            if text.strip():
                conn.execute(
                    'INSERT INTO study_notes (deck_id, note_text, bullet_order) VALUES (?,?,?)',
                    (deck_id, text.strip()[:2000], i)
                )

        conn.commit()
        return deck_id
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _get_deck(deck_id):
    conn = get_db()
    try:
        deck = conn.execute('SELECT * FROM decks WHERE id=?', (deck_id,)).fetchone()
        if not deck:
            return None
        row = dict(deck)
        row['flashcards'] = [dict(r) for r in conn.execute(
            'SELECT * FROM flashcards WHERE deck_id=? ORDER BY importance_score DESC', (deck_id,)
        ).fetchall()]
        row['study_notes'] = [dict(r) for r in conn.execute(
            'SELECT * FROM study_notes WHERE deck_id=? ORDER BY bullet_order', (deck_id,)
        ).fetchall()]
        return row
    finally:
        conn.close()


def _get_all_decks(limit=50):
    conn = get_db()
    try:
        return [dict(r) for r in conn.execute(
            'SELECT id, title, word_count, card_count, created_at FROM decks ORDER BY created_at DESC LIMIT ?',
            (limit,)
        ).fetchall()]
    finally:
        conn.close()


def _delete_deck(deck_id):
    conn = get_db()
    try:
        conn.execute('DELETE FROM decks WHERE id=?', (deck_id,))
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _error(msg, status=400):
    return jsonify({'status': 'error', 'message': msg}), status


def _sanitize(text):
    """Very basic tag strip – mirrors PHP strip_tags."""
    import re
    return re.sub(r'<[^>]+>', '', text).strip()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route('/')
def serve_index():
    """Serve the main HTML UI."""
    return send_from_directory(ROOT, 'index.html')


@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(os.path.join(ROOT, 'static'), filename)


@app.route('/generate.php', methods=['GET', 'POST'])
@app.route('/api/generate', methods=['GET', 'POST'])
def generate():
    action = request.args.get('action', '')

    # ── GET list_decks ──────────────────────────────────────────────────────
    if request.method == 'GET' and action == 'list_decks':
        try:
            return jsonify({'status': 'success', 'decks': _get_all_decks()})
        except Exception as exc:
            return _error(f'Failed to list decks: {exc}', 500)

    # ── GET get_deck ────────────────────────────────────────────────────────
    if request.method == 'GET' and action == 'get_deck':
        deck_id = request.args.get('id', type=int)
        if not deck_id:
            return _error('Valid deck ID is required.', 400)
        deck = _get_deck(deck_id)
        if not deck:
            return _error('Deck not found.', 404)
        return jsonify({'status': 'success', 'deck': deck})

    # ── POST delete_deck ────────────────────────────────────────────────────
    if request.method == 'POST' and action == 'delete_deck':
        body = request.get_json(force=True, silent=True) or {}
        deck_id = body.get('id')
        if not deck_id:
            return _error('Valid deck ID required for deletion.', 400)
        ok = _delete_deck(int(deck_id))
        return jsonify({
            'status': 'success' if ok else 'error',
            'message': 'Deck deleted.' if ok else 'Could not delete deck.'
        })

    # ── POST generate flashcards ────────────────────────────────────────────
    if request.method == 'POST':
        body = request.get_json(force=True, silent=True) or request.form.to_dict()

        title      = _sanitize(str(body.get('title', '')))
        transcript = _sanitize(str(body.get('transcript', '')))

        if not title:
            from datetime import datetime
            title = f'Study Deck – {datetime.now().strftime("%b %d, %Y %I:%M %p")}'
        title = title[:120]

        tlen = len(transcript)
        if tlen < 25:
            return _error('Transcript is too brief – enter at least 25 characters.', 422)
        if tlen > 150_000:
            return _error('Transcript exceeds the 150 000-character limit.', 422)

        # Run NLP inline (no subprocess needed on Vercel – Python is native)
        try:
            result = NLPEngine().process(transcript, title)
        except Exception as exc:
            return _error('NLP processing failed. Check your transcript.', 500)

        if result.get('status') != 'success':
            return _error(result.get('message', 'Extraction failed.'), 422)

        flashcards  = result.get('flashcards', [])
        study_notes = result.get('study_notes', [])
        stats       = result.get('stats', {})
        word_count  = int(stats.get('word_count', len(transcript.split())))

        try:
            deck_id   = _save_deck(title, transcript, flashcards, study_notes, word_count)
            saved_deck = _get_deck(deck_id)
        except Exception as exc:
            return _error('Database error while saving deck.', 500)

        return jsonify({
            'status':  'success',
            'message': 'Flashcards generated successfully.',
            'deck_id': deck_id,
            'deck':    saved_deck,
            'stats':   stats,
        }), 201

    return _error('Invalid request.', 405)


# ---------------------------------------------------------------------------
# Local development entry-point
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    app.run(debug=True, port=5000)
