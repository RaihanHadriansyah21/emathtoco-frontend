type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const JWT_PATTERN = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}\b/g;
const SUPABASE_KEY_PATTERN = /\bsb_(?:secret|publishable)_[\w-]+\b/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SIGNED_QUERY_PATTERN =
  /([?&](?:token|signature|x-amz-signature|x-amz-credential)=)[^&\s]+/gi;
const STORAGE_PATH_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f-]{27,}\/[^\s"'?]+/gi;
const SENSITIVE_KEYS = /token|secret|password|authorization|signedurl|imagepath/i;

function redactString(value: string): string {
  return value
    .replace(JWT_PATTERN, '[REDACTED_TOKEN]')
    .replace(SUPABASE_KEY_PATTERN, '[REDACTED_KEY]')
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(SIGNED_QUERY_PATTERN, '$1[REDACTED]')
    .replace(STORAGE_PATH_PATTERN, '[REDACTED_OBJECT_PATH]');
}

function sanitize(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (value === null || typeof value !== 'object' || depth >= 3) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitize(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = SENSITIVE_KEYS.test(key)
      ? '[REDACTED]'
      : sanitize(item, depth + 1);
  }
  return sanitized;
}

export function redactLogValue(value: unknown): unknown {
  return sanitize(value);
}

function write(level: LogLevel, values: unknown[]): void {
  if (
    process.env.NODE_ENV === 'production'
    && (level === 'debug' || level === 'info')
  ) {
    return;
  }
  const sanitized = values.map((value) => sanitize(value));
  if (level === 'error') {
    console.error(...sanitized);
  } else if (level === 'warn') {
    console.warn(...sanitized);
  } else if (level === 'info') {
    console.info(...sanitized);
  } else {
    console.debug(...sanitized);
  }
}

export const logger = {
  debug: (...values: unknown[]) => write('debug', values),
  info: (...values: unknown[]) => write('info', values),
  warn: (...values: unknown[]) => write('warn', values),
  error: (...values: unknown[]) => write('error', values),
};
