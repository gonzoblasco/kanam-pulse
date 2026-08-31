// packages/web/src/i18n/strings.ts
// Centralized UI strings for the Kanam Pulse dashboard.
//
// Spanish is the default UI language (SPEC decision: "UI strings Spanish by
// default, i18n-ready from day one, English pack at M4"). Code and docs stay
// in English; only user-facing strings live in this dictionary.
//
// Keys are flat, namespaced strings (e.g. 'fixes.scan'). `es` is the
// canonical shape: `en` is type-checked to have exactly the same keys.
// Templates may use `{placeholder}` tokens, replaced by `t(key, vars)`.

const es = {
  // App shell
  'app.title': 'Panel de Kanam Pulse',
  'health.title': 'Salud del sistema',
  // HealthScoreCard
  'health.loading': 'Cargando...',
  'health.unavailable': 'Datos de salud no disponibles',
  'health.explain': 'Explicar auditoría',
  'health.explaining': 'Explicando...',
  'health.preparing': 'Preparando la explicación...',
  'health.ollamaUnavailable':
    'Ollama no está disponible, por lo que no se pudo generar la explicación.',
  // FixesPanel
  'fixes.title': 'Correcciones',
  'fixes.scan': 'Escanear',
  'fixes.scanning': 'Escaneando...',
  'fixes.dryRun': 'Simular',
  'fixes.checking': 'Comprobando...',
  'fixes.apply': 'Aplicar',
  'fixes.dryRunHeading': 'Estimación de la simulación (no se ejecutó nada)',
  'fixes.wouldFree': 'Liberaría:',
  'fixes.noTargetsResolved': 'Ningún objetivo resuelto del escaneo actual.',
  'fixes.noneFound': 'No se encontraron cachés ni procesos pesados para corregir.',
  'fixes.caches': 'Cachés',
  'fixes.heavyProcesses': 'Procesos pesados',
  'fixes.scanPrompt': 'Ejecuta un escaneo para ver cachés y procesos pesados corregibles.',
  'fixes.applyResultHeading': 'Resultado',
  'fixes.freed': 'Liberado:',
  'fixes.killedPids': 'PIDs terminados:',
  'fixes.none': 'ninguno',
  'fixes.errors': 'Errores:',
  'fixes.confirmTitle': 'Confirmar correcciones',
  'fixes.confirmMessage':
    'Esto liberará {cacheCount} objetivo(s) de caché y terminará {processCount} proceso(s): {targets}. Esta acción no se puede deshacer.',
  'fixes.confirmGeneric': '¿Confirmar la aplicación de las correcciones seleccionadas?',
  'fixes.processLabel': 'PID {pid} {command} (CPU {cpuPct}%, MEM {memPct}%)',
  // ConfirmDialog
  'dialog.cancel': 'Cancelar',
  'dialog.applying': 'Aplicando...',
} as const;

export type Locale = 'es' | 'en';
export type TranslationKey = keyof typeof es;

const en: Record<TranslationKey, string> = {
  'app.title': 'Kanam Pulse Dashboard',
  'health.title': 'System Health',
  'health.loading': 'Loading...',
  'health.unavailable': 'Health data unavailable',
  'health.explain': 'Explain this audit',
  'health.explaining': 'Explaining...',
  'health.preparing': 'Preparing explanation...',
  'health.ollamaUnavailable':
    'Ollama is not available, so no explanation could be generated.',
  'fixes.title': 'Fixes',
  'fixes.scan': 'Scan',
  'fixes.scanning': 'Scanning...',
  'fixes.dryRun': 'Dry-run',
  'fixes.checking': 'Checking...',
  'fixes.apply': 'Apply',
  'fixes.dryRunHeading': 'Dry-run estimate (nothing executed)',
  'fixes.wouldFree': 'Would free:',
  'fixes.noTargetsResolved': 'No targets resolved from the current scan.',
  'fixes.noneFound': 'No fixable caches or heavy processes found.',
  'fixes.caches': 'Caches',
  'fixes.heavyProcesses': 'Heavy processes',
  'fixes.scanPrompt': 'Run a scan to see fixable caches and heavy processes.',
  'fixes.applyResultHeading': 'Apply result',
  'fixes.freed': 'Freed:',
  'fixes.killedPids': 'Killed PIDs:',
  'fixes.none': 'none',
  'fixes.errors': 'Errors:',
  'fixes.confirmTitle': 'Confirm fixes',
  'fixes.confirmMessage':
    'This will clear {cacheCount} cache target(s) and kill {processCount} process(es): {targets}. This action cannot be undone.',
  'fixes.confirmGeneric': 'Confirm applying the selected fixes?',
  'fixes.processLabel': 'PID {pid} {command} (CPU {cpuPct}%, MEM {memPct}%)',
  'dialog.cancel': 'Cancel',
  'dialog.applying': 'Applying...',
};

export const strings: { es: typeof es; en: typeof en } = { es, en };
