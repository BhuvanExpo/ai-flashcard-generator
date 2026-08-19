<?php
/**
 * ============================================================================
 * AI FLASHCARD & STUDY NOTES GENERATOR - DATABASE LAYER
 * ============================================================================
 *
 * Manages the SQLite connection, auto-migration of the schema, and all CRUD
 * operations via PDO prepared statements (zero SQL-injection surface).
 *
 * @package AI_Flashcards
 * @version 1.1.0
 * @license MIT
 */

declare(strict_types=1);

define('DB_PATH', __DIR__ . '/flashcards.db');

/**
 * Returns a singleton PDO connection to the SQLite database.
 * Enables WAL mode and enforces foreign-key constraints on first call.
 */
function getDbConnection(): PDO {
    static $pdo = null;

    if ($pdo !== null) {
        return $pdo;
    }

    try {
        $pdo = new PDO('sqlite:' . DB_PATH, null, null, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA journal_mode = WAL');
    } catch (PDOException $e) {
        error_log('[database.php] Connection error: ' . $e->getMessage());
        throw new RuntimeException('Database unavailable.');
    }

    return $pdo;
}

/**
 * Creates the tables and indexes if they do not already exist.
 * Each statement is executed separately — SQLite's exec() is single-statement.
 */
function initDatabaseSchema(): void {
    $db = getDbConnection();

    // Each string is one statement. SQLite exec() only handles one at a time.
    $statements = [
        'CREATE TABLE IF NOT EXISTS decks (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT    NOT NULL,
            transcript TEXT    NOT NULL,
            word_count INTEGER DEFAULT 0,
            card_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )',

        'CREATE TABLE IF NOT EXISTS flashcards (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            deck_id          INTEGER NOT NULL,
            term             TEXT    NOT NULL,
            definition       TEXT    NOT NULL,
            card_type        TEXT    DEFAULT \'definition\',
            difficulty       TEXT    DEFAULT \'medium\',
            importance_score REAL    DEFAULT 0.0,
            created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
        )',

        'CREATE TABLE IF NOT EXISTS study_notes (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            deck_id      INTEGER NOT NULL,
            note_text    TEXT    NOT NULL,
            bullet_order INTEGER DEFAULT 0,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
        )',

        'CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards(deck_id)',
        'CREATE INDEX IF NOT EXISTS idx_notes_deck      ON study_notes(deck_id)',
        'CREATE INDEX IF NOT EXISTS idx_decks_created   ON decks(created_at DESC)',
    ];

    foreach ($statements as $sql) {
        $db->exec($sql);
    }
}

/**
 * Inserts a deck with all its flashcards and notes in a single transaction.
 *
 * @param  string   $title
 * @param  string   $transcript
 * @param  array    $cards     Each element is an associative array from the NLP engine.
 * @param  array    $notes     Flat list of note strings.
 * @param  int      $wordCount
 * @return int      Newly created deck ID.
 * @throws Exception on transaction failure.
 */
function saveDeckWithCards(
    string $title,
    string $transcript,
    array  $cards,
    array  $notes     = [],
    int    $wordCount = 0
): int {
    $db = getDbConnection();
    $db->beginTransaction();

    try {
        // --- Deck row ---
        $db->prepare(
            'INSERT INTO decks (title, transcript, word_count, card_count)
             VALUES (:title, :transcript, :word_count, :card_count)'
        )->execute([
            ':title'      => $title,
            ':transcript' => $transcript,
            ':word_count' => $wordCount,
            ':card_count' => count($cards),
        ]);
        $deckId = (int) $db->lastInsertId();

        // --- Flashcard rows ---
        if ($cards !== []) {
            $cardStmt = $db->prepare(
                'INSERT INTO flashcards
                    (deck_id, term, definition, card_type, difficulty, importance_score)
                 VALUES
                    (:deck_id, :term, :definition, :card_type, :difficulty, :importance_score)'
            );
            foreach ($cards as $card) {
                $cardStmt->execute([
                    ':deck_id'          => $deckId,
                    ':term'             => trim((string)($card['term']       ?? 'Concept')),
                    ':definition'       => trim((string)($card['definition'] ?? '')),
                    ':card_type'        => $card['type']       ?? 'definition',
                    ':difficulty'       => $card['difficulty'] ?? 'medium',
                    ':importance_score' => (float)($card['importance'] ?? 0.5),
                ]);
            }
        }

        // --- Study note rows ---
        if ($notes !== []) {
            $noteStmt = $db->prepare(
                'INSERT INTO study_notes (deck_id, note_text, bullet_order)
                 VALUES (:deck_id, :note_text, :bullet_order)'
            );
            $order = 1;
            foreach ($notes as $note) {
                $text = is_array($note) ? ($note['note_text'] ?? '') : (string)$note;
                $text = trim($text);
                if ($text !== '') {
                    $noteStmt->execute([
                        ':deck_id'      => $deckId,
                        ':note_text'    => $text,
                        ':bullet_order' => $order++,
                    ]);
                }
            }
        }

        $db->commit();
        return $deckId;

    } catch (Exception $e) {
        $db->rollBack();
        error_log('[database.php] saveDeckWithCards failed: ' . $e->getMessage());
        throw $e;
    }
}

/**
 * Returns the most recent $limit decks (metadata only, no flashcards).
 */
function getAllDecks(int $limit = 30): array {
    $stmt = getDbConnection()->prepare(
        'SELECT id, title, word_count, card_count, created_at
         FROM   decks
         ORDER  BY created_at DESC
         LIMIT  :limit'
    );
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}

/**
 * Returns a deck with its flashcards and study notes, or null if not found.
 */
function getDeckById(int $deckId): ?array {
    $db = getDbConnection();

    $stmt = $db->prepare(
        'SELECT id, title, transcript, word_count, card_count, created_at
         FROM   decks
         WHERE  id = :id'
    );
    $stmt->execute([':id' => $deckId]);
    $deck = $stmt->fetch();

    if ($deck === false) {
        return null;
    }

    $cardStmt = $db->prepare(
        'SELECT id, term, definition, card_type, difficulty, importance_score
         FROM   flashcards
         WHERE  deck_id = :deck_id
         ORDER  BY importance_score DESC, id ASC'
    );
    $cardStmt->execute([':deck_id' => $deckId]);
    $deck['flashcards'] = $cardStmt->fetchAll();

    $noteStmt = $db->prepare(
        'SELECT id, note_text, bullet_order
         FROM   study_notes
         WHERE  deck_id = :deck_id
         ORDER  BY bullet_order ASC'
    );
    $noteStmt->execute([':deck_id' => $deckId]);
    $deck['study_notes'] = $noteStmt->fetchAll();

    return $deck;
}

/**
 * Deletes a deck; cascades to flashcards and study notes via FK constraints.
 */
function deleteDeck(int $deckId): bool {
    $stmt = getDbConnection()->prepare('DELETE FROM decks WHERE id = :id');
    return $stmt->execute([':id' => $deckId]);
}

// Bootstrap schema on first inclusion.
initDatabaseSchema();
