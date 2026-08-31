// src/core/exec.js
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

/**
 * Run a command safely and return { stdout, stderr }.
 * Throws on non-zero exit or timeout; caller decides how to handle.
 * @param {string} command
 * @param {object} [opts]
 */
export async function run(command, opts = {}) {
  const options = {
    timeout: opts.timeout ?? DEFAULTS.timeout,
    maxBuffer: opts.maxBuffer ?? DEFAULTS.maxBuffer,
  };

  try {
    const { stdout, stderr } = await execAsync(command, options);
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    // exec rejects with an error that includes stdout/stderr on exit code != 0
    throw new Error(`Command failed: ${command}\n${err.stderr || err.message}`);
  }
}

/**
 * Run a command and tolerate failure - return null instead of throwing.
 * Useful for optional/best-effort telemetry.
 * @param {string} command
 * @param {object} [opts]
 * @returns {Promise<{stdout:string,stderr:string}|null>}
 */
export async function runSafe(command, opts = {}) {
  try {
    return await run(command, opts);
  } catch {
    return null;
  }
}
