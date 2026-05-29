function createLogsRepo(db) {
  const insertStmt = db.prepare(
    `INSERT INTO log_lines (run_id, stream, line_number, written_at, content)
     VALUES (?, ?, ?, ?, ?)`
  );

  const insertIgnoreStmt = db.prepare(
    `INSERT OR IGNORE INTO log_lines (run_id, stream, line_number, written_at, content)
     VALUES (?, ?, ?, ?, ?)`
  );

  const selectRangeStmt = db.prepare(
    `SELECT line_number, content FROM log_lines
     WHERE run_id = ? AND stream = ? AND line_number > ? AND line_number <= ?
     ORDER BY line_number ASC`
  );

  const selectAfterStmt = db.prepare(
    `SELECT line_number, content FROM log_lines
     WHERE run_id = ? AND stream = ? AND line_number > ?
     ORDER BY line_number ASC`
  );

  const selectAllStmt = db.prepare(
    `SELECT content FROM log_lines
     WHERE run_id = ? AND stream = ?
     ORDER BY line_number ASC`
  );

  const countStmt = db.prepare(
    `SELECT COUNT(*) AS n FROM log_lines WHERE run_id = ? AND stream = ?`
  );

  const maxLineStmt = db.prepare(
    `SELECT MAX(line_number) AS max FROM log_lines WHERE run_id = ? AND stream = ?`
  );

  const deleteForRunStmt = db.prepare(`DELETE FROM log_lines WHERE run_id = ?`);

  function appendBatch(stmt, runId, stream, lines, startLine, writtenAt) {
    if (!lines.length) return startLine;
    const ts = writtenAt || new Date().toISOString();
    if (lines.length === 1) {
      stmt.run(runId, stream, startLine + 1, ts, lines[0]);
      return startLine + 1;
    }
    db.exec('BEGIN');
    try {
      let n = startLine;
      for (const content of lines) {
        n += 1;
        stmt.run(runId, stream, n, ts, content);
      }
      db.exec('COMMIT');
      return n;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function appendLogLines(runId, stream, lines, startLine, writtenAt) {
    return appendBatch(insertStmt, runId, stream, lines, startLine, writtenAt);
  }

  function appendLogLinesIgnore(runId, stream, lines, startLine, writtenAt) {
    return appendBatch(insertIgnoreStmt, runId, stream, lines, startLine, writtenAt);
  }

  return {
    appendLogLines,
    appendLogLinesIgnore,

    getLogLines(runId, stream, { offset = 0, limit = 0 } = {}) {
      const start = Math.max(0, offset);
      const end = limit > 0 ? start + limit : Number.MAX_SAFE_INTEGER;
      const rows = selectRangeStmt.all(runId, stream, start, end);
      const total = countStmt.get(runId, stream).n;
      const hasMore = limit > 0 && (start + rows.length) < total;
      return {
        lines: rows.map((r) => r.content),
        offset: start,
        limit,
        hasMore,
        total,
      };
    },

    getLogLinesAfter(runId, stream, after) {
      const a = Math.max(0, after | 0);
      const rows = selectAfterStmt.all(runId, stream, a);
      const lastLine = rows.length ? rows[rows.length - 1].line_number : a;
      return { lines: rows.map((r) => r.content), lastLine };
    },

    getStreamCount(runId, stream) {
      return countStmt.get(runId, stream).n;
    },

    getMaxLineNumber(runId, stream) {
      return maxLineStmt.get(runId, stream).max ?? 0;
    },

    getStreamContent(runId, stream) {
      const rows = selectAllStmt.all(runId, stream);
      return rows.map((r) => r.content).join('\n');
    },

    deleteLogsForRun(runId) {
      const info = deleteForRunStmt.run(runId);
      return info.changes;
    },
  };
}

module.exports = { createLogsRepo };
