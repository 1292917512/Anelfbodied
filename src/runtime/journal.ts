import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { receiptSchema, terminal, type Receipt, ControlError } from '../protocol/schema';

const recordSchema = z.object({
  owner: z.string(),
  hash: z.string(),
  expiresAt: z.number(),
  receipt: receiptSchema,
});
const fileSchema = z.object({
  version: z.literal(1),
  records: z.array(recordSchema).max(2000),
  fences: z.record(z.string(), z.number()),
});
type RecordEntry = z.infer<typeof recordSchema>;
export const recordKey = (owner: string, id: string): string => `${owner}/${id}`;

/** A bounded write-ahead receipt store; uncertain executions are never replayed. */
export class Journal {
  private readonly records = new Map<string, RecordEntry>();
  private readonly fences = new Map<string, number>();
  constructor(
    private readonly file?: string,
    private readonly now = Date.now,
    private readonly limit = 2000,
  ) {
    if (file && existsSync(file)) {
      const content = readFileSync(file, 'utf8');
      if (Buffer.byteLength(content) > 8_000_000)
        throw new Error('Receipt journal exceeds size limit');
      const data = fileSchema.parse(JSON.parse(content));
      for (const record of data.records) {
        if (!terminal(record.receipt))
          record.receipt = {
            ...record.receipt,
            status: 'unknown',
            updatedAt: now(),
            detail: 'Client restarted before execution was confirmed',
          };
        this.records.set(recordKey(record.owner, record.receipt.id), record);
      }
      for (const [key, expiry] of Object.entries(data.fences)) this.fences.set(key, expiry);
      this.save();
    }
  }
  get(owner: string, id: string): RecordEntry | undefined {
    return this.records.get(recordKey(owner, id));
  }
  list(owner?: string): Receipt[] {
    return [...this.records.values()]
      .filter((record) => !owner || record.owner === owner)
      .map((record) => structuredClone(record.receipt))
      .reverse()
      .slice(0, 100);
  }
  markUncertain(owner: string, receipt: Receipt): void {
    const record = this.records.get(recordKey(owner, receipt.id));
    if (record) record.receipt = structuredClone(receipt);
  }
  put(record: RecordEntry): void {
    this.prune();
    const key = recordKey(record.owner, record.receipt.id);
    if (!this.records.has(key) && this.records.size >= this.limit)
      throw new ControlError(
        'capacity',
        'Receipt capacity reached; retry after records expire',
        429,
      );
    const previous = this.records.get(key);
    this.records.set(key, structuredClone(record));
    try {
      this.save();
    } catch (error) {
      if (previous) this.records.set(key, previous);
      else this.records.delete(key);
      throw error;
    }
  }
  fence(owner: string, session: string): void {
    this.prune();
    if (this.fences.size >= 2000 && !this.fences.has(recordKey(owner, session)))
      throw new ControlError('capacity', 'Cancellation fence capacity reached', 429);
    this.fences.set(recordKey(owner, session), this.now() + 300_000);
    this.save();
  }
  fenced(owner: string, session: string): boolean {
    return (this.fences.get(recordKey(owner, session)) ?? 0) > this.now();
  }
  private prune(): void {
    for (const [key, value] of this.records)
      if (terminal(value.receipt) && value.expiresAt < this.now() - 86400_000)
        this.records.delete(key);
    for (const [key, expiry] of this.fences) if (expiry <= this.now()) this.fences.delete(key);
  }
  private save(): void {
    this.prune();
    if (!this.file) return;
    const text = JSON.stringify({
      version: 1,
      records: [...this.records.values()],
      fences: Object.fromEntries(this.fences),
    });
    if (Buffer.byteLength(text) > 8_000_000)
      throw new ControlError('capacity', 'Receipt storage is full', 429);
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, text, { mode: 0o600, flush: true });
    renameSync(`${this.file}.tmp`, this.file);
  }
}
