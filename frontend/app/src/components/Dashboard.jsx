import React, { useMemo, useEffect, useState } from 'react';

function secsToHours(mins) {
  return (mins/3600).toFixed(2);
}

export default function Dashboard() {
  const [sessions, setSessions] = useState([]);
  const [chats, setChats] = useState([]);
  const [todos, setTodos] = useState([]);

  useEffect(() => {
    // try to get from backend, fallback to localStorage
    fetch('http://localhost:5000/api/sessions').then(r => r.json()).then(d => { if (d?.ok) setSessions(d.sessions || []); }).catch(() => {
      try { setSessions(JSON.parse(localStorage.getItem('sb_focus_sessions_v1') || '[]')); } catch { setSessions([]); }
    });
    fetch('http://localhost:5000/api/chats').then(r => r.json()).then(d => { if (d?.ok) setChats(d.chats || []); }).catch(() => {
      try { setChats(JSON.parse(localStorage.getItem('sb_chat_history_v1') || '[]')); } catch { setChats([]); }
    });
    fetch('http://localhost:5000/api/todos').then(r => r.json()).then(d => { if (d?.ok) setTodos(d.todos || []); }).catch(() => {
      try { setTodos(JSON.parse(localStorage.getItem('sb_todos_v1') || '[]')); } catch { setTodos([]); }
    });
  }, []);

  const totals = useMemo(() => {
    const map = { working: 0, studying: 0, reading: 0 };
    sessions.forEach(s => {
      map[s.category] = (map[s.category] || 0) + (s.duration || 0);
    });
    return map;
  }, [sessions]);

  const recentSearches = chats.slice(0, 8).filter(m => m.role === 'user').map(m => m.text);

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>Dashboard</h2>
        <div className="header-actions">
          <small>Overview of your focus & tasks</small>
        </div>
      </header>

      <div className="dashboard-grid">
        <div className="card">
          <h3>Focus hours</h3>
          <div className="bars">
            {['working','studying','reading'].map(k => {
              const secs = totals[k] || 0;
              const hours = (secs / 3600) || 0;
              const pct = Math.min(100, Math.round(hours * 12)); // scale
              return (
                <div className="bar-row" key={k}>
                  <div className="bar-meta"><strong>{k}</strong> <span>{hours.toFixed(2)} h</span></div>
                  <div className="bar"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h3>Recent searches</h3>
          {recentSearches.length === 0 && <div className="muted">No searches yet</div>}
          <ul className="search-list">
            {recentSearches.map((s,i) => <li key={i}>{s}</li>)}
          </ul>
        </div>

        <div className="card">
          <h3>Tasks</h3>
          <div className="muted">{todos.length} tasks saved</div>
          <div style={{marginTop:12}}>
            <a className="ghost">Open Todos tab</a>
          </div>
        </div>
      </div>
    </div>
  );
}
