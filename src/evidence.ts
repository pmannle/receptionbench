import { execFileSync } from 'node:child_process';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { EventSchema, ContextSchema, type EvidenceEvent, type TrialContext } from './schemas.js';
import { canonical } from './hash.js';
export interface IngressIdentity { producerId: string; authority: EvidenceEvent['authority']; types: readonly string[] }
export function validateScope(event: EvidenceEvent, ctx: TrialContext): void {
  if (event.trialId !== ctx.trialId || event.namespace !== ctx.namespace || event.correlationId !== ctx.idempotencyKey) throw new Error('Evidence scope mismatch');
}
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
/** Local SQLite database. CLI subprocess uses argv and SQL literals, never a shell. */
export class EvidenceStore {
  private constructor(private path: string, private ctx: TrialContext) {}
  private query(sql: string): Array<Record<string, string>> {
    const result = execFileSync('sqlite3', ['-batch', '-json', this.path, '.timeout 5000', sql], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    return result.trim() ? JSON.parse(result) as Array<Record<string,string>> : [];
  }
  static async open(path: string, ctx: TrialContext): Promise<EvidenceStore> {
    ContextSchema.parse(ctx); mkdirSync(dirname(path), { recursive: true });
    const store = new EvidenceStore(path, structuredClone(ctx));
    store.query('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (producer TEXT, id TEXT, json TEXT NOT NULL, PRIMARY KEY(producer,id));');
    chmodSync(path, 0o600);
    store.query(`INSERT OR IGNORE INTO metadata VALUES ('context', ${quote(canonical(ctx))});`);
    if (store.query("SELECT value FROM metadata WHERE key='context'")[0]?.value !== canonical(ctx)) throw new Error('Database scope mismatch');
    return store;
  }
  ingest(input: unknown, identity: IngressIdentity): 'accepted' | 'duplicate' {
    const e = EventSchema.parse(input); validateScope(e, this.ctx);
    if (e.producerId !== identity.producerId) throw new Error('Producer identity mismatch');
    if (e.authority !== identity.authority) throw new Error('Forged authority');
    if (!identity.types.includes(e.type)) throw new Error('Event type forbidden for identity');
    if (Date.parse(e.receivedAt) < Date.parse(e.occurredAt)) throw new Error('Invalid event clocks');
    const encoded = canonical(e);
    // Single transaction prevents concurrent duplicate insert races. Compare committed content afterward.
    const changed = this.query(`BEGIN IMMEDIATE; INSERT OR IGNORE INTO events VALUES (${quote(e.producerId)}, ${quote(e.eventId)}, ${quote(encoded)}); SELECT changes() AS inserted; COMMIT;`)[0]?.inserted;
    const saved = this.query(`SELECT json FROM events WHERE producer=${quote(e.producerId)} AND id=${quote(e.eventId)}`)[0]?.json;
    if (saved !== encoded) throw new Error('Conflicting replay conflict');
    return Number(changed) === 1 ? 'accepted' : 'duplicate';
  }
  events(): EvidenceEvent[] { return this.query('SELECT json FROM events ORDER BY producer,id').map(row => EventSchema.parse(JSON.parse(row.json!))); }
  close(): void { /* Each transaction is closed and durable before returning. */ }
}
