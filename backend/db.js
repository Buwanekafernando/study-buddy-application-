// backend/db.js
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'studybuddy.db');
const db = new Database(DB_PATH);

// Initialize tables (id autoincrement, created_at timestamps in ms)
db.exec(`
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  duration INTEGER NOT NULL, -- seconds
  started_at INTEGER,
  ended_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  starred INTEGER DEFAULT 0,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_category ON sessions(category);
CREATE INDEX IF NOT EXISTS idx_chats_created ON chats(created_at);
`);

module.exports = {
  // Chats
  addChat: (role, text, metadata = null) => {
    const stmt = db.prepare('INSERT INTO chats (role, text, metadata, created_at) VALUES (?, ?, ?, ?)');
    return stmt.run(role, text, metadata ? JSON.stringify(metadata) : null, Date.now());
  },
  getChats: (limit = 200) => {
    const stmt = db.prepare('SELECT * FROM chats ORDER BY id DESC LIMIT ?');
    return stmt.all(limit);
  },

  clearChats: () => {
    const stmt = db.prepare('DELETE FROM chats');
    return stmt.run();
  },

  // Sessions (timer)
  addSession: ({ category, duration, started_at = null, ended_at = null }) => {
    const stmt = db.prepare('INSERT INTO sessions (category, duration, started_at, ended_at, created_at) VALUES (?, ?, ?, ?, ?)');
    return stmt.run(category, duration, started_at, ended_at, Date.now());
  },
  getSessions: (limit = 500) => {
    const stmt = db.prepare('SELECT * FROM sessions ORDER BY id DESC LIMIT ?');
    return stmt.all(limit);
  },
  clearSessions: () => {
    const stmt = db.prepare('DELETE FROM sessions');
    return stmt.run();
  },

  // Todos
  createTodo: (text, notes = '') => {
    const stmt = db.prepare('INSERT INTO todos (text, notes, created_at) VALUES (?, ?, ?)');
    return stmt.run(text, notes, Date.now());
  },
  getTodos: () => {
    const stmt = db.prepare('SELECT * FROM todos ORDER BY id DESC');
    return stmt.all();
  },
  updateTodo: (id, fields) => {
    // fields: { text, done, starred, notes }
    const sets = [];
    const values = [];
    if (fields.text !== undefined) { sets.push('text = ?'); values.push(fields.text); }
    if (fields.done !== undefined) { sets.push('done = ?'); values.push(fields.done ? 1 : 0); }
    if (fields.starred !== undefined) { sets.push('starred = ?'); values.push(fields.starred ? 1 : 0); }
    if (fields.notes !== undefined) { sets.push('notes = ?'); values.push(fields.notes); }
    if (sets.length === 0) return null;
    values.push(Date.now());
    values.push(id);
    const sql = `UPDATE todos SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`;
    const stmt = db.prepare(sql);
    return stmt.run(...values);
  },
  deleteTodo: (id) => {
    const stmt = db.prepare('DELETE FROM todos WHERE id = ?');
    return stmt.run(id);
  },

  // Utility
  runQuery: (sql, params = []) => {
    return db.prepare(sql).all(params);
  }
};
