/**
 * Minimal leveled logger. Debug output is only printed when `DEBUG=true`
 * (or `DEBUG=figma-to-code`) is set in the environment, so normal CLI runs
 * stay quiet.
 */
const debugEnabled = ['true', 'figma-to-code', '*'].includes(
  (process.env.DEBUG ?? '').toLowerCase()
);

export const logger = {
  debug(message: string, ...meta: unknown[]): void {
    if (debugEnabled) {
      console.debug(`🐛 ${message}`, ...meta);
    }
  },
  info(message: string, ...meta: unknown[]): void {
    console.log(`ℹ️  ${message}`, ...meta);
  },
  warn(message: string, ...meta: unknown[]): void {
    console.warn(`⚠️  ${message}`, ...meta);
  },
  error(message: string, ...meta: unknown[]): void {
    console.error(`❌ ${message}`, ...meta);
  },
};
