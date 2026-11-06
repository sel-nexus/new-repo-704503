/** Exercise the visible health journey through the real client and mocked transport. */
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HomePage from './HomePage';
import App from '../../App';

describe('HomePage', () => {
  it('shows neutral scope and idle state without making an automatic request', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A clean starting point.');
    expect(screen.getByText(/No domain features or login/)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Not checked yet');
    expect(screen.getByRole('button', { name: 'Check backend' })).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('shows loading and disables duplicate checks until the actual response validates', async () => {
    const user = userEvent.setup();
    let resolveRequest!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    render(<HomePage />);
    await user.click(screen.getByRole('button', { name: 'Check backend' }));
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for the backend response');
    await act(async () => { resolveRequest(new Response('{"status":"ok"}')); });
    expect(screen.getByRole('status')).toHaveTextContent('Backend connected. Response status: ok.');
    expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
  });
  it('shows a network error and retries successfully without retaining the error', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response('{"status":"ok"}'));
    render(<HomePage />);
    await user.click(screen.getByRole('button', { name: 'Check backend' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the backend');
    await user.click(screen.getByRole('button', { name: 'Retry check' }));
    expect(await screen.findByText(/Backend connected/)).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it.each([
    ['{"status":"wrong"}', 200, 'invalid health response'],
    ['{}', 503, 'HTTP 503']
  ])('shows a retryable response failure for %s', async (body, status, message) => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status: Number(status) }));
    render(<HomePage />);
    await user.click(screen.getByRole('button', { name: 'Check backend' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(String(message));
    expect(screen.getByRole('button', { name: 'Retry check' })).toBeEnabled();
    expect(screen.queryByText(/Backend connected/)).not.toBeInTheDocument();
  });
  it('replaces a previous success when a new check fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{"status":"ok"}'))
      .mockRejectedValueOnce(new TypeError('offline'));
    render(<HomePage />);
    await user.click(screen.getByRole('button', { name: 'Check backend' }));
    expect(await screen.findByText(/Backend connected/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByText(/Backend connected/)).not.toBeInTheDocument();
  });
});

describe('unknown-route recovery', () => {
  it('shows not-found and returns home by a real navigation link', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/unknown');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page not found.');
    await user.click(screen.getByRole('link', { name: 'Return home' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A clean starting point.');
    expect(window.location.pathname).toBe('/');
  });
});
