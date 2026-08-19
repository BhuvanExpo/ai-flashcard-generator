#!/usr/bin/env python3
"""
AI-Powered Flashcard & Study Notes Generator - NLP Engine
==========================================================
Reads a JSON object from stdin:  {"title": "...", "text": "..."}
Writes a JSON object to stdout.

Pipeline:
  1. Text normalisation & sentence segmentation
  2. Grammar-pattern (regex) definition extraction
  3. Scikit-learn TF-IDF keyword extraction  (falls back to frequency counts)
  4. Extractive sentence summarisation
"""

import sys
import json
import re
import math
from typing import Any

# Optional ML dependency - graceful fallback if absent
SKLEARN_AVAILABLE = False
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    import numpy as np
    SKLEARN_AVAILABLE = True
except ImportError:
    pass


# ---------------------------------------------------------------------------
# Stop-word set (academic + standard English)
# ---------------------------------------------------------------------------
_STOP_WORDS: frozenset = frozenset({
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an',
    'and', 'any', 'are', "aren't", 'as', 'at', 'be', 'because', 'been',
    'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can',
    "can't", 'cannot', 'could', "couldn't", 'did', "didn't", 'do', 'does',
    "doesn't", 'doing', "don't", 'down', 'during', 'each', 'few', 'for',
    'from', 'further', 'had', "hadn't", 'has', "hasn't", 'have', "haven't",
    'having', 'he', "he'd", "he'll", "he's", 'her', 'here', "here's",
    'hers', 'herself', 'him', 'himself', 'his', 'how', "how's", 'i', "i'd",
    "i'll", "i'm", "i've", 'if', 'in', 'into', 'is', "isn't", 'it', "it's",
    'its', 'itself', "let's", 'me', 'more', 'most', "mustn't", 'my',
    'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
    'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
    'same', "shan't", 'she', "she'd", "she'll", "she's", 'should',
    "shouldn't", 'so', 'some', 'such', 'than', 'that', "that's", 'the',
    'their', 'theirs', 'them', 'themselves', 'then', 'there', "there's",
    'these', 'they', "they'd", "they'll", "they're", "they've", 'this',
    'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
    "wasn't", 'we', "we'd", "we'll", "we're", "we've", 'were', "weren't",
    'what', "what's", 'when', "when's", 'where', "where's", 'which',
    'while', 'who', "who's", 'whom', 'why', "why's", 'with', "won't",
    'would', "wouldn't", 'you', "you'd", "you'll", "you're", "you've",
    'your', 'yours', 'yourself', 'yourselves',
    # Academic / lecture noise
    'also', 'chapter', 'class', 'discuss', 'lecture', 'moving', 'next',
    'professor', 'slide', 'students', 'talk', 'today', 'welcome',
})

# Abbreviations to protect during sentence splitting
_ABBREVIATIONS: list = [
    'approx', 'al', 'dr', 'e.g', 'eq', 'etc', 'fig', 'i.e', 'mr',
    'mrs', 'ms', 'prof', 'vs',
]


class NLPEngine:
    """Extracts flashcard term-definition pairs and study notes from text."""

    # Regex definition patterns: (compiled_pattern, term_group, def_group, card_type_label)
    _PATTERNS = [
        # "X is/are defined as Y"
        (re.compile(
            r'\b([A-Z][a-zA-Z0-9 \-]{2,50})\s+(?:is|are|was|were)\s+defined\s+as\s+([^.?!;:\n]+[.?!])',
            re.IGNORECASE), 1, 2, 'Formal Definition'),

        # "X refers to / denotes / signifies Y"
        (re.compile(
            r'\b([A-Z][a-zA-Z0-9 \-]{2,50})\s+(?:refers\s+to|denotes|signifies|represents|describes)\s+([^.?!;:\n]+[.?!])',
            re.IGNORECASE), 1, 2, 'Concept Reference'),

        # "X is a/an <noun> that/which ..."
        (re.compile(
            r'\b([A-Z][a-zA-Z0-9 \-]{2,45})\s+(?:is|are)\s+(?:an?|the)\s+'
            r'([a-zA-Z0-9 \-]+(?:\s+(?:that|which|used\s+to|responsible\s+for|characterized\s+by|capable\s+of)\s+[^.?!;\n]+)[.?!])',
            re.IGNORECASE), 1, 2, 'Descriptive Definition'),

        # "X stands for / is short for Y"
        (re.compile(
            r'\b([A-Z0-9]{2,15})\s+(?:stands\s+for|is\s+short\s+for|is\s+an\s+acronym\s+for)\s+([^.?!;\n]+[.?!])',
            re.IGNORECASE), 1, 2, 'Acronym / Abbreviation'),

        # "Term : Definition" key-value notation
        (re.compile(
            r'^\s*([A-Za-z0-9 \-/]{3,45})\s*:\s*([A-Z][^.?!;\n]{15,}[.?!]?)',
            re.MULTILINE), 1, 2, 'Structured Term'),

        # "The primary function of X is to Y"
        (re.compile(
            r'The\s+(?:primary|main|key|fundamental)\s+(?:function|purpose|role|objective)\s+of\s+'
            r'([a-zA-Z0-9 \-]{3,40})\s+(?:is\s+to|is)\s+([^.?!;\n]+[.?!])',
            re.IGNORECASE), 1, 2, 'Functional Purpose'),

        # "X is essentially/basically Y"
        (re.compile(
            r'\b([A-Z][a-zA-Z0-9 \-]{2,40})\s+(?:is|are)\s+(?:essentially|basically|fundamentally)\s+([^.?!;\n]+[.?!])',
            re.IGNORECASE), 1, 2, 'Core Essence'),
    ]

    # Regex for explanatory verbs (used in sentence scoring)
    _EXPL_VERBS = re.compile(
        r'\b(is|are|means|provides|enables|functions|acts|serves|stores|calculates)\b',
        re.IGNORECASE,
    )
    _SIGNAL_WORDS = re.compile(
        r'\b(crucial|important|fundamental|essential|key|primary|significant|'
        r'mechanism|principle|process|result|therefore|thus)\b', re.IGNORECASE)
    _DEF_MARKERS = re.compile(
        r'\b(is defined as|refers to|consists of|characterized by|functions as)\b',
        re.IGNORECASE)

    def __init__(self, min_term: int = 3, max_term: int = 60) -> None:
        self.min_term = min_term
        self.max_term = max_term

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def process(self, text: str, title: str = '') -> dict:
        """Run the full pipeline and return a result dict."""
        cleaned = self._clean(text)
        words   = re.findall(r'\b\w+\b', cleaned)
        wcount  = len(words)

        if wcount < 10:
            return {
                'status':      'error',
                'message':     'Transcript too short - provide at least 15 words.',
                'flashcards':  [],
                'study_notes': [],
                'stats':       {'word_count': wcount, 'cards_generated': 0},
            }

        sentences = self._segment(cleaned)
        regex_cards   = self._extract_regex(cleaned, sentences)
        seen          = {c['term'].lower() for c in regex_cards}
        target        = max(5, min(20, math.ceil(wcount / 35)))
        tfidf_cards   = self._extract_tfidf(sentences, seen, max(3, target - len(regex_cards)))
        all_cards     = regex_cards + tfidf_cards

        if not all_cards and sentences:
            s = sentences[0]
            all_cards.append({
                'term':       title or 'Main Concept',
                'definition': s if s.endswith('.') else s + '.',
                'type':       'Key Overview',
                'difficulty': 'medium',
                'importance': 0.8,
            })

        notes = self._summarise(sentences, min(8, max(3, len(sentences) // 3)))

        return {
            'status':      'success',
            'deck_title':  title or 'Generated Study Deck',
            'flashcards':  all_cards,
            'study_notes': notes,
            'stats': {
                'word_count':      wcount,
                'sentence_count':  len(sentences),
                'cards_generated': len(all_cards),
                'notes_generated': len(notes),
                'nlp_engine':      'Scikit-Learn TF-IDF + Regex' if SKLEARN_AVAILABLE
                                   else 'Regex + Frequency Heuristics',
            },
        }

    # ------------------------------------------------------------------
    # Text normalisation
    # ------------------------------------------------------------------

    def _clean(self, text: str) -> str:
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        for src, dst in (('\u201c', '"'), ('\u201d', '"'), ('\u2018', "'"), ('\u2019', "'"),
                          ('\u2014', ' - '), ('\u2013', ' - ')):
            text = text.replace(src, dst)
        text = re.sub(r'[ \t]+', ' ', text)
        return text.strip()

    # ------------------------------------------------------------------
    # Sentence segmentation
    # ------------------------------------------------------------------

    def _segment(self, text: str) -> list:
        """Rule-based splitter that respects abbreviations and decimals."""
        masked = text
        for abbr in _ABBREVIATIONS:
            masked = re.sub(re.escape(abbr) + r'\.', abbr + '@#@', masked, flags=re.IGNORECASE)
        masked = re.sub(r'(\d+)\.(\d+)', r'\1@#@\2', masked)

        parts = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9"\'`])|\n{2,}', masked)
        result = []
        for s in parts:
            s = s.replace('@#@', '.').strip()
            s = re.sub(r'^[\s*\-\u2022>#\d.)]+', '', s).strip()
            if len(s) >= 20:
                result.append(s)
        return result

    # ------------------------------------------------------------------
    # Regex definition extraction
    # ------------------------------------------------------------------

    def _normalise_term(self, raw: str) -> str:
        t = raw.strip().strip(':').strip('-').strip()
        t = re.sub(r'^(the|a|an)\s+', '', t, flags=re.IGNORECASE).strip(' "\'')
        return t

    def _is_valid_term(self, term: str, seen: set) -> bool:
        norm = term.lower()
        return (
            self.min_term <= len(term) <= self.max_term
            and norm not in seen
            and norm not in _STOP_WORDS
            and len(term.split()) <= 6
        )

    def _make_card(self, term: str, definition: str, card_type: str, importance: float) -> dict:
        if not definition.endswith('.'):
            definition += '.'
        display = term.title() if len(term.split()) <= 3 and not term.isupper() else term
        return {
            'term':       display,
            'definition': definition,
            'type':       card_type,
            'difficulty': self._difficulty(term, definition),
            'importance': importance,
        }

    def _extract_regex(self, text: str, sentences: list) -> list:
        cards = []
        seen  = set()

        for pattern, tg, dg, ctype in self._PATTERNS:
            for match in pattern.finditer(text):
                term = self._normalise_term(match.group(tg))
                defn = match.group(dg).strip()
                if len(defn) < 20 or not self._is_valid_term(term, seen):
                    continue
                cards.append(self._make_card(term, defn, ctype, 0.95))
                seen.add(term.lower())

        for sent in sentences:
            for pattern, tg, dg, ctype in self._PATTERNS:
                m = pattern.search(sent)
                if not m:
                    continue
                term = self._normalise_term(m.group(tg))
                defn = m.group(dg).strip()
                if len(defn) < 20 or not self._is_valid_term(term, seen):
                    continue
                cards.append(self._make_card(term, defn, ctype, 0.90))
                seen.add(term.lower())

        return cards

    # ------------------------------------------------------------------
    # TF-IDF concept extraction
    # ------------------------------------------------------------------

    def _best_sentence(self, term: str, sentences: list) -> str:
        """Return the most informative sentence containing term."""
        rgx = re.compile(r'\b' + re.escape(term) + r'\b', re.IGNORECASE)
        best, best_score = '', -1.0
        for sent in sentences:
            if not rgx.search(sent):
                continue
            n = len(sent)
            length_w = 0.5 if n < 35 else (0.7 if n > 220 else 1.0)
            verb_w   = 1.3 if self._EXPL_VERBS.search(sent) else 1.0
            score    = n * length_w * verb_w
            if score > best_score:
                best, best_score = sent, score
        return best

    def _extract_tfidf(self, sentences: list, seen: set, max_cards: int) -> list:
        cards = []

        if SKLEARN_AVAILABLE and len(sentences) >= 2:
            try:
                vec    = TfidfVectorizer(ngram_range=(1, 3), stop_words='english',
                                         min_df=1, max_df=0.95, sublinear_tf=True)
                matrix = vec.fit_transform(sentences)
                names  = vec.get_feature_names_out()
                scores = np.asarray(matrix.sum(axis=0)).flatten()

                for idx in np.argsort(scores)[::-1]:
                    if len(cards) >= max_cards:
                        break
                    phrase = names[idx].strip()
                    norm   = phrase.lower()
                    if (len(phrase) < self.min_term or norm in seen
                            or norm in _STOP_WORDS or phrase.isdigit()
                            or len(phrase.split()) > 4):
                        continue
                    sent = self._best_sentence(phrase, sentences)
                    if not sent:
                        continue
                    defn  = sent if sent.endswith('.') else sent + '.'
                    score = float(scores[idx]) / len(sentences)
                    cards.append({
                        'term':       phrase.title(),
                        'definition': defn,
                        'type':       'Key Concept (TF-IDF)',
                        'difficulty': self._difficulty(phrase, defn),
                        'importance': min(0.85, round(score * 2.0, 2)),
                    })
                    seen.add(norm)
            except Exception as exc:
                # Log warning but continue to frequency fallback
                print(f'[nlp_engine] WARNING: TF-IDF failed: {exc}', file=sys.stderr)

        # Frequency fallback (runs if sklearn yielded < 3 cards)
        if len(cards) < 3:
            cards.extend(self._freq_fallback(sentences, seen, max_cards - len(cards)))

        return cards

    def _freq_fallback(self, sentences: list, seen: set, n: int) -> list:
        freq = {}
        for s in sentences:
            for w in re.findall(r'\b[a-zA-Z]{4,25}\b', s.lower()):
                if w not in _STOP_WORDS:
                    freq[w] = freq.get(w, 0) + 1

        result = []
        for word, count in sorted(freq.items(), key=lambda x: x[1], reverse=True):
            if len(result) >= n:
                break
            if word in seen or count < 2:
                continue
            rgx = re.compile(r'\b' + re.escape(word) + r'\b', re.IGNORECASE)
            for s in sentences:
                if rgx.search(s):
                    defn = s if s.endswith('.') else s + '.'
                    result.append({
                        'term':       word.title(),
                        'definition': defn,
                        'type':       'Frequency Concept',
                        'difficulty': 'medium',
                        'importance': 0.70,
                    })
                    seen.add(word)
                    break
        return result

    # ------------------------------------------------------------------
    # Extractive summarisation
    # ------------------------------------------------------------------

    def _summarise(self, sentences: list, max_notes: int) -> list:
        if not sentences:
            return []

        total = len(sentences)
        scored = []
        for i, sent in enumerate(sentences):
            s = 0.0
            n = len(sent)
            if 50 <= n <= 180:
                s += 2.0
            elif n < 30:
                s -= 1.0
            if self._SIGNAL_WORDS.search(sent):
                s += 2.5
            if self._DEF_MARKERS.search(sent):
                s += 2.0
            s *= max(0.5, 1.0 - (i / total) * 0.4)
            scored.append((sent, s))

        top = {s for s, _ in sorted(scored, key=lambda x: x[1], reverse=True)[:max_notes]}

        notes = []
        for sent in sentences:
            if sent in top and sent not in notes:
                notes.append(sent if sent.endswith('.') else sent + '.')
            if len(notes) >= max_notes:
                break
        return notes

    # ------------------------------------------------------------------
    # Difficulty heuristic
    # ------------------------------------------------------------------

    def _difficulty(self, term: str, definition: str) -> str:
        words   = (term + ' ' + definition).split()
        avg_len = sum(len(w) for w in words) / max(1, len(words))
        if len(words) > 30 or avg_len > 6.2:
            return 'hard'
        if len(words) > 15 or avg_len > 5.2:
            return 'medium'
        return 'easy'


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    raw = sys.stdin.read().strip()

    if not raw:
        sys.stdout.write(json.dumps({
            'status': 'error',
            'message': 'No input received on stdin.',
        }))
        return

    try:
        payload    = json.loads(raw)
        transcript = payload.get('text', '')
        title      = payload.get('title', '')
    except json.JSONDecodeError:
        transcript = raw
        title      = 'Extracted Lecture Deck'

    result = NLPEngine().process(transcript, title)
    sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
    sys.stdout.flush()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        sys.stdout.write(json.dumps({
            'status':      'error',
            'message':     f'NLP Engine Exception: {exc}',
            'flashcards':  [],
            'study_notes': [],
        }))
        sys.stdout.flush()
        sys.exit(1)
