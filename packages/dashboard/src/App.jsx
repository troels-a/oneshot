import { useState } from 'react';
import { getApiKey, setApiKey, clearApiKey, validateKey } from './api';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import JobDetail from './components/JobDetail';
import './App.css';

export default function App() {
  const [authed, setAuthed] = useState(!!getApiKey());
  const [selectedJob, setSelectedJob] = useState(null);

  async function handleLogin(key) {
    setApiKey(key);
    try {
      await validateKey();
      setAuthed(true);
    } catch {
      clearApiKey();
      throw new Error('Invalid API key');
    }
  }

  function handleLogout() {
    clearApiKey();
    setAuthed(false);
    setSelectedJob(null);
  }

  if (!authed) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>oneshot</h1>
        <button className="btn btn-sm" onClick={handleLogout}>Logout</button>
      </header>
      {selectedJob ? (
        <JobDetail jobId={selectedJob} onBack={() => setSelectedJob(null)} />
      ) : (
        <Dashboard onSelectJob={setSelectedJob} />
      )}
    </div>
  );
}
