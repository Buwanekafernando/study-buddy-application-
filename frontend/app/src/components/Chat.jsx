import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useState as useLocalState } from 'react';

const STORAGE_KEY = 'sb_chat_history_v1';

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mdLib, setMdLib] = useLocalState({ marked: null, DOMPurify: null });
  const listRef = useRef(null);

  // load from backend if available, otherwise fallback to localStorage
  useEffect(() => {
    let mounted = true;
    axios.get('http://localhost:5000/api/chats')
      .then(res => {
        if (mounted && res.data?.ok) setMessages(res.data.chats || []);
      })
      .catch(() => {
        try {
          const local = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
          if (mounted) setMessages(local);
        } catch { if (mounted) setMessages([]); }
      });
    return () => { mounted = false; };
  }, []);

  // Try to dynamically load markdown libraries at runtime. If unavailable, we'll fall back to a simple renderer.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const markedModule = await import('marked');
        let dompurifyModule = null;
        try { dompurifyModule = await import('dompurify'); } catch (e) { dompurifyModule = null; }
        const marked = markedModule?.marked || markedModule?.default || null;
        const DOMPurify = dompurifyModule ? (dompurifyModule.default || dompurifyModule) : null;
        if (mounted) setMdLib({ marked, DOMPurify });
      } catch (e) {
        if (mounted) setMdLib({ marked: null, DOMPurify: null });
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    // keep local copy as fallback
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    // scroll
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    const userMsg = { role: 'user', text, ts: Date.now() };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await axios.post('http://localhost:5000/api/ask', { prompt: text });
      const aiText = res.data?.text ?? (res.data?.data ? JSON.stringify(res.data.data) : 'No response');
      // simulate typing effect: add placeholder then replace
      const placeholder = { role: 'ai', text: '...', ts: Date.now() + 1, pending: true };
      setMessages(m => [...m, placeholder]);

      // small artificial typing delay to feel interactive
      await new Promise(r => setTimeout(r, 600));
      setMessages(m => m.map(msg => (msg.pending ? { ...msg, text: aiText, pending: false } : msg)));
    } catch (err) {
      setMessages(m => [...m, { role: 'ai', text: 'Error: ' + (err.message || 'request failed'), ts: Date.now() }]);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    // try backend clear then local
    axios.delete('http://localhost:5000/api/chats').catch(() => {});
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Very small fallback markdown renderer (keeps things simple/safe).
  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function simpleMarkdown(md) {
    // basic blocks: code fences, headings, lists, bold/italic, paragraphs
    if (!md) return '';
    // handle code fences
    md = md.replace(/```([\s\S]*?)```/g, (m, code) => `<pre><code>${escapeHtml(code)}</code></pre>`);
    // headings
    md = md.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    md = md.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    md = md.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    // bold/italic
    md = md.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    md = md.replace(/\*(.*?)\*/gim, '<em>$1</em>');
    // unordered lists
    md = md.replace(/^[-\*] (.*)/gim, '<li>$1</li>');
    md = md.replace(/(<li>[\s\S]*?<\/li>)/gim, '<ul>$1</ul>');
    // paragraphs
    md = md.replace(/\n\n+/gim, '</p><p>');
    md = '<p>' + md + '</p>';
    return md;
  }

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>Study Buddy — Chat</h2>
        <div className="header-actions">
          <button className="ghost" onClick={clearHistory}>Clear</button>
        </div>
      </header>

      <div className="chat-window" ref={listRef}>
        {messages.length === 0 && <div className="empty">Say hi 👋 — ask anything about your subject.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="bubble">
              <div className="meta">{m.role === 'user' ? 'You' : 'Buddy'}</div>
              <div className="text">
                {/* Render Markdown safely. Use runtime libs when available, otherwise a simple fallback. */}
                {mdLib.marked ? (
                  <div dangerouslySetInnerHTML={{ __html: (mdLib.DOMPurify ? mdLib.DOMPurify.sanitize(mdLib.marked.parse(String(m.text || ''))) : mdLib.marked.parse(String(m.text || ''))) }} />
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(String(m.text || '')) }} />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="chat-input">
        <input
          placeholder="Ask your study buddy..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          disabled={loading}
        />
        <button onClick={send} disabled={loading || !input.trim()}>
          {loading ? 'Thinking…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
