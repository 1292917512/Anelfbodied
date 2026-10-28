import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Keeps two bounded diagnostic files without recording messages or credentials. */
export function diagnostics(directory: string): (event: string, detail?: string) => void {
  const file = join(directory, 'runtime.log');
  return (event, detail = '') => {
    try {
      mkdirSync(directory, { recursive: true });
      if (existsSync(file) && statSync(file).size > 256_000) renameSync(file, `${file}.previous`);
      appendFileSync(
        file,
        `${new Date().toISOString()} ${event} ${detail.slice(0, 1000).replace(/[\r\n]/g, ' ')}\n`,
        { mode: 0o600 },
      );
    } catch {
      /* Diagnostics must not interrupt shutdown. */
    }
  };
}
