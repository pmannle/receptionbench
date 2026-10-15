import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { z } from 'zod/v3';
import { hash } from './hash.js';
import { HealthSchema, CleanupSchema } from './conformance.js';
import {
  ContextSchema, DescriptionSchema, FixtureSchema, PreparedSchema, SnapshotSchema,
  type BusinessFixture, type ReceptionBenchAdapter, type TrialContext,
} from './schemas.js';

const environmentName = z.string().regex(/^[A-Z_][A-Z0-9_]*$/).refine(
  name => !['NODE_OPTIONS','NODE_PATH','PYTHONPATH','PYTHONHOME','LD_PRELOAD','LD_LIBRARY_PATH','BASH_ENV','ENV'].includes(name) && !name.startsWith('DYLD_'),
  'Runtime injection variables are not credential references',
);
export const ProcessAdapterConfigSchema = z.object({
  protocolVersion: z.literal('0.1'),
  command: z.string().min(1).refine(isAbsolute, 'Executable must be an absolute path'),
  args: z.array(z.string().max(4096)).max(64).default([]),
  environmentRefs: z.array(environmentName).max(32).default([]),
  timeoutMs: z.number().int().min(10).max(60000).default(10000),
  maxOutputBytes: z.number().int().min(256).max(1048576).default(65536),
}).strict();
export type ProcessAdapterConfig = z.infer<typeof ProcessAdapterConfigSchema>;
const errorResponse = z.object({ protocolVersion:z.literal('0.1'), ok:z.literal(false), error:z.object({ code:z.string().max(128), message:z.string().max(4096), retryable:z.boolean() }).strict() }).strict();
const responseSchema = z.union([
  z.object({ protocolVersion:z.literal('0.1'), ok:z.literal(true), result:z.unknown() }).strict(),
  errorResponse,
]);
const requestBase = { protocolVersion:z.literal('0.1') };
export const AdapterRequestSchema = z.discriminatedUnion('operation', [
  z.object({ ...requestBase, operation:z.literal('describe') }).strict(),
  z.object({ ...requestBase, operation:z.literal('prepare'), context:ContextSchema, fixture:FixtureSchema }).strict(),
  z.object({ ...requestBase, operation:z.literal('health'), context:ContextSchema, targetId:PreparedSchema.shape.targetId }).strict(),
  z.object({ ...requestBase, operation:z.literal('snapshot'), context:ContextSchema, targetId:PreparedSchema.shape.targetId }).strict(),
  z.object({ ...requestBase, operation:z.literal('cleanup'), context:ContextSchema, targetId:PreparedSchema.shape.targetId }).strict(),
]);

export class AdapterProcessError extends Error {
  constructor(readonly code: string, message: string, readonly retryable = false) { super(message); }
}

/** Explicitly configured local executable; not a sandbox for untrusted programs. */
export class ProcessAdapter implements ReceptionBenchAdapter {
  readonly config: ProcessAdapterConfig;
  constructor(config: unknown) { this.config = ProcessAdapterConfigSchema.parse(config); }

  private call(input: z.infer<typeof AdapterRequestSchema>): Promise<unknown> {
    const request = AdapterRequestSchema.parse(input);
    const encoded = JSON.stringify(request) + '\n';
    if (Buffer.byteLength(encoded) > 1048576) throw new AdapterProcessError('request_too_large','Adapter request exceeds the size limit');
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, LANG: 'C.UTF-8' };
    for (const name of this.config.environmentRefs) {
      if (process.env[name] === undefined) throw new AdapterProcessError('missing_environment_reference','A configured adapter environment reference is unavailable');
      env[name] = process.env[name];
    }
    return new Promise((resolve,reject) => {
      const child = spawn(this.config.command,this.config.args,{
        shell:false, detached:process.platform !== 'win32', env, stdio:['pipe','pipe','pipe'],
      });
      const stdout: Buffer[] = [];
      let size = 0, settled = false;
      const stop = () => {
        try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid,'SIGKILL'); else child.kill('SIGKILL'); }
        catch { /* Already exited. */ }
      };
      const fail = (code:string,message:string) => {
        if (settled) return;
        settled = true; clearTimeout(timer); stop(); reject(new AdapterProcessError(code,message));
      };
      const timer = setTimeout(() => fail('adapter_timeout','Adapter operation exceeded its deadline'),this.config.timeoutMs);
      child.once('error',() => fail('adapter_spawn_failed','Adapter executable could not be started'));
      const receive = (chunk:Buffer,keep:boolean) => {
        size += chunk.byteLength;
        if (size > this.config.maxOutputBytes) { fail('adapter_output_limit','Adapter response exceeds the output limit'); return; }
        if (keep) stdout.push(chunk);
      };
      child.stdout.on('data',(chunk:Buffer) => receive(chunk,true));
      // Private logs are deliberately not returned in errors or reports.
      child.stderr.on('data',(chunk:Buffer) => receive(chunk,false));
      child.stdin.on('error',() => fail('adapter_input_failed','Adapter process closed its input'));
      child.once('close',code => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (code !== 0) { reject(new AdapterProcessError('adapter_exit_failed','Adapter operation exited unsuccessfully')); return; }
        try {
          const response = responseSchema.parse(JSON.parse(Buffer.concat(stdout).toString('utf8')));
          if (!response.ok) { reject(new AdapterProcessError('adapter_reported_error','Adapter reported an operation failure',response.error.retryable)); return; }
          resolve(response.result);
        } catch { reject(new AdapterProcessError('adapter_invalid_response','Adapter returned an invalid protocol response')); }
      });
      child.stdin.end(encoded);
    });
  }

  private decode<S extends z.ZodTypeAny>(schema:S,value:unknown):z.infer<S> {
    const parsed=schema.safeParse(value);
    if (!parsed.success) throw new AdapterProcessError('adapter_invalid_result','Adapter returned an invalid operation result');
    return parsed.data;
  }
  async describe() { return this.decode(DescriptionSchema,await this.call({protocolVersion:'0.1',operation:'describe'})); }
  async prepare(context:TrialContext,input:BusinessFixture) {
    const fixture=FixtureSchema.parse(input); const {contentHash,...body}=fixture;
    if (hash(body)!==contentHash) throw new Error('Fixture digest mismatch');
    const raw = await this.call({protocolVersion:'0.1',operation:'prepare',context,fixture});
    try {
      const prepared = PreparedSchema.parse(raw);
      if (prepared.fixtureReceiptHash!==fixture.contentHash) throw new Error('Fixture receipt mismatch');
      return prepared;
    } catch (error) {
      const target=PreparedSchema.shape.targetId.safeParse(raw && typeof raw==='object' && 'targetId' in raw ? raw.targetId : undefined);
      if (target.success) {
        try { if (!(await this.cleanup(context,target.data)).complete) throw new Error('incomplete'); }
        catch { throw new AdapterProcessError('prepare_rollback_failed','Adapter prepare validation failed and cleanup could not be confirmed'); }
      }
      throw new AdapterProcessError('prepare_validation_failed','Adapter returned an invalid preparation receipt');
    }
  }
  async health(context:TrialContext,targetId:string) { return this.decode(HealthSchema,await this.call({protocolVersion:'0.1',operation:'health',context,targetId})); }
  async snapshot(context:TrialContext,targetId:string) { return this.decode(SnapshotSchema,await this.call({protocolVersion:'0.1',operation:'snapshot',context,targetId})); }
  async cleanup(context:TrialContext,targetId:string) { return this.decode(CleanupSchema,await this.call({protocolVersion:'0.1',operation:'cleanup',context,targetId})); }
}
