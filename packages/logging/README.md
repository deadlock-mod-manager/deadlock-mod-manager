# `@deadlock-mods/logging`

A shared logging package that provides structured logging with context support, error handling, and request-scoped logging.

The logging format depends on the `NODE_ENV` environment variable.

- In development mode, the logging format is a simple colorized output.
- In production mode, the logging format is [logfmt](https://brandur.org/logfmt).

## Installation

```bash
pnpm add @deadlock-mods/logging
```

## Basic logging

Logger supports six standard log levels, each with its own method

- `info()` - For general information messages
- `warn()` - For warning messages
- `error()` - For error messages
- `debug()` - For debug information
- `trace()` - For detailed debugging information
- `fatal()` - For critical errors that require immediate attention

### Message Parameters

Multiple parameters

```ts
logger.info("User", 123, "logged in");
```

With string formatting

```ts
logger.info("User %s logged in from %s", "john", "localhost");
```

### Contextual logging

Contextual logging allows you to add additional information to the log message.

Use the `withContext` method to add context data:

```ts
log.withContext({
  requestId: "123",
  userId: "user_456",
});

// Context will be included in all subsequent log messages
log.info("Processing request");
log.warn("User quota exceeded");
```

You can also chain the `withContext` method:

```ts
log.withContext({ requestId: "123" }).info("Processing request");
```

### Error logging

When using error logging methods (`withError` or `errorOnly`), errors are automatically reported to Sentry for error tracking when the log level is `error` or `fatal`. This behavior can be disabled by setting `skipSentry: true` in the metadata.

#### With a Message

The most common way to log an error is using the `withError` method along with a message:

```ts
const error = new Error("Database connection failed");
// Reports to Sentry by default
log.withError(error).error("Failed to process request");

// Skip Sentry reporting
log
  .withMetadata({ skipSentry: true })
  .withError(error)
  .error("Failed to process request");
```

You can use any log level with error logging:

```ts
// Log error with warning level (not sent to Sentry)
log.withError(error).warn("Database connection unstable");

// Log error with info level (not sent to Sentry)
log.withError(error).info("Retrying connection");
```

#### Error-Only Logging

```ts
// Default log level is 'error' and reports to Sentry
log.errorOnly(new Error("Database connection failed"));

// With custom log level (not sent to Sentry)
log.errorOnly(new Error("Connection timeout"), {
  logLevel: LogLevel.warn,
});
```

You can also attach a context to the error:

```ts
log
  .withContext({ requestId: "123" })
  .withError(new Error("Not found"))
  .error("Resource not found"); // Reports to Sentry
```

## Child loggers

Child loggers are a way to create a new logger that inherits the context from the parent logger.

```ts
const child = logger.child({ requestId: "123" });
child.info("Processing request");
```

## Logging with request level context

The logger supports request-scoped context using AsyncLocalStorage. This allows you to automatically attach request-specific data (like requestId) to all log messages within a request lifecycle without manually passing it around.

### Setup

```ts
import { createAppLogger, createLoggerContext } from "@deadlock-mods/logging";

export const loggerContext = createLoggerContext();

export const logger = createAppLogger({
  app: "app-api",
  context: loggerContext,
});
```

### Middleware

```ts
app.use("*", async (c, next) => {
  await loggerContext.storage.run(
    { requestId: c.get("requestId") },
    async () => {
      await next();
    }
  );
});
```

Now every log message will have the requestId context:

```ts
logger.info("Processing request");

// Outputs:
// {
//   "level": "info",
//   "message": "Processing request",
//   "context": { "requestId": "123" }
// }
```

## Mocking

A helpful mock logger is available for testing purposes. Pass the mock logger to any function that expects a logger.

```ts
const mockLogger = createMockLogger();

// Pass the mock logger to any function that expects a logger
someFunction(mockLogger);
```

More documentation on Mocking can be found [here](https://loglayer.dev/logging-api/unit-testing.html#working-with-loglayer-in-testing).

## Additional documentation

- [LogLayer](https://loglayer.dev/)
- [Winston](https://github.com/winstonjs/winston)
