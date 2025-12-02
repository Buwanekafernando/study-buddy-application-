require('dotenv').config();
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args)); // or global fetch if node supports it
const cors = require('cors');
const path = require('path');

const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn("Warning: GEMINI_API_KEY not set. Set it in .env for backend requests.");
}

app.post('/api/ask', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    // save user message
    db.addChat('user', prompt, { source: 'app' });

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    // System instruction: concise, complete, and accurate responses
    const systemInstruction = `You are StudyBuddy, a helpful study assistant. Respond to questions with SHORT, COMPLETE, and ACCURATE answers.

Guidelines:
1. **Be Concise**: Get straight to the point. Avoid filler, repetition, and unnecessary elaboration.
2. **Be Complete**: Answer the full question in 2-4 sentences or a short bulleted list (3-5 bullets max). Never cut off mid-sentence.
3. **Be Accurate**: Provide correct, factual information directly relevant to what the user asked.
4. **Format**: Use Markdown sparingly—bold for key terms, bullet points for lists only if needed. Keep it readable.
5. **Examples**: If helpful, include 1 brief example to clarify, but only if it truly adds value.

Goal: Informative, not verbose. Answer completely but efficiently.`;

    const body = {
      contents: [
        { parts: [ { text: systemInstruction } ] },
        { parts: [ { text: prompt } ] }
      ],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 500,
        topP: 0.9
      }
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error', response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();

    // Attempt to extract text in several possible response shapes
    let aiText = null;
    try {
      // common explicit paths
      aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text
        || data?.candidates?.[0]?.content?.text
        || data?.output?.[0]?.content?.text
        || data?.text;

      // If still not found, do a best-effort recursive search for a long string
      if (!aiText) {
        const strings = [];
        const walk = (obj) => {
          if (!obj) return;
          if (typeof obj === 'string') {
            strings.push(obj);
            return;
          }
          if (Array.isArray(obj)) return obj.forEach(walk);
          if (typeof obj === 'object') {
            for (const k of Object.keys(obj)) walk(obj[k]);
          }
        };
        walk(data);

        // remove obvious token-like strings (no spaces, only url-safe chars)
        const tokenLike = (s) => /^[A-Za-z0-9_\-]{8,}$/.test(s);

        // prefer strings that look like sentences (contain words and spaces/punctuation) or are sufficiently long
        const candidates = strings.filter(s => typeof s === 'string' && s.trim().length > 0);
        const humanLike = candidates.filter(s => /[\.!\?]\s|\w+\s+\w+/.test(s) && !tokenLike(s));
        humanLike.sort((a, b) => b.length - a.length);

        if (humanLike.length) {
          aiText = humanLike[0];
        } else {
          // fallback: use first non-token string or the longest string
          const nonToken = candidates.filter(s => !tokenLike(s));
          if (nonToken.length) {
            nonToken.sort((a, b) => b.length - a.length);
            aiText = nonToken[0];
          } else {
            // last resort: use the longest string even if token-like
            candidates.sort((a, b) => b.length - a.length);
            aiText = candidates[0] || null;
          }
        }

        // Debugging: log selection details to help refine extraction if needed
        try {
          console.debug('aiText selection: chosen length=', aiText ? aiText.length : 0, 'firstKeys=', Object.keys(data || {}).slice(0,5));
          const sampleCandidates = candidates.slice(0,5).map(s => ({len: s.length, sample: s.slice(0,80)}));
          console.debug('aiText selection: sampleCandidates=', sampleCandidates);
        } catch (e) {
          // ignore logging errors
        }
      }

      if (!aiText) aiText = JSON.stringify(data);
    } catch (e) {
      aiText = JSON.stringify(data);
    }

    // save AI message (metadata optional)
    db.addChat('ai', aiText, { raw: data });

    return res.json({ ok: true, text: aiText, data });
  } catch (err) {
    console.error('Error in /api/ask', err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Chats retrieval (most recent)
app.get('/api/chats', async (req, res) => {
  try {
    const rows = db.getChats(500);
    // return oldest-first for UI convenience
    res.json({ ok: true, chats: rows.slice().reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chats -> clear history
app.delete('/api/chats', async (req, res) => {
  try {
    if (db.clearChats) db.clearChats();
    else db.runQuery('DELETE FROM chats');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions -> { category, duration, started_at, ended_at }
app.post('/api/sessions', async (req, res) => {
  try {
    const { category, duration, started_at = null, ended_at = null } = req.body;
    if (!category || !duration) return res.status(400).json({ error: 'category and duration required' });
    db.addSession({ category, duration: Number(duration), started_at, ended_at });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error in /api/sessions', err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const rows = db.getSessions(1000);
    res.json({ ok: true, sessions: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions/clear', async (req, res) => {
  try {
    db.clearSessions();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Todos endpoints */

// GET /api/todos
app.get('/api/todos', (req, res) => {
  try {
    const rows = db.getTodos();
    res.json({ ok: true, todos: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/todos -> { text, notes }
app.post('/api/todos', (req, res) => {
  try {
    const { text, notes = '' } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    const info = db.createTodo(text, notes);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/todos/:id -> { text?, done?, starred?, notes? }
app.put('/api/todos/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const fields = req.body;
    const result = db.updateTodo(id, fields);
    res.json({ ok: true, changes: result ? result.changes : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/todos/:id
app.delete('/api/todos/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    db.deleteTodo(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});