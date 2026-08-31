// FixesPanel.tsx
// Consent-gated fixes UI: scan -> select targets -> dry-run (no-op) ->
// confirm dialog -> apply. Every target has an associated <label>
// (WCAG 2.2 AA). Apply stays disabled until a dry-run has been performed.

import React, { useMemo, useState } from 'react';
import { useFixes } from '../hooks/useFixes';
import ConfirmDialog from './ConfirmDialog';
import type { CacheTarget, HeavyProcess } from '../types/api';

interface FixesPanelProps {
  onResult?: (result: { freedBytes: number; killedPids: number[]; errors: string[] }) => void;
}

const panelStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  borderRadius: '8px',
  padding: '20px',
  margin: '20px',
  maxWidth: '640px',
};

const sectionStyle: React.CSSProperties = {
  marginTop: '16px',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  padding: '4px 0',
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  marginTop: '20px',
  alignItems: 'center',
  flexWrap: 'wrap',
};

const buttonBase: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: '1px solid #ccc',
  backgroundColor: '#f5f6f8',
};

const primaryButton: React.CSSProperties = {
  ...buttonBase,
  backgroundColor: '#2563eb',
  borderColor: '#2563eb',
  color: '#fff',
};

/** Human-readable byte size (KB/MB/GB). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 'B';
  for (const u of units) {
    value /= 1024;
    unit = u;
    if (value < 1024) break;
  }
  return `${value.toFixed(1)} ${unit}`;
}

function TargetCheckbox({
  name,
  value,
  checked,
  onChange,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '4px 0' }}>
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: '4px' }}
      />
      <span>{label}</span>
    </label>
  );
}

const FixesPanel = ({ onResult }: FixesPanelProps) => {
  const fixes = useFixes();
  const [selectedCaches, setSelectedCaches] = useState<Set<string>>(new Set());
  const [selectedProcesses, setSelectedProcesses] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);

  const scanResult = fixes.scanResult;
  const dryRunResult = fixes.dryRunResult;

  const hasSelection = selectedCaches.size > 0 || selectedProcesses.size > 0;
  const hasDryRun = dryRunResult !== null;
  const applyDisabled = !hasSelection || !hasDryRun || fixes.applying;

  const selectedSummary = useMemo(() => {
    const parts: string[] = [];
    if (!scanResult) return parts;
    for (const cache of scanResult.caches) {
      if (selectedCaches.has(cache.id)) {
        parts.push(`${cache.label} (${formatBytes(cache.sizeBytes)})`);
      }
    }
    for (const proc of scanResult.processes) {
      if (selectedProcesses.has(proc.pid)) {
        parts.push(`PID ${proc.pid} ${proc.command}`);
      }
    }
    return parts;
  }, [scanResult, selectedCaches, selectedProcesses]);

  const handleScan = async () => {
    await fixes.scan();
    // Reset selections on a fresh scan so checkboxes can never reference
    // targets that are no longer present.
    setSelectedCaches(new Set());
    setSelectedProcesses(new Set());
  };

  const handleDryRunClick = () => {
    const targets = [
      ...Array.from(selectedCaches),
      ...Array.from(selectedProcesses).map((pid) => String(pid)),
    ];
    fixes.dryRun(targets);
  };

  const handleConfirm = async () => {
    setDialogOpen(false);
    const result = await fixes.apply(Array.from(selectedCaches), Array.from(selectedProcesses));
    if (result) onResult?.(result);
  };

  const dryRunLines = dryRunResult ? (
    <div role="status" aria-live="polite" style={sectionStyle}>
      <h4>Dry-run estimate (nothing executed)</h4>
      <p>
        Would free:{' '}
        <strong>{formatBytes(dryRunResult.wouldFreeBytes)}</strong>
      </p>
      {dryRunResult.caches.length === 0 && dryRunResult.processes.length === 0 && (
        <p>No targets resolved from the current scan.</p>
      )}
    </div>
  ) : null;

  return (
    <div style={panelStyle}>
      <h2>Fixes</h2>
      <div style={buttonRowStyle}>
        <button type="button" onClick={handleScan} disabled={fixes.scanning} style={buttonBase}>
          {fixes.scanning ? 'Scanning...' : 'Scan'}
        </button>
        <button
          type="button"
          onClick={handleDryRunClick}
          disabled={!hasSelection || fixes.dryRunning}
          style={buttonBase}
        >
          {fixes.dryRunning ? 'Checking...' : 'Dry-run'}
        </button>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          disabled={applyDisabled}
          style={primaryButton}
        >
          Apply
        </button>
      </div>
      {fixes.error && (
        <p role="alert" style={{ color: '#c0392b' }}>
          {fixes.error}
        </p>
      )}

      {scanResult ? (
        <>
          {scanResult.caches.length === 0 && scanResult.processes.length === 0 ? (
            <p>No fixable caches or heavy processes found.</p>
          ) : (
            <>
              {scanResult.caches.length > 0 && (
                <fieldset style={sectionStyle}>
                  <legend>Caches</legend>
                  {scanResult.caches.map((cache: CacheTarget) => (
                    <TargetCheckbox
                      key={cache.id}
                      name="cache-targets"
                      value={cache.id}
                      checked={selectedCaches.has(cache.id)}
                      onChange={(checked) => {
                        setSelectedCaches((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(cache.id);
                          else next.delete(cache.id);
                          return next;
                        });
                      }}
                      label={`${cache.label} (${formatBytes(cache.sizeBytes)}) - ${cache.description}`}
                    />
                  ))}
                </fieldset>
              )}
              {scanResult.processes.length > 0 && (
                <fieldset style={sectionStyle}>
                  <legend>Heavy processes</legend>
                  {scanResult.processes.map((proc: HeavyProcess) => (
                    <TargetCheckbox
                      key={proc.pid}
                      name="process-targets"
                      value={String(proc.pid)}
                      checked={selectedProcesses.has(proc.pid)}
                      onChange={(checked) => {
                        setSelectedProcesses((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(proc.pid);
                          else next.delete(proc.pid);
                          return next;
                        });
                      }}
                      label={`PID ${proc.pid} ${proc.command} (CPU ${proc.cpuPct}%, MEM ${proc.memPct}%)`}
                    />
                  ))}
                </fieldset>
              )}
            </>
          )}
        </>
      ) : (
        !fixes.scanning && <p>Run a scan to see fixable caches and heavy processes.</p>
      )}

      {dryRunLines}

      {fixes.applyResult && (
        <div role="status" aria-live="polite" style={sectionStyle}>
          <h4>Apply result</h4>
          <p>Freed: {formatBytes(fixes.applyResult.freedBytes)}</p>
          <p>Killed PIDs: {fixes.applyResult.killedPids.join(', ') || 'none'}</p>
          {fixes.applyResult.errors.length > 0 && (
            <div>
              <strong>Errors:</strong>
              <ul>
                {fixes.applyResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {dialogOpen && (
        <ConfirmDialog
          title="Confirm fixes"
          message={
            selectedSummary.length > 0
              ? `This will clear ${selectedCaches.size} cache target(s) and kill ${selectedProcesses.size} process(es): ${selectedSummary.join(', ')}. This action cannot be undone.`
              : 'Confirm applying the selected fixes?'
          }
          confirmLabel="Apply"
          busy={fixes.applying}
          onConfirm={handleConfirm}
          onCancel={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
};

export default FixesPanel;
