import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Controller, type ActionDriver } from '../src/runtime/controller';
import { Journal } from '../src/runtime/journal';
import { PROTOCOL, type Command, type ActionResult } from '../src/protocol/schema';

const command = (id: string, session = 'session'): Command => ({
  protocol: PROTOCOL,
  id,
  session,
  expiresAt: Date.now() + 30000,
  commands: [{ action: 'emote', name: 'happy', durationMs: 100 }],
});
class Driver implements ActionDriver {
  calls = 0;
  resolve?: (result: ActionResult) => void;
  async execute(_action: unknown, signal: AbortSignal): Promise<ActionResult> {
    this.calls++;
    return new Promise((resolve) => {
      const cancel = () => resolve({ outcome: 'cancelled' });
      signal.addEventListener('abort', cancel, { once: true });
      this.resolve = (result) => {
        signal.removeEventListener('abort', cancel);
        resolve(result);
      };
      if (signal.aborted) cancel();
    });
  }
}
describe('shared controller', () => {
  it('deduplicates identical commands and rejects changed payloads', async () => {
    const driver = new Driver(),
      controller = new Controller(driver, new Journal());
    const input = command('one');
    controller.submit('client', input);
    controller.submit('client', input);
    expect(driver.calls).toBe(1);
    expect(() => controller.submit('client', { ...input, session: 'different' })).toThrow(
      'different content',
    );
    driver.resolve?.({ outcome: 'completed' });
    expect((await controller.wait('client', 'one')).status).toBe('completed');
    expect(controller.submit('client', input).status).toBe('completed');
    expect(driver.calls).toBe(1);
  });
  it('cancels running and queued work, fences late commands, and permits a new session', async () => {
    const driver = new Driver(),
      controller = new Controller(driver, new Journal());
    controller.submit('one', command('a'));
    controller.submit('one', command('b'));
    const receipts = await controller.cancel('one', { session: 'session' });
    expect(receipts.map((item) => item.status)).toEqual(['cancelled', 'cancelled']);
    expect(driver.calls).toBe(1);
    expect(() => controller.submit('one', command('late'))).toThrow('session was cancelled');
    controller.submit('one', command('new', 'fresh'));
    await controller.close();
    expect(driver.calls).toBe(2);
  });
  it('keeps partial results and isolates cancellation by owner', async () => {
    let count = 0;
    const driver: ActionDriver = {
      execute: async (_action, signal) => {
        if (++count === 1) return { outcome: 'completed' };
        return new Promise((resolve) =>
          signal.addEventListener('abort', () => resolve({ outcome: 'cancelled' }), { once: true }),
        );
      },
    };
    const controller = new Controller(driver, new Journal());
    const input = command('partial');
    input.commands.push(input.commands[0]!);
    controller.submit('one', input);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await controller.cancel('two', { id: 'partial' })).toEqual([]);
    const [receipt] = await controller.cancel('one', { id: 'partial' });
    expect(receipt?.completed).toBe(1);
    expect(receipt?.results).toHaveLength(2);
    expect(receipt?.status).toBe('cancelled');
  });
  it('rejects stale messages and bounds queue capacity', async () => {
    const controller = new Controller(new Driver(), new Journal());
    expect(() =>
      controller.submit('one', { ...command('expired'), expiresAt: Date.now() - 1 }),
    ).toThrow('expire');
    for (let index = 0; index < 32; index++) controller.submit('one', command(`q${index}`));
    expect(() => controller.submit('one', command('overflow'))).toThrow('queue is full');
    await controller.close();
  });
  it('preserves deduplication across restart and marks interrupted work unknown', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'embodied-journal-')), 'receipts.json');
    const old = new Controller(new Driver(), new Journal(file));
    const input = command('restart');
    old.submit('one', input);
    const newDriver = new Driver();
    const restored = new Controller(newDriver, new Journal(file));
    expect(restored.submit('one', input).status).toBe('unknown');
    expect(newDriver.calls).toBe(0);
    await old.close();
  });
  it('fails closed on corrupt journal and refuses to evict valid dedup records', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'embodied-journal-')), 'receipts.json');
    const journal = new Journal(file, Date.now, 1);
    const controller = new Controller({ execute: async () => ({ outcome: 'completed' }) }, journal);
    controller.submit('one', command('first'));
    await controller.wait('one', 'first');
    expect(() => controller.submit('one', command('second'))).toThrow('capacity');
    expect(JSON.parse(readFileSync(file, 'utf8')).records).toHaveLength(1);
    writeFileSync(file, '{');
    expect(() => new Journal(file)).toThrow();
  });
  it('cancels an expired action at its deadline', async () => {
    const controller = new Controller(new Driver(), new Journal());
    controller.submit('one', { ...command('deadline'), expiresAt: Date.now() + 40 });
    expect((await controller.wait('one', 'deadline')).status).toBe('cancelled');
  });
  it('stops queued actions after a storage failure and exposes uncertainty consistently', async () => {
    const driver = new Driver();
    const journal = new Journal();
    const controller = new Controller(driver, journal);
    controller.submit('one', command('storage'));
    controller.submit('one', command('queued'));
    journal.put = () => {
      throw new Error('Disk unavailable');
    };
    driver.resolve?.({ outcome: 'completed' });
    expect((await controller.wait('one', 'storage')).status).toBe('unknown');
    expect(controller.get('one', 'storage')?.status).toBe('unknown');
    expect((await controller.wait('one', 'queued')).status).toBe('unknown');
    expect(driver.calls).toBe(1);
    expect(() => controller.submit('one', command('next'))).toThrow('shutting down');
  });

  it('cancels running work even when persisting the cancellation fence fails', async () => {
    const driver = new Driver();
    const journal = new Journal();
    const controller = new Controller(driver, journal);
    controller.submit('one', command('stop'));
    journal.fence = () => {
      throw new Error('Disk unavailable');
    };
    await expect(controller.cancel('one', { session: 'session' })).rejects.toThrow(
      'Disk unavailable',
    );
    expect(controller.get('one', 'stop')?.status).toBe('cancelled');
    expect(() => controller.submit('one', command('next'))).toThrow('shutting down');
  });
});
