/**
 * A tiny dependency-free structured logger.
 *
 * Output is newline-delimited JSON, which drops straight into any log shipper.
 * Keeping this in-house avoids pulling a framework into a portfolio codebase
 * while still demonstrating a clean, typed logging contract.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogContext = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(scope: string): Logger;
}

interface LoggerOptions {
  readonly scope: string;
  readonly minLevel: LogLevel;
}

function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  return { errorValue: String(error) };
}

function createLoggerWithOptions(options: LoggerOptions): Logger {
  const threshold = LEVEL_RANK[options.minLevel];

  const emit = (level: LogLevel, message: string, context?: LogContext): void => {
    if (LEVEL_RANK[level] < threshold) {
      return;
    }

    const record: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      scope: options.scope,
      message,
    };

    if (context !== undefined) {
      for (const [key, value] of Object.entries(context)) {
        record[key] = value instanceof Error ? formatError(value) : value;
      }
    }

    process.stdout.write(`${JSON.stringify(record)}\n`);
  };

  return {
    debug: (message, context) => emit('debug', message, context),
    info: (message, context) => emit('info', message, context),
    warn: (message, context) => emit('warn', message, context),
    error: (message, context) => emit('error', message, context),
    child: (scope) => createLoggerWithOptions({ scope, minLevel: options.minLevel }),
  };
}

/**
 * Create a scoped logger. `minLevel` defaults to `debug` in development and
 * `info` in production; callers normally pass the value from `config`.
 */
export function createLogger(scope: string, minLevel: LogLevel = 'info'): Logger {
  return createLoggerWithOptions({ scope, minLevel });
}
