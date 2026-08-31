// src/components/ConfirmDialog.test.tsx
// Accessibility + interaction tests for the consent dialog:
// role/aria contract, focus trap (initial focus on Cancel, Tab cycling),
// Escape/confirm handlers, and focus restore to the opener on close.

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfirmDialog from './ConfirmDialog';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

interface RenderDialogOptions {
  title?: string;
  message?: string;
  busy?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

function renderDialog({
  title = 'Confirm fixes',
  message = 'This cannot be undone.',
  busy = false,
  onConfirm = vi.fn(),
  onCancel = vi.fn(),
}: RenderDialogOptions = {}) {
  const utils = render(
    <ConfirmDialog
      title={title}
      message={message}
      confirmLabel="Apply"
      cancelLabel="Cancel"
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { ...utils, onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('renders a modal dialog with the expected ARIA contract', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // aria-labelledby points at the title, aria-describedby at the message.
    const titleId = dialog.getAttribute('aria-labelledby');
    const messageId = dialog.getAttribute('aria-describedby');
    expect(titleId).toBeTruthy();
    expect(messageId).toBeTruthy();
    // React's useId() emits colons (e.g. ":r0:") which are invalid in CSS
    // selectors, so resolve the references with getElementById, not querySelector.
    expect(document.getElementById(titleId!)).toHaveTextContent(
      'Confirm fixes',
    );
    expect(document.getElementById(messageId!)).toHaveTextContent(
      'This cannot be undone.',
    );
  });

  it('moves initial focus to the Cancel button (focus trap entry point)', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('restores focus to the opener element when it unmounts', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();
    expect(opener).toHaveFocus();

    const { unmount } = renderDialog();
    // Focus moved into the dialog while mounted.
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
  });

  it('keeps Tab cycling inside the dialog (focus trap)', async () => {
    const user = userEvent.setup();
    renderDialog();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const apply = screen.getByRole('button', { name: 'Apply' });

    // Initial focus is on Cancel; Tab moves forward to Apply.
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(apply).toHaveFocus();

    // Tab from the last element wraps back to the first.
    await user.tab();
    expect(cancel).toHaveFocus();

    // Shift+Tab from the first element wraps to the last.
    await user.tab({ shift: true });
    expect(apply).toHaveFocus();
  });

  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when the confirm button is clicked', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('disables both actions while busy and shows the busy label', () => {
    renderDialog({ busy: true });
    expect(screen.getByRole('button', { name: 'Aplicando...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Apply' }),
    ).not.toBeInTheDocument();
  });

  it('does not cancel when clicking inside the dialog surface', () => {
    // The dialog deliberately has no backdrop click-to-close handler; clicking
    // inside the dialog must NOT cancel. This guards against accidentally
    // wiring the overlay to onCancel in the future.
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
