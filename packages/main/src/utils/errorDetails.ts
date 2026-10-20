type ErrorContext = Record<string, string | number | boolean | undefined>;

export class OperationError extends Error {
  constructor(
    message: string,
    readonly context: ErrorContext,
    cause: unknown,
  ) {
    super(message, { cause });
    this.name = "OperationError";
  }
}

// electron-log serializes Error objects to their stack, dropping cause and codes.
// Return plain objects so nested fetch/AggregateError diagnostics survive logging.
export function getErrorDetails(
  error: unknown,
  seen = new Set<object>(),
  depth = 0,
): Record<string, unknown> {
  if (typeof error !== "object" || error === null) {
    return { message: String(error) };
  }
  if (seen.has(error) || depth >= 10) {
    return { message: "[Circular or deeply nested error]" };
  }
  seen.add(error);

  const source = error as Record<string, unknown>;
  const details: Record<string, unknown> = {};
  for (const key of [
    "name",
    "message",
    "stack",
    "code",
    "errno",
    "syscall",
    "hostname",
    "address",
    "port",
    "path",
    "dest",
  ]) {
    if (typeof source[key] === "string" || typeof source[key] === "number") {
      details[key] = source[key];
    }
  }
  if (error instanceof OperationError) {
    details.context = error.context;
  }
  if (source.cause !== undefined) {
    details.cause = getErrorDetails(source.cause, seen, depth + 1);
  }
  if (Array.isArray(source.errors)) {
    details.errors = source.errors.map((entry) =>
      getErrorDetails(entry, seen, depth + 1),
    );
  }
  return details;
}
