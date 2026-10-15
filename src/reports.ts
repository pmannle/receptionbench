import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
export function htmlReport(report: unknown): string {
  const safe = JSON.stringify(report,null,2).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ReceptionBench simulation</title><style>body{font:16px system-ui;max-width:1100px;margin:3rem auto;padding:1rem;color:#183238}pre{white-space:pre-wrap;background:#f2f6f5;padding:1rem}</style><h1>ReceptionBench · Simulation</h1><p>Offline fake-adapter contract evidence. No live media, delivery, receptionist quality, or independent certification claim.</p><pre>'+safe+'</pre></html>';
}
export function writeReports(dir: string, report: unknown): void {
  writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  writeFileSync(join(dir,'report.html'),htmlReport(report),{mode:0o600});
}
