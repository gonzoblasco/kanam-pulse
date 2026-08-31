// src/components/FixesPanel.test.tsx
// Component-level test of the consent-gated fixes flow with fetch mocked,
// so nothing ever reaches the real server:
//   scan -> select targets -> dry-run -> Apply button enables -> click Apply
//   opens the confirm dialog.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FixesPanel from './FixesPanel';
import type { FixScanResult } from '../types/api';

const scanResult: FixScanResult = {
  caches: [
    {
      id: 'cache-brew',
      label: 'Homebrew cache',
      path: '/tmp/brew-cache',
      description: 'Old Homebrew downloads',
      sizeBytes: 1024 * 1024 * 50,
    },
    {
      id: 'cache-npm',
      label: 'npm cache',
      path: '/tmp/npm-cache',
      description: 'npm tarball cache',
      sizeBytes: 1024 * 1024 * 200,
    },
  ],
  processes: [],
};

const dryRunResult = {
  wouldFreeBytes: 1024 * 1024 * 250,
  caches: scanResult.caches,
  processes: [],
};

const applyResult = {
  freedBytes: 1024 * 1024 * 250,
  killedPids: [],
  errors: [],
};

/** Scan + dry-run succeed; apply is recorded. No real network access. */
function stubHappyFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: unknown;
    if (method === 'GET' && url === '/api/fixes/scan') {
      body = scanResult;
    } else if (method === 'POST' && url === '/api/fixes/dry-run') {
      body = dryRunResult;
    } else if (method === 'POST' && url === '/api/fixes/apply') {
      body = applyResult;
    } else {
      throw new Error(`unexpected fetch: ${method} ${url}`);
    }
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  stubHappyFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('FixesPanel', () => {
  it('disables Apply until a scan AND a dry-run have happened', async () => {
    const user = userEvent.setup();
    render(<FixesPanel />);

    // Before scan: Apply is disabled.
    const apply = screen.getByRole('button', { name: 'Aplicar' });
    expect(apply).toBeDisabled();

    // Scan loads and renders checkboxes.
    await user.click(screen.getByRole('button', { name: 'Escanear' }));
    const caches = await screen.findByRole('group', { name: /cachés/i });
    const checkbox = within(caches).getByRole('checkbox', {
      name: /Homebrew cache/i,
    });
    await user.click(checkbox);

    // Selection alone is not enough - a dry-run is required first.
    expect(apply).toBeDisabled();

    // Dry-run produces the estimate and unlocks Apply.
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    await waitFor(() => expect(apply).toBeEnabled());

    // The estimate is announced in the polite status region.
    expect(screen.getByText(/liberaría/i)).toBeInTheDocument();
    expect(screen.getByText(/250\.0 MB/)).toBeInTheDocument();
  });

  it('opens the confirm dialog when Apply is clicked and routes confirm/cancel', async () => {
    const user = userEvent.setup();
    render(<FixesPanel onResult={vi.fn()} />);

    // Reach the enabled Apply state.
    await user.click(screen.getByRole('button', { name: 'Escanear' }));
    const caches = await screen.findByRole('group', { name: /cachés/i });
    await user.click(
      within(caches).getByRole('checkbox', { name: /Homebrew cache/i }),
    );
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    const apply = screen.getByRole('button', { name: 'Aplicar' });
    await waitFor(() => expect(apply).toBeEnabled());

    // Apply opens the modal dialog.
    await user.click(apply);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Cancel closes it without applying (only two buttons remain).
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: 'Escanear' }),
    ).toBeInTheDocument();
  });

  it('runs a fresh scan after the first one (state resets)', async () => {
    const user = userEvent.setup();
    render(<FixesPanel />);

    await user.click(screen.getByRole('button', { name: 'Escanear' }));
    await user.click(await screen.findByRole('button', { name: 'Escanear' }));

    await waitFor(() =>
      expect(screen.getByRole('group', { name: /cachés/i })).toBeInTheDocument(),
    );
    // Both cached targets render after the second scan.
    expect(
      screen.getByRole('checkbox', { name: /Homebrew cache/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: /npm cache/i }),
    ).toBeInTheDocument();
  });
});
