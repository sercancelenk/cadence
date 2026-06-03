/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  mutate: [
    'src/core/actions/index.ts',
    'src/core/model/index.ts',
    'src/lib/agendaEntries.ts',
    'src/lib/reminderDelivery/**/*.ts',
    'src/lib/reminderNotify.ts',
    'src/components/ui/schedulePopoverPatch.ts',
    'src/features/todos/todoBody.ts',
  ],
  coverageAnalysis: 'perTest',
  thresholds: {
    high: 95,
    low: 85,
    break: null,
  },
  reporters: ['clear-text', 'progress'],
  timeoutMS: 60000,
  concurrency: 4,
};
