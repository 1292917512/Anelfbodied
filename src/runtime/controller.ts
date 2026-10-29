import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  commandSchema,
  ControlError,
  PROTOCOL,
  terminal,
  capabilities,
  type Cancel,
  type Command,
  type Receipt,
} from '../protocol/schema';
import { Journal, recordKey } from './journal';
import type { ActionDriver, ControlService } from './ports';
import { ModelRegistry } from './model-registry';
interface Job {
  owner: string;
  command: Command;
  hash: string;
  receipt: Receipt;
  abort: AbortController;
  done: Promise<Receipt>;
  resolve: (receipt: Receipt) => void;
}

/** Serializes every transport through one cancellation and receipt boundary. */
export class Controller extends EventEmitter implements ControlService {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: Job[] = [];
  private draining = false;
  private closed = false;
  constructor(
    private readonly driver: ActionDriver,
    private readonly journal: Journal,
    private readonly now = Date.now,
    readonly models = new ModelRegistry(),
  ) {
    super();
  }
  capabilities() {
    return { ...capabilities(), model: this.models.snapshot() };
  }
  submit(owner: string, input: unknown): Receipt {
    const command = commandSchema.parse(input);
    const hash = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    const existing = this.journal.get(owner, command.id);
    if (existing) {
      if (existing.hash !== hash)
        throw new ControlError(
          'id_conflict',
          'This command ID already identifies different content',
          409,
        );
      return structuredClone(existing.receipt);
    }
    if (this.closed) throw new ControlError('closing', 'Client is shutting down', 503);
    if (command.expiresAt <= this.now() || command.expiresAt > this.now() + 300_000)
      throw new ControlError('expired', 'Command must expire within the next five minutes', 422);
    if (this.journal.fenced(owner, command.session))
      throw new ControlError(
        'session_cancelled',
        'This session was cancelled; use a new session',
        409,
      );
    if (this.jobs.size >= 32) throw new ControlError('queue_full', 'Action queue is full', 429);
    command.commands.forEach((action) => this.models.validate(action));
    const receipt: Receipt = {
      protocol: PROTOCOL,
      id: command.id,
      session: command.session,
      status: 'accepted',
      completed: 0,
      total: command.commands.length,
      results: [],
      updatedAt: this.now(),
    };
    let finish!: (receipt: Receipt) => void;
    const done = new Promise<Receipt>((resolve) => {
      finish = resolve;
    });
    const job: Job = {
      owner,
      command,
      hash,
      receipt,
      abort: new AbortController(),
      done,
      resolve: finish,
    };
    this.journal.put({ owner, hash, expiresAt: command.expiresAt, receipt });
    this.jobs.set(recordKey(owner, command.id), job);
    this.queue.push(job);
    this.emit('receipt', structuredClone(receipt), owner);
    void this.drain();
    return structuredClone(receipt);
  }
  get(owner: string, id: string): Receipt | undefined {
    const receipt = this.journal.get(owner, id)?.receipt;
    return receipt ? structuredClone(receipt) : undefined;
  }
  list(owner?: string): Receipt[] {
    return this.journal.list(owner);
  }
  async wait(owner: string, id: string): Promise<Receipt> {
    const job = this.jobs.get(recordKey(owner, id));
    const receipt = job ? await job.done : this.get(owner, id);
    if (!receipt) throw new ControlError('not_found', 'Command not found', 404);
    return structuredClone(receipt);
  }
  async cancel(owner: string, target: Cancel): Promise<Receipt[]> {
    let failure: unknown;
    try {
      if (target.session) this.journal.fence(owner, target.session);
    } catch (error) {
      this.closed = true;
      failure = error;
    }
    const jobs = [...this.jobs.values()].filter(
      (job) =>
        job.owner === owner &&
        (!target.id || job.command.id === target.id) &&
        (!target.session || job.command.session === target.session),
    );
    for (const job of jobs) {
      job.abort.abort('Cancelled by controller');
      if (job.receipt.status === 'accepted') this.finish(job, 'cancelled');
    }
    const receipts = await Promise.all(jobs.map((job) => job.done));
    if (failure) throw failure;
    return receipts;
  }
  async close(): Promise<void> {
    this.closed = true;
    const jobs = [...this.jobs.values()];
    for (const job of jobs) {
      job.abort.abort('Client shutting down');
      if (job.receipt.status === 'accepted') this.finish(job, 'cancelled');
    }
    await Promise.all(jobs.map((job) => job.done));
  }
  private publish(job: Job): void {
    job.receipt.updatedAt = this.now();
    this.journal.put({
      owner: job.owner,
      hash: job.hash,
      expiresAt: job.command.expiresAt,
      receipt: job.receipt,
    });
    this.emit('receipt', structuredClone(job.receipt), job.owner);
  }
  private finish(job: Job, status: Receipt['status'], detail?: string): void {
    if (terminal(job.receipt)) return;
    job.receipt.status = status;
    if (detail) job.receipt.detail = detail.slice(0, 500);
    try {
      this.publish(job);
    } catch {
      job.receipt.status = 'unknown';
      job.receipt.detail = 'Receipt could not be persisted';
      this.closed = true;
      this.journal.markUncertain(job.owner, job.receipt);
      this.emit('receipt', structuredClone(job.receipt), job.owner);
    }
    this.jobs.delete(recordKey(job.owner, job.command.id));
    const queued = this.queue.indexOf(job);
    if (queued >= 0) this.queue.splice(queued, 1);
    job.resolve(structuredClone(job.receipt));
  }
  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (let job = this.queue.shift(); job; job = this.queue.shift()) {
        if (terminal(job.receipt)) continue;
        if (this.closed) {
          this.finish(job, 'cancelled', 'Client stopped accepting work');
          continue;
        }
        const remaining = job.command.expiresAt - this.now();
        if (remaining <= 0) {
          this.finish(job, 'cancelled', 'Command expired in queue');
          continue;
        }
        const deadline = setTimeout(() => job?.abort.abort('Command deadline exceeded'), remaining);
        try {
          job.receipt.status = 'running';
          this.publish(job);
          for (const action of job.command.commands) {
            if (job.abort.signal.aborted) break;
            try {
              this.models.validate(action);
            } catch (error) {
              const detail = error instanceof Error ? error.message : 'Model unavailable';
              job.receipt.results.push({ outcome: 'failed', detail });
              this.finish(job, 'failed', detail);
              break;
            }
            const result = await this.driver.execute(action, job.abort.signal);
            job.receipt.results.push(result);
            if (result.outcome === 'completed') {
              job.receipt.completed++;
              this.publish(job);
            } else {
              this.finish(job, result.outcome, result.detail);
              break;
            }
          }
          this.finish(job, job.receipt.completed === job.receipt.total ? 'completed' : 'cancelled');
        } catch (error) {
          this.finish(job, 'unknown', error instanceof Error ? error.message : 'Execution failed');
        } finally {
          clearTimeout(deadline);
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
