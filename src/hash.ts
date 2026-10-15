import { createHash } from 'node:crypto';
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k,v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Non-JSON value');
  return encoded;
}
export const hash = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');
