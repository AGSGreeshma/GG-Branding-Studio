/*
 * Structured JSON logs (Y1). Log IDs, codes, lengths and timings only:
 * never prompts, model outputs, cookies or other user content (plan §19).
 */

type LogLevel = "info" | "warn" | "error";
type LogFields = Record<string, string | number | boolean | null | undefined>;

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/** Error name and message for logs. Messages come from our own code or libraries, not from user input. */
export function describeError(err: unknown): { error_name: string; error_message: string } {
  if (err instanceof Error) {
    return { error_name: err.name, error_message: err.message.slice(0, 500) };
  }
  return { error_name: typeof err, error_message: "non-Error value thrown" };
}
