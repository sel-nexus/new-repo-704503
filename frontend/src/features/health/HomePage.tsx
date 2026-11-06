/** Present a neutral starter and an explicit, repeatable liveness check. */
import { useState } from 'react';
import { checkHealth } from './client';

type CheckState = { kind: 'idle' | 'loading' } | { kind: 'success'; status: 'ok' } | { kind: 'error'; message: string };

/** Render all check states without initiating background requests. */
export default function HomePage() {
  const [state, setState] = useState<CheckState>({ kind: 'idle' });
  /** Replace stale results with the outcome of a fresh user-triggered request. */
  async function handleCheck() {
    setState({ kind: 'loading' });
    try {
      const result = await checkHealth();
      setState({ kind: 'success', status: result.status });
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'The check failed. Please try again.' });
    }
  }
  const labels = { idle: 'Check backend', loading: 'Checking…', success: 'Check again', error: 'Retry check' };
  return (
    <main id="main-content" className="page">
      <header className="intro">
        <p className="eyebrow">APPLICATION STARTER</p>
        <h1>A clean starting point.</h1>
        <p className="lead">A small foundation for your next application. React on the frontend, Express on the backend. No domain features or login.</p>
      </header>
      <section className="check-panel" aria-labelledby="check-title">
        <div className="check-heading">
          <h2 id="check-title">Backend connection</h2>
          <code>GET /api/health</code>
        </div>
        <p>Send a live request to confirm the API responds. This checks the service only, not a database or external dependency.</p>
        <button type="button" onClick={handleCheck} disabled={state.kind === 'loading'} aria-describedby="check-status">
          {labels[state.kind]}
        </button>
        <div id="check-status" className="check-status" role="status" aria-live="polite" aria-atomic="true">
          {state.kind === 'idle' && <p>Not checked yet. Start a check when you’re ready.</p>}
          {state.kind === 'loading' && <p>Waiting for the backend response…</p>}
          {state.kind === 'success' && (
            <p>Backend connected. Response status: <code>{state.status}</code>.</p>
          )}
        </div>
        {state.kind === 'error' && (
          <p className="error-message" role="alert">{state.message}</p>
        )}
      </section>
      <footer className="page-footer">
        <p>Starter scope · One screen, one service check, no personal data.</p>
      </footer>
    </main>
  );
}
