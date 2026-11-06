/** Exercise visible readiness states through the real client and mocked HTTP. */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ReadinessPage from './ReadinessPage';
import App from '../../App';
const readyBody = '{"status":"ready","database":"sqlite","schemaVersion":1}';

describe('ReadinessPage', () => {
  it('automatically checks on entry and disables repeats during loading', async () => {
    let resolve!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<ReadinessPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for the database readiness response');
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
    await act(async () => { resolve(new Response(readyBody)); });
    expect(screen.getByRole('status')).toHaveTextContent('Response status: ready');
    expect(screen.getByRole('status')).toHaveTextContent('Database: sqlite. Schema version: 1.');
    expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
  });
  it.each([
    [readyBody, 503, 'Database unavailable'],
    ['{}', 200, 'invalid readiness response'],
    ['private', 500, 'HTTP 500']
  ])('shows safe failure and successfully retries: %s %s', async (body, status, message) => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body, { status }))
      .mockResolvedValueOnce(new Response(readyBody));
    render(<ReadinessPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('status')).not.toHaveTextContent('Database ready');
    await user.click(screen.getByRole('button', { name: 'Retry check' }));
    expect(await screen.findByText(/Database ready/)).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('replaces a previous success with a network failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(readyBody))
      .mockRejectedValueOnce(new TypeError('private'));
    render(<ReadinessPage />);
    await screen.findByText(/Database ready/);
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the backend');
    expect(screen.queryByText(/Database ready/)).not.toBeInTheDocument();
  });
  it('ignores a completed request after unmount', async () => {
    let resolve!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(<ReadinessPage />);
    view.unmount();
    await act(async () => { resolve(new Response(readyBody)); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('shows a retryable timeout through the configured client', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_HEALTH_TIMEOUT_MS', '50');
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    render(<ReadinessPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(screen.getByRole('alert')).toHaveTextContent('took too long');
    expect(screen.getByRole('button', { name: 'Retry check' })).toBeEnabled();
  });
  it('navigates Home to readiness and back through links with one router', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(readyBody));
    render(<App />);
    await user.click(screen.getByRole('link', { name: 'Database readiness' }));
    expect(window.location.pathname).toBe('/readiness');
    expect(await screen.findByText(/Database ready/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Database readiness' })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('link', { name: 'Home' }));
    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A clean starting point.');
  });
});
