/** Own client routing, including a recoverable unknown-route page. */
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import HomePage from './features/health/HomePage';
import ReadinessPage from './features/readiness/ReadinessPage';

/** Offer a native navigation path back from an unknown URL. */
function NotFoundPage() {
  return (
    <main id="main-content" className="page">
      <p className="eyebrow">404 · NOT FOUND</p>
      <h1>Page not found.</h1>
      <p className="lead">This address is not part of the starter.</p>
      <Link to="/">Return home</Link>
    </main>
  );
}

/** Mount exactly one router for the application. */
export default function App() {
  return (
    <BrowserRouter>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="page" style={{ paddingBlock: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
        <nav aria-label="Starter navigation">
          <NavLink to="/" end>Home</NavLink>
          {' · '}
          <NavLink to="/readiness">Database readiness</NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/readiness" element={<ReadinessPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
