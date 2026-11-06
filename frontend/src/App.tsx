/** Own client routing, including a recoverable unknown-route page. */
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import HomePage from './features/health/HomePage';

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
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
