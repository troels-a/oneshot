import { useState } from 'react';
import { getApiKey, setApiKey, clearApiKey, login } from './api';
import Login from './components/Login';
import Overview from './components/Overview';
import Dashboard from './components/Dashboard';
import JobDetail from './components/JobDetail';
import './App.css';

const VIEWS = ['dashboard', 'agents', 'jobs', 'schedules', 'logs'];

export default function App() {
  const [authed, setAuthed] = useState(!!getApiKey());
  const [view, setView] = useState('dashboard');
  const [selectedJob, setSelectedJob] = useState(null);

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
    setSelectedJob(null);
  }

  function handleSelectJob(jobId) {
    setSelectedJob(jobId);
  }

  function handleBack() {
    setSelectedJob(null);
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

        <div className="app-nav-pills">
          {VIEWS.map((v) => (
            <button
              key={v}
              className={`nav-pill ${view === v && !selectedJob ? 'nav-pill-active' : ''}`}
              onClick={() => { setView(v); setSelectedJob(null); }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

      </nav>

      <div className="welcome-section">
        <div className="welcome-text">
          <h1>{selectedJob ? 'Job Detail' : 'Welcome'}</h1>
          <p>Your agent control room — monitoring jobs, costs, and performance</p>
        </div>
      </div>

      {selectedJob ? (
        <JobDetail jobId={selectedJob} onBack={handleBack} />
      ) : view === 'dashboard' ? (
        <Overview onSelectJob={handleSelectJob} />
      ) : (
        <Dashboard tab={view} onSelectJob={handleSelectJob} />
      )}
    </div>
  );
}
