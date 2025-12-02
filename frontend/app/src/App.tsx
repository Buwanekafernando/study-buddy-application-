import React, { useState } from 'react';
import Chat from './components/Chat';
import Timer from './components/Timer';
import Todo from './components/Todo';
import Dashboard from './components/Dashboard';
import logoImage from './assets/study.png';

const views = ['Chat', 'Timer', 'Todos', 'Dashboard'];

export default function App() {
  const [view, setView] = useState('Chat');

  return (
    <div className="app-root">
      <aside className="sidebar">
        <div className="brand">
          <img src={logoImage} alt="StudyBuddy" className="logo" />
          <div>
            <h1>StudyBuddy</h1>
            <p className="subtitle">AI study companion</p>
          </div>
        </div>

        <nav className="menu">
          {views.map(v => (
            <button
              key={v}
              className={`menu-btn ${view === v ? 'active' : ''}`}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </nav>

        <footer className="sidebar-footer">
          <small>Built with Buwaneka</small>
        </footer>
      </aside>

      <main className="content">
        {view === 'Chat' && <Chat />}
        {view === 'Timer' && <Timer />}
        {view === 'Todos' && <Todo />}
        {view === 'Dashboard' && <Dashboard />}
      </main>
    </div>
  );
}
