import {
  ConsoleLogger,
  type ConsoleLoggerOptions,
  type LogLevel,
} from '@nestjs/common';

export class HumanReadableConsoleLogger extends ConsoleLogger {
  constructor(options: ConsoleLoggerOptions) {
    super(options);
  }

  protected override getJsonLogObject(
    message: unknown,
    options: {
      context: string;
      logLevel: LogLevel;
      writeStreamType?: 'stdout' | 'stderr';
      errorStack?: unknown;
      params?: Record<string, unknown>;
    },
  ) {
    const entry = super.getJsonLogObject(message, options);
    return {
      ...entry,
      at: new Date(entry.timestamp).toISOString(),
    };
  }
}
