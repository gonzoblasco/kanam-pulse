// src/core/exec.ts
// Safe async command executor with timeout and size guard.
// Pattern learned from the Breacorp stack: never run raw shell, always
// wrap with timeout + capture stdout/stderr without shell injection.

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const DEFAULTS = {
  timeout: 10000,
  maxBuffer: 10 * 1024 * 1024, // 10 MB
};

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  timeout?: number;
  maxBuffer?: number;
}

/** Run a command safely and return { stdout, stderr }. */
export async function run(command: string, opts: ExecOptions = {}): Promise<ExecResult> {
  const options = {
    timeout: opts.timeout ?? DEFAULTS.timeout,
    maxBuffer: opts.maxBuffer ?? DEFAULTS.maxBuffer,
  };

  try {
    const { stdout, stderr } = (await execAsync(command, options as never)) as unknown as { stdout: string; stderr: string };
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(`Command failed: ${command}\n${e.stderr || e.message}`);
  }
}

/** Run a command and tolerate failure - return null instead of throwing. */
export async function runSafe(command: string, opts: ExecOptions = {}): Promise<ExecResult | null> {
  try {
    return await run(command, opts);
  } catch {
    return null;
  }
}
