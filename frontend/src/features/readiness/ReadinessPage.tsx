/** Present a live, read-only database readiness check. */
import { useEffect, useState } from 'react';
import { checkReadiness } from './client';
import type { ReadinessResponse } from './client';

type CheckState = { kind: 'loading' } | { kind: 'ready'; result: ReadinessResponse } | { kind: 'error'; message: string };

/** Check on entry and ignore stale results after retry or navigation away. */
export default function ReadinessPage() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CheckState>({ kind: 'loading' });
  useEffect(() => {
    let active = true;
    /** Replace the previous result only while this attempt remains mounted. */
    async function load() {
      setState({ kind: 'loading' });
      try {
        const result = await checkReadiness();
        if (active) { setState({ kind: 'ready', result }); }
      } catch (error) {
        if (active) {
          setState({ kind: 'error', message: error instanceof Error ? error.message : 'The check failed. Please try again.' });
        }
      }
    }
    void load();
    return () => { active = false; };
  }, [attempt]);
  const labels = { loading: 'Checking…', ready: 'Check again', error: 'Retry check' };
  return (
    <main id="main-content" className="page">
      <header className="intro">
        <p className="eyebrow">APPLICATION STARTER</p>
        <h1>Database readiness.</h1>
        <p className="lead">Verify the file-backed SQLite connection and its internal schema version. No domain records or login.</p>
      </header>
      <section className="check-panel" aria-labelledby="readiness-title">
        <div className="check-heading">
          <h2 id="readiness-title">SQLite connection</h2>
          <code>GET /api/v1/readiness</code>
        </div>
        <p>This read-only check queries the database opened by the backend. It does not create business data.</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)}
          disabled={state.kind === 'loading'} aria-describedby="readiness-status">
          {labels[state.kind]}
        </button>
        <div id="readiness-status" className="check-status" role="status" aria-live="polite" aria-atomic="true">
          {state.kind === 'loading' && <p>Waiting for the database readiness response…</p>}
          {state.kind === 'ready' && (
            <p>Database ready. Response status: <code>{state.result.status}</code>.
              Database: <code>{state.result.database}</code>. Schema version: <code>{state.result.schemaVersion}</code>.
            </p>
          )}
        </div>
        {state.kind === 'error' && (
          <p className="error-message" role="alert">{state.message}</p>
        )}
      </section>
      <footer className="page-footer">
        <p>Starter scope · Internal metadata only, no personal data.</p>
      </footer>
    </main>
  );
}
