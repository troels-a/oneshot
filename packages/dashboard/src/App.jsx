import { useState } from 'react';
import { getApiKey, setApiKey, clearApiKey, login } from './api';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import RunDetail from './components/RunDetail';
import './App.css';

const VIEWS = ['runs', 'agents', 'schedules'];

export default function App() {
  const [authed, setAuthed] = useState(!!getApiKey());
  const [view, setView] = useState('runs');
  const [selectedRun, setSelectedRun] = useState(null);

  async function handleLogin(password) {
    try {
      const token = await login(password);
      setApiKey(token);
      setAuthed(true);
    } catch {
      clearApiKey();
      throw new Error('Invalid password');
    }
  }

  function handleLogout() {
    clearApiKey();
    setAuthed(false);
    setSelectedRun(null);
  }

  function handleSelectRun(runId) {
    setSelectedRun(runId);
  }

  function handleBack() {
    setSelectedRun(null);
  }

  if (!authed) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <div className="bg-blob-1" />
      <div className="bg-blob-2" />

      <nav className="app-nav">
        <div className="app-logo">
          <div className="app-logo-icon">O</div>
          <span className="app-logo-text">oneshot</span>
        </div>
      </nav>

      <div className="welcome-section">
        <div className="welcome-text">
          <h1>{selectedRun ? 'Run Detail' : 'Welcome'}</h1>
          <p>Your agent control room — monitoring runs, costs, and performance</p>
        </div>
        <div className="app-nav-pills">
          {VIEWS.map((v) => (
            <button
              key={v}
              className={`nav-pill ${view === v && !selectedRun ? 'nav-pill-active' : ''}`}
              onClick={() => { setView(v); setSelectedRun(null); }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {selectedRun ? (
        <RunDetail runId={selectedRun} onBack={handleBack} />
      ) : (
        <Dashboard tab={view} onSelectRun={handleSelectRun} />
      )}
    </div>
  );
}
