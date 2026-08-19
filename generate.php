<?php
/**
 * ============================================================================
 * AI FLASHCARD & STUDY NOTES GENERATOR - PROCESSING BRIDGE
 * ============================================================================
 *
 * Secure backend controller that:
 * 1. Validates and sanitises incoming user input.
 * 2. Spawns the Python NLP Engine via proc_open() stream pipes (no shell args).
 * 3. Persists the generated deck into SQLite via PDO prepared statements.
 * 4. Returns a structured JSON response to the frontend client.
 *
 * @package AI_Flashcards
 * @version 1.1.0
 * @license MIT
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Cache-Control: no-store');

require_once __DIR__ . '/database.php';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJsonResponse(array $data, int $statusCode = 200): never {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Return a sanitised, generic error — never expose internal details to clients. */
function sendError(string $publicMessage, int $status, string $logMessage = ''): never {
    if ($logMessage !== '') {
        error_log('[generate.php] ' . $logMessage);
    }
    sendJsonResponse(['status' => 'error', 'message' => $publicMessage], $status);
}

// Global fallback — still keeps internal detail server-side only.
set_exception_handler(static function (Throwable $e): never {
    error_log('[generate.php] Unhandled exception: ' . $e->getMessage());
    sendJsonResponse(['status' => 'error', 'message' => 'Internal server error.'], 500);
});

// ---------------------------------------------------------------------------
// Route dispatch
// ---------------------------------------------------------------------------

$method = $_SERVER['REQUEST_METHOD'] ?? '';
$action = filter_input(INPUT_GET, 'action', FILTER_SANITIZE_SPECIAL_CHARS) ?? '';

// ── GET /generate.php?action=list_decks ────────────────────────────────────
if ($method === 'GET' && $action === 'list_decks') {
    try {
        sendJsonResponse(['status' => 'success', 'decks' => getAllDecks(50)]);
    } catch (Exception $e) {
        sendError('Failed to retrieve decks.', 500, $e->getMessage());
    }
}

// ── GET /generate.php?action=get_deck&id=N ─────────────────────────────────
if ($method === 'GET' && $action === 'get_deck') {
    $deckId = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);
    if (!$deckId || $deckId < 1) {
        sendError('Valid deck ID is required.', 400);
    }
    try {
        $deck = getDeckById($deckId);
        if (!$deck) {
            sendError('Deck not found.', 404);
        }
        sendJsonResponse(['status' => 'success', 'deck' => $deck]);
    } catch (Exception $e) {
        sendError('Error fetching deck.', 500, $e->getMessage());
    }
}

// ── POST /generate.php?action=delete_deck ──────────────────────────────────
if ($method === 'POST' && $action === 'delete_deck') {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $deckId = filter_var($body['id'] ?? null, FILTER_VALIDATE_INT);
    if (!$deckId || $deckId < 1) {
        sendError('Valid deck ID required for deletion.', 400);
    }
    try {
        $deleted = deleteDeck($deckId);
        sendJsonResponse([
            'status'  => $deleted ? 'success' : 'error',
            'message' => $deleted ? 'Deck deleted successfully.' : 'Deck could not be deleted.',
        ]);
    } catch (Exception $e) {
        sendError('Database error during deletion.', 500, $e->getMessage());
    }
}

// ── POST /generate.php (generate flashcards) ───────────────────────────────
if ($method === 'POST') {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    $payload = (stripos($contentType, 'application/json') !== false)
        ? (json_decode(file_get_contents('php://input'), true) ?? [])
        : $_POST;

    // 1. Sanitise inputs -------------------------------------------------------
    $title      = strip_tags(trim((string)($payload['title'] ?? '')));
    $transcript = strip_tags(trim((string)($payload['transcript'] ?? '')));

    if ($title === '') {
        $title = 'Study Deck – ' . date('M j, Y g:i A');
    }
    $title = mb_substr($title, 0, 120, 'UTF-8');

    $transcriptLen = mb_strlen($transcript, 'UTF-8');
    if ($transcriptLen < 25) {
        sendError('Transcript is too brief — enter at least 25 characters.', 422);
    }
    if ($transcriptLen > 150_000) {
        sendError('Transcript exceeds the 150 000-character limit.', 422);
    }

    // 2. Resolve Python binary -------------------------------------------------
    $pythonBin = null;
    foreach (['/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3'] as $path) {
        if (is_executable($path)) {
            $pythonBin = $path;
            break;
        }
    }
    // Last resort: rely on $PATH
    $pythonBin ??= 'python3';

    $nlpScript = __DIR__ . '/nlp_engine.py';
    if (!is_file($nlpScript)) {
        sendError('NLP engine not found on server.', 500, 'nlp_engine.py missing');
    }

    // 3. Spawn NLP sub-process via pipe (no user data in argv) -----------------
    $descriptorspec = [
        0 => ['pipe', 'r'],  // stdin
        1 => ['pipe', 'w'],  // stdout
        2 => ['pipe', 'w'],  // stderr
    ];

    // Build command with fully-quoted binary and script path only.
    $command = escapeshellarg($pythonBin) . ' ' . escapeshellarg($nlpScript);
    $process = proc_open($command, $descriptorspec, $pipes, __DIR__);

    if (!is_resource($process)) {
        sendError('Could not start NLP process.', 500, 'proc_open failed');
    }

    // 4. Write JSON payload to stdin, then close to signal EOF -----------------
    fwrite($pipes[0], json_encode(['title' => $title, 'text' => $transcript], JSON_UNESCAPED_UNICODE));
    fclose($pipes[0]);

    // 5. Read with timeout via stream_select -----------------------------------
    $stdoutOutput = '';
    $stderrOutput = '';
    $deadline = microtime(true) + 20.0;

    while (microtime(true) < $deadline) {
        $read = [$pipes[1], $pipes[2]];
        $write = $except = [];
        if (@stream_select($read, $write, $except, 0, 200_000) === false) {
            break;
        }
        foreach ($read as $stream) {
            $chunk = fread($stream, 8192);
            if ($chunk === false || $chunk === '') {
                continue;
            }
            if ($stream === $pipes[1]) {
                $stdoutOutput .= $chunk;
            } else {
                $stderrOutput .= $chunk;
            }
        }
        if (feof($pipes[1]) && feof($pipes[2])) {
            break;
        }
    }

    fclose($pipes[1]);
    fclose($pipes[2]);
    $returnCode = proc_close($process);

    if ($returnCode !== 0 || $stdoutOutput === '') {
        // Log stderr server-side, never expose it to the client.
        error_log("[generate.php] NLP exit=$returnCode stderr=" . substr($stderrOutput, 0, 500));
        sendError('NLP processing failed. Check your transcript and try again.', 500);
    }

    // 6. Parse and validate NLP JSON ------------------------------------------
    $nlpResult = json_decode($stdoutOutput, true);
    if (!is_array($nlpResult) || ($nlpResult['status'] ?? '') !== 'success') {
        sendError($nlpResult['message'] ?? 'Could not extract flashcards from transcript.', 422);
    }

    $flashcards = $nlpResult['flashcards'] ?? [];
    $studyNotes = $nlpResult['study_notes'] ?? [];
    $stats      = $nlpResult['stats'] ?? [];
    $wordCount  = (int)($stats['word_count'] ?? str_word_count($transcript));

    // 7. Persist to SQLite -----------------------------------------------------
    try {
        $deckId    = saveDeckWithCards($title, $transcript, $flashcards, $studyNotes, $wordCount);
        $savedDeck = getDeckById($deckId);

        sendJsonResponse([
            'status'  => 'success',
            'message' => 'Flashcards generated successfully.',
            'deck_id' => $deckId,
            'deck'    => $savedDeck,
            'stats'   => $stats,
        ], 201);
    } catch (Exception $e) {
        sendError('Database error while saving deck.', 500, $e->getMessage());
    }
}

// Catch-all for unsupported methods/routes
sendError('Invalid request.', 405);
