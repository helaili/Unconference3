import { createConsola, LogLevels } from 'consola'

const levelMap: Record<string, number> = {
  fatal: LogLevels.Fatal,
  error: LogLevels.Error,
  warn: LogLevels.Warn,
  log: LogLevels.Log,
  info: LogLevels.Info,
  success: LogLevels.Success,
  debug: LogLevels.Debug,
  trace: LogLevels.Trace,
  silent: LogLevels.Silent,
  verbose: LogLevels.Verbose,
}

function resolveLogLevel(): number {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase()
  if (envLevel && envLevel in levelMap) {
    return levelMap[envLevel]
  }
  // Development: debug (shows everything except trace)
  // Production: warn (shows only warnings, errors, and fatal)
  return import.meta.dev ? LogLevels.Debug : LogLevels.Warn
}

export const log = createConsola({
  level: resolveLogLevel(),
})

/**
 * Create a tagged logger for a specific module or feature area.
 * Tags appear in log output to identify the source of each message.
 *
 * @example
 * const logger = useLogger('auth')
 * logger.info('User logged in')  // [auth] User logged in
 */
export function useLogger(tag: string) {
  return log.withTag(tag)
}
