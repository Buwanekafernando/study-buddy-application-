import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'sb_todos_v1';

export default function Todo() {
  const [items, setItems] = useState([]);
  const [text, setText] = useState('');

  // load from backend with fallback to localStorage
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/todos');
        const data = await res.json();
        if (mounted && data?.ok) setItems(data.todos || []);
      } catch (e) {
        try { if (mounted) setItems(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); } catch { if (mounted) setItems([]); }
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const add = () => {
    if (!text.trim()) return;
    const payload = { text: text.trim(), notes: '' };
    fetch('http://localhost:5000/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(() => fetch('http://localhost:5000/api/todos').then(r => r.json()).then(d => { if (d?.ok) setItems(d.todos); }))
      .catch(() => setItems(s => [{ id: Date.now(), text: text.trim(), done: false, starred: false }, ...s]));
    setText('');
  };

  const toggle = id => {
    fetch(`http://localhost:5000/api/todos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: true }) })
      .then(() => fetch('http://localhost:5000/api/todos').then(r => r.json()).then(d => { if (d?.ok) setItems(d.todos); }));
  };
  const remove = id => {
    fetch(`http://localhost:5000/api/todos/${id}`, { method: 'DELETE' })
      .then(() => fetch('http://localhost:5000/api/todos').then(r => r.json()).then(d => { if (d?.ok) setItems(d.todos); }));
  };
  const star = id => {
    fetch(`http://localhost:5000/api/todos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ starred: true }) })
      .then(() => fetch('http://localhost:5000/api/todos').then(r => r.json()).then(d => { if (d?.ok) setItems(d.todos); }));
  };
  const edit = (id) => {
    const newText = prompt('Edit task');
    if (newText !== null) {
      fetch(`http://localhost:5000/api/todos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: newText }) })
        .then(() => fetch('http://localhost:5000/api/todos').then(r => r.json()).then(d => { if (d?.ok) setItems(d.todos); }));
    }
  };

  const clearCompleted = () => setItems(s => s.filter(it => !it.done));

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>To-do</h2>
        <div className="header-actions">
          <button className="ghost" onClick={clearCompleted}>Clear completed</button>
        </div>
      </header>

      <div className="todo-card">
        <div className="todo-input">
          <input placeholder="New task..." value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} />
          <button className="primary" onClick={add}>Add</button>
        </div>

        <div className="todo-list">
          {items.length === 0 && <div className="muted">No tasks — add something!</div>}
          {items.map(it => (
            <div key={it.id} className={`todo-row ${it.done ? 'done' : ''}`}>
              <div className="left">
                <input type="checkbox" checked={it.done} onChange={() => toggle(it.id)} />
                <div className="todo-text">{it.text}</div>
              </div>

              <div className="right">
                <button className={`icon ${it.starred ? 'starred' : ''}`} onClick={() => star(it.id)}>★</button>
                <button className="icon" onClick={() => edit(it.id)}>✎</button>
                <button className="icon danger" onClick={() => remove(it.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
