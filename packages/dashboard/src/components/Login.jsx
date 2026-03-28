import { useState } from 'react';

export default function Login({ onLogin }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onLogin(key.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="bg-blob-1" />
      <div className="bg-blob-2" />
      <div className="login-card">
        <h1>oneshot</h1>
        <p className="login-subtitle">Enter your password to continue</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Password"
            autoFocus
          />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-dark" type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
