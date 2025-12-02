import React, { useEffect, useState, useRef } from 'react';

const STORAGE_KEY = 'sb_focus_sessions_v1';
const DEFAULT_MINUTES = { working: 25, studying: 45, reading: 30 };

function formatTime(s) {
  const h = Math.floor(s/3600).toString().padStart(2,'0');
  const m = Math.floor((s % 3600)/60).toString().padStart(2,'0');
  const sec = (s % 60).toString().padStart(2,'0');
  return `${h}:${m}:${sec}`;
}

export default function Timer() {
  const [category, setCategory] = useState('studying');
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(DEFAULT_MINUTES[category] * 60);
  const [sessions, setSessions] = useState([]);
  const [customHours, setCustomHours] = useState(0);
  const [customMinutes, setCustomMinutes] = useState(DEFAULT_MINUTES[category]);
  const [onBreak, setOnBreak] = useState(false);
  const [totalStudyTime, setTotalStudyTime] = useState(0);
  const startTsRef = useRef(null);
  const tickRef = useRef(null);

  useEffect(() => {
    setSeconds(DEFAULT_MINUTES[category] * 60);
    setCustomHours(0);
    setCustomMinutes(DEFAULT_MINUTES[category]);
    setOnBreak(false);
    setTotalStudyTime(0);
  }, [category]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  // load sessions from backend if available
  useEffect(() => {
    let mounted = true;
    fetch('http://localhost:5000/api/sessions')
      .then(r => r.json())
      .then(d => { if (mounted && d?.ok) setSessions(d.sessions || []); })
      .catch(() => {
        try { if (mounted) setSessions(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); } catch { if (mounted) setSessions([]); }
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (running) {
      tickRef.current = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    } else {
      clearInterval(tickRef.current);
    }
    return () => clearInterval(tickRef.current);
  }, [running]);

  useEffect(() => {
    if (running && seconds === 0) {
      if (onBreak) {
        // Break finished, resume studying if time remains
        setOnBreak(false);
        const totalInitialSeconds = customMinutes * 60;
        if (totalStudyTime < totalInitialSeconds) {
          const remainingSeconds = totalInitialSeconds - totalStudyTime;
          setSeconds(remainingSeconds);
        } else {
          finishSession();
        }
      } else {
        // Study session ended, check if break is needed
        const totalInitialSeconds = (customHours * 3600) + (customMinutes * 60);
        const newStudyTime = totalStudyTime + ((customHours * 3600) + (customMinutes * 60) - seconds);
        setTotalStudyTime(newStudyTime);
        
        if (newStudyTime >= totalInitialSeconds) {
          finishSession();
        } else if (totalInitialSeconds > 3600) {
          // Every 30 mins of study = 5 min break
          const studyChunks = Math.floor((newStudyTime + 30 * 60) / (30 * 60));
          const previousChunks = Math.floor(newStudyTime / (30 * 60));
          
          if (studyChunks > previousChunks) {
            setOnBreak(true);
            setSeconds(5 * 60);
          } else {
            setSeconds(totalInitialSeconds - newStudyTime);
          }
        }
      }
    }
  }, [seconds, running]);

  const start = () => {
    if (seconds <= 0) return;
    startTsRef.current = Date.now();
    setRunning(true);
  };

  const pause = () => {
    setRunning(false);
  };

  const reset = () => {
    setRunning(false);
    const totalSeconds = (customHours * 3600) + (customMinutes * 60);
    setSeconds(Math.max(60, totalSeconds));
    setOnBreak(false);
    setTotalStudyTime(0);
  };

  const updateCustomMinutes = (newMinutes) => {
    if (running) return;
    const clampedMinutes = Math.max(0, Math.min(59, newMinutes));
    setCustomMinutes(clampedMinutes);
    const totalSeconds = (customHours * 3600) + (clampedMinutes * 60);
    setSeconds(Math.max(60, totalSeconds));
    setTotalStudyTime(0);
    setOnBreak(false);
  };

  const updateCustomHours = (newHours) => {
    if (running) return;
    const clampedHours = Math.max(0, Math.min(23, newHours));
    setCustomHours(clampedHours);
    const totalSeconds = (clampedHours * 3600) + (customMinutes * 60);
    setSeconds(Math.max(60, totalSeconds));
    setTotalStudyTime(0);
    setOnBreak(false);
  };

  const finishSession = async () => {
    setRunning(false);
    const endTs = Date.now();
    const durationSec = Math.max(0, Math.round((endTs - (startTsRef.current || endTs)) / 1000));
    const record = { category, duration: durationSec, at: endTs };

    // attempt to persist to backend
    try {
      await fetch('http://localhost:5000/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, duration: durationSec, started_at: startTsRef.current, ended_at: endTs })
      });
      // refresh list from backend
      const res = await fetch('http://localhost:5000/api/sessions');
      const d = await res.json();
      if (d?.ok) {
        if (Array.isArray(d.sessions) && d.sessions.length) {
          setSessions(d.sessions);
        } else {
          setSessions(prev => [record, ...prev].slice(0, 200));
        }
      } else {
        setSessions(prev => [record, ...prev].slice(0, 200));
      }
    } catch (e) {
      console.warn('Failed to post session to backend', e);
      // still update local UI cache
      setSessions(s => [record, ...s].slice(0, 200));
    }

    startTsRef.current = null;
    const totalSeconds = (customHours * 3600) + (customMinutes * 60);
    setSeconds(Math.max(60, totalSeconds));
  };

  const clearSessions = () => {
    setSessions([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>Focus Timer</h2>
        <div className="header-actions">
          <button className="ghost" onClick={clearSessions}>Clear</button>
        </div>
      </header>

      <div className="timer-card">
        <div className="category-row">
          {['working','studying','reading'].map(c => (
            <button
              key={c}
              className={`chip ${category === c ? 'active' : ''}`}
              onClick={() => { setCategory(c); setRunning(false); }}
              disabled={running}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="time-input-row">
          <div>
            <label>Hours:</label>
            <input
              type="number"
              min="0"
              max="23"
              value={customHours}
              onChange={(e) => updateCustomHours(parseInt(e.target.value) || 0)}
              disabled={running}
              className="time-input"
            />
          </div>
          <div>
            <label>Minutes:</label>
            <input
              type="number"
              min="0"
              max="59"
              value={customMinutes}
              onChange={(e) => updateCustomMinutes(parseInt(e.target.value) || 0)}
              disabled={running}
              className="time-input"
            />
          </div>
        </div>

        <div className="time-display">
          <div className={`circle ${running ? 'running' : ''}`}>
            <div className="time">{formatTime(seconds)}</div>
            <div className="label">{onBreak ? 'BREAK' : category}</div>
            {customMinutes > 60 && <div className="break-info">{onBreak ? 'Rest time' : 'Study session'}</div>}
          </div>
        </div>

        <div className="controls">
          {!running ? (
            <button className="primary" onClick={start} disabled={seconds <= 0}>Start</button>
          ) : (
            <button className="danger" onClick={pause}>Pause</button>
          )}
          <button className="muted" onClick={reset}>Reset</button>
          <button className="ghost" onClick={finishSession}>Finish</button>
        </div>

        <div className="session-list">
          <h4>Recent sessions</h4>
          {sessions.length === 0 && <div className="muted">No sessions yet</div>}
          {sessions.map((s,i) => (
            <div className="session-row" key={i}>
              <div className="dot" data-cat={s.category}></div>
              <div className="s-meta">
                <div className="s-cat">{s.category}</div>
                <div className="s-time">{Math.round(s.duration/60)} min</div>
              </div>
              <div className="s-date">{new Date(s.at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
