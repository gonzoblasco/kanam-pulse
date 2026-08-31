// src/components/HealthScoreCard.test.tsx
// Tests the "Explain this audit" button + aria-live result region with
// fetch stubbed. The initial /api/run fetch is mocked too, so the card
// renders its happy path (a fixed score) without any server.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HealthScoreCard from './HealthScoreCard';

const healthRun = {
  overall: 88,
  status: 'healthy',
  timestamp: '2026-08-30T00:00:00.000Z',
  checks: [
    {
      id: 'disk',
      name: 'Disk health',
      score: 88,
      status: 'ok',
      suggestions: [{ priority: 'low', action: 'Nothing to do' }],
    },
  ],
  runInfo: { elapsedMs: 12, total: 1, passed: 1, warnings: 0, errors: 0 },
};

type FetchHandler = (url: string, init?: RequestInit) => unknown;

function stubFetch(handlers: Record<string, FetchHandler>) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const route = `${method} ${url}`;
      const handler = handlers[route];
      if (!handler) throw new Error(`unexpected fetch: ${route}`);
      const body = await handler(url, init);
      return { ok: true, status: 200, json: async () => body } as Response;
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  stubFetch({
    'GET /api/run?checks=disk,memory,cpu,security,network': () => healthRun,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('HealthScoreCard - Explain this audit', () => {
  it('renders the score and an accessible explain button', async () => {
    render(<HealthScoreCard title="System Health" />);
    expect(await screen.findByText('88%')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Explicar auditoría' });
    expect(button).toBeEnabled();
    expect(button).toBeVisible();
  });

  it('sends the current battery and announces the explanation (aria-live)', async () => {
    let explainBody: unknown = null;
    stubFetch({
      'GET /api/run?checks=disk,memory,cpu,security,network': () => healthRun,
      'POST /api/audit/explain': (_url, init) => {
        explainBody = JSON.parse(String(init?.body));
        return {
          available: true,
          explanation: 'Your system looks good. Everything is healthy.',
        };
      },
    });

    const user = userEvent.setup();
    render(<HealthScoreCard title="System Health" />);
    await screen.findByText('88%');
    await user.click(
      screen.getByRole('button', { name: 'Explicar auditoría' }),
    );

    // The explanation arrives and is announced in the polite status region.
    const text = await screen.findByText(/Your system looks good/);
    expect(text).toBeInTheDocument();
    expect(text.closest('[aria-live="polite"]')).not.toBeNull();

    // The battery from the health run is sent to the endpoint.
    expect(explainBody).toEqual({ battery: healthRun });
    // The button is interactive again.
    expect(
      screen.getByRole('button', { name: 'Explicar auditoría' }),
    ).toBeEnabled();
  });

  it('shows a subtle notice when Ollama is unavailable', async () => {
    stubFetch({
      'GET /api/run?checks=disk,memory,cpu,security,network': () => healthRun,
      'POST /api/audit/explain': () => ({
        available: false,
        error: 'ollama not available',
      }),
    });

    const user = userEvent.setup();
    render(<HealthScoreCard title="System Health" />);
    await screen.findByText('88%');
    await user.click(
      screen.getByRole('button', { name: 'Explicar auditoría' }),
    );

    const notice = await screen.findByText(/Ollama no está disponible/);
    expect(notice).toBeInTheDocument();
    // The notice lives inside the polite live region.
    expect(notice.closest('[aria-live="polite"]')).not.toBeNull();
    // Button stays available for retry.
    expect(
      screen.getByRole('button', { name: 'Explicar auditoría' }),
    ).toBeEnabled();
  });

  it('surfaces hard failures in a polite region and keeps the button for retry', async () => {
    stubFetch({
      'GET /api/run?checks=disk,memory,cpu,security,network': () => healthRun,
      'POST /api/audit/explain': () => {
        throw new Error('server offline');
      },
    });

    const user = userEvent.setup();
    render(<HealthScoreCard title="System Health" />);
    await screen.findByText('88%');
    await user.click(
      screen.getByRole('button', { name: 'Explicar auditoría' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('server offline'),
    );
    expect(
      screen.getByRole('button', { name: 'Explicar auditoría' }),
    ).toBeEnabled();
  });
});
