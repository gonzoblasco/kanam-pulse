// src/components/accessibility.test.tsx
// Automated accessibility checks (axe-core) for the M4 UI surface.
//
// Every component is rendered through RTL in the jsdom environment and then
// run through axe. We assert zero violations below impact "serious" for the
// three interactive surfaces:
//   - ConfirmDialog (role=dialog + aria-modal, labelled + described)
//   - FixesPanel (labelled checkboxes, status/alert regions, disabled states)
//   - HealthScoreCard (aria-live result region, labelled explain button)
//
// Notes on jsdom + axe:
//   - jsdom does not compute real layout, so color-contrast and other
//     visual-only rules are automatically excluded by axe
//     (the `color-contrast` rule reports as "incomplete", not a violation).
//     Contrast is verified in the browser during the manual M4 a11y audit.
//   - `axe.run` needs the container attached to document.body; RTL does that
//     by default, and `configureAxe`/`axe` restore body content afterwards.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import ConfirmDialog from './ConfirmDialog';
import FixesPanel from './FixesPanel';
import HealthScoreCard from './HealthScoreCard';
import type { FixScanResult } from '../types/api';

// WCAG: axe "impact" levels - critical, serious, moderate, minor.
// We fail the build on anything serious or worse; lower-impact findings are
// reported but do not gate the pipeline (they are triaged in the M4 audit).
const MAX_ALLOWED_IMPACT = 'serious';

async function expectNoSeriousViolations(container: HTMLElement, label: string) {
  const results = await axe(container);
  const serious = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  if (serious.length > 0) {
    const summary = serious
      .map(
        (v) =>
          `${v.id} (${v.impact}): ${v.help} - ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      )
      .join('\n');
    throw new Error(`a11y violations (${label}):\n${summary}`);
  }
  return results;
}

// ---------------------------------------------------------------- fixtures

const scanResult: FixScanResult = {
  caches: [
    {
      id: 'cache-brew',
      label: 'Homebrew cache',
      path: '/tmp/brew-cache',
      description: 'Old Homebrew downloads',
      sizeBytes: 1024 * 1024 * 50,
    },
  ],
  processes: [
    {
      pid: 1234,
      command: 'node server.js',
      cpuPct: 42,
      memPct: 12,
    },
  ],
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

const healthRun = {
  overall: 88,
  status: 'healthy' as const,
  timestamp: '2026-08-30T00:00:00.000Z',
  checks: [
    {
      id: 'disk',
      name: 'Disk health',
      score: 88,
      status: 'ok' as const,
      suggestions: [{ priority: 'low' as const, action: 'Nothing to do' }],
    },
  ],
  runInfo: { elapsedMs: 12, total: 1, passed: 1, warnings: 0, errors: 0 },
};

function stubFetch(handlers: Record<string, (url: string, init?: RequestInit) => unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const route = `${method} ${url}`;
    const handler = handlers[route];
    if (!handler) throw new Error(`unexpected fetch: ${route}`);
    const body = await handler(url, init);
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  // Default: merged happy-path stubs so every component reaches its
  // interactive state. Individual tests override with their own handlers
  // where needed (vi.stubGlobal replaces the whole fetch mock, so each
  // override must include every route the component under test hits).
  stubFetch({
    'GET /api/fixes/scan': () => scanResult,
    'POST /api/fixes/dry-run': () => dryRunResult,
    'POST /api/fixes/apply': () => applyResult,
    'GET /api/run?checks=disk,memory,cpu,security,network': () => healthRun,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------- ConfirmDialog

describe('a11y: ConfirmDialog', () => {
  it('has no serious axe violations when open (dialog + labelled actions)', async () => {
    const { container } = render(
      <ConfirmDialog
        title="Confirm fixes"
        message="This will kill 2 processes. This action cannot be undone."
        confirmLabel="Apply"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expectNoSeriousViolations(container, 'ConfirmDialog open');
  });

  it('has no serious axe violations in the busy state', async () => {
    const { container } = render(
      <ConfirmDialog
        title="Confirm fixes"
        message="Applying fixes, please wait."
        confirmLabel="Apply"
        busy
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await expectNoSeriousViolations(container, 'ConfirmDialog busy');
  });
});

// ---------------------------------------------------------------- FixesPanel

describe('a11y: FixesPanel', () => {
  it('has no serious axe violations in the initial (scan prompt) state', async () => {
    const { container } = render(<FixesPanel />);
    // Initial state: hint text, enabled Scan, disabled Dry-run/Apply.
    expect(screen.getByRole('button', { name: 'Escanear' })).toBeInTheDocument();
    await expectNoSeriousViolations(container, 'FixesPanel initial');
  });

  it('has no serious axe violations after a scan with labelled checkboxes', async () => {
    const user = userEvent.setup();
    const { container } = render(<FixesPanel />);

    await user.click(screen.getByRole('button', { name: 'Escanear' }));
    const caches = await screen.findByRole('group', { name: /cachés/i });
    const processes = await screen.findByRole('group', { name: /procesos pesados/i });

    // Labels are properly associated with their checkboxes.
    expect(
      within(caches).getByRole('checkbox', { name: /Homebrew cache/i }),
    ).toBeInTheDocument();
    expect(
      within(processes).getByRole('checkbox', { name: /PID 1234/i }),
    ).toBeInTheDocument();

    await expectNoSeriousViolations(container, 'FixesPanel after scan');
  });

  it('has no serious axe violations with targets selected and dry-run result', async () => {
    const user = userEvent.setup();
    const { container } = render(<FixesPanel />);

    await user.click(screen.getByRole('button', { name: 'Escanear' }));
    const caches = await screen.findByRole('group', { name: /cachés/i });
    await user.click(
      within(caches).getByRole('checkbox', { name: /Homebrew cache/i }),
    );
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    // Wait for the polite status region announcing the estimate.
    await screen.findByText(/liberaría/i);

    await expectNoSeriousViolations(container, 'FixesPanel selected + dry-run');
  });

  it('has no serious axe violations with the confirm dialog open', async () => {
    const user = userEvent.setup();
    const { container } = render(<FixesPanel />);

    await user.click(screen.getByRole('button', { name: 'Escanear' }));
    const caches = await screen.findByRole('group', { name: /cachés/i });
    await user.click(
      within(caches).getByRole('checkbox', { name: /Homebrew cache/i }),
    );
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    const apply = screen.getByRole('button', { name: 'Aplicar' });
    await waitFor(() => expect(apply).toBeEnabled());
    await user.click(apply);
    await screen.findByRole('dialog');

    await expectNoSeriousViolations(container, 'FixesPanel + ConfirmDialog open');
  });

  it('has no serious axe violations when an error alert is shown', async () => {
    // Scan fails: render the role=alert region.
    stubFetch({
      'GET /api/fixes/scan': () => {
        throw new Error('scan failed');
      },
      'GET /api/run?checks=disk,memory,cpu,security,network': () => healthRun,
    });

    const user = userEvent.setup();
    const { container } = render(<FixesPanel />);
    await user.click(screen.getByRole('button', { name: 'Escanear' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('scan failed');

    await expectNoSeriousViolations(container, 'FixesPanel error alert');
  });
});

// ---------------------------------------------------------------- HealthScoreCard

describe('a11y: HealthScoreCard', () => {
  it('has no serious axe violations on the happy path with an accessible explain button', async () => {
    const { container } = render(<HealthScoreCard title="System Health" />);
    await screen.findByText('88%');
    const button = screen.getByRole('button', { name: 'Explicar auditoría' });
    expect(button).toBeEnabled();

    await expectNoSeriousViolations(container, 'HealthScoreCard happy path');
  });

  it('has no serious axe violations while the explanation is announced (aria-live)', async () => {
    stubFetch({
      'GET /api/run?checks=disk,memory,cpu,security,network': () => healthRun,
      'POST /api/audit/explain': () => ({
        available: true,
        explanation: 'Your system looks good. Everything is healthy.',
      }),
    });

    const user = userEvent.setup();
    const { container } = render(<HealthScoreCard title="System Health" />);
    await screen.findByText('88%');
    await user.click(screen.getByRole('button', { name: 'Explicar auditoría' }));

    const text = await screen.findByText(/Your system looks good/);
    expect(text.closest('[aria-live="polite"]')).not.toBeNull();

    await expectNoSeriousViolations(container, 'HealthScoreCard with explanation');
  });

  it('has no serious axe violations when the explanation is unavailable', async () => {
    stubFetch({
      'GET /api/run?checks=disk,memory,cpu,security,network': () => healthRun,
      'POST /api/audit/explain': () => ({ available: false, error: 'ollama not available' }),
    });

    const user = userEvent.setup();
    const { container } = render(<HealthScoreCard title="System Health" />);
    await screen.findByText('88%');
    await user.click(screen.getByRole('button', { name: 'Explicar auditoría' }));
    await screen.findByText(/Ollama no está disponible/i);

    await expectNoSeriousViolations(container, 'HealthScoreCard unavailable');
  });
});
