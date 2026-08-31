// src/checks/index.js
// Registry of all health checks.

import { checkCpu } from './cpu.js';
import { checkDisk } from './disk.js';
import { checkMemory } from './memory.js';
import { checkNetwork } from './network.js';
import { checkSecurity } from './security.js';

export const CHECKS = [
  { id: 'disk', name: 'Disk / Storage', run: checkDisk },
  { id: 'memory', name: 'Memory', run: checkMemory },
  { id: 'cpu', name: 'CPU', run: checkCpu },
  { id: 'security', name: 'Security', run: checkSecurity },
  { id: 'network', name: 'Network', run: checkNetwork },
];

/**
 * Run only a subset of checks by id.
 * @param {string[]} [ids]
 */
export function getChecks(ids) {
  if (!ids || ids.length === 0) return CHECKS;
  const wanted = new Set(ids);
  return CHECKS.filter((c) => wanted.has(c.id));
}
