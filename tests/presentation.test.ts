import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentationDriver } from '../src/runtime/presentation-driver';
import type { PresentationOrder } from '../src/protocol/presentation';

afterEach(() => vi.useRealTimers());
const action = { action: 'say', text: 'hello', durationMs: 1000 } as const;
function fixture() {
  const orders: PresentationOrder[] = [];
  const reset = vi.fn();
  const driver = new PresentationDriver({
    send: (order) => {
      orders.push(order);
    },
    reset,
  });
  driver.ready();
  return { driver, orders, reset };
}
describe('platform-neutral presentation', () => {
  it('waits for a matching receipt and propagates cancellation to the endpoint', async () => {
    const { driver, orders } = fixture();
    const abort = new AbortController();
    const pending = driver.execute(action, abort.signal);
    driver.acknowledge('unrelated', { outcome: 'completed' });
    abort.abort();
    expect(orders.map((order) => order.type)).toEqual(['execute', 'cancel']);
    driver.acknowledge(orders[0]!.id, { outcome: 'cancelled' });
    expect(await pending).toEqual({ outcome: 'cancelled' });
  });
  it('resets an unresponsive frontend and rejects new work until ready', async () => {
    vi.useFakeTimers();
    const { driver, reset } = fixture();
    const abort = new AbortController();
    const pending = driver.execute(action, abort.signal);
    abort.abort();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ outcome: 'unknown' });
    expect(reset).toHaveBeenCalledOnce();
    expect(await driver.execute(action, new AbortController().signal)).toMatchObject({
      outcome: 'failed',
    });
  });
  it('does not replay interrupted work after a frontend reconnects', async () => {
    const { driver, orders } = fixture();
    const pending = driver.execute(action, new AbortController().signal);
    driver.disconnected('connection closed');
    expect(await pending).toMatchObject({ outcome: 'unknown' });
    driver.ready();
    expect(orders).toHaveLength(1);
    const next = driver.execute(action, new AbortController().signal);
    driver.acknowledge(orders[0]!.id, { outcome: 'completed' });
    driver.acknowledge(orders[1]!.id, { outcome: 'completed' });
    expect(await next).toEqual({ outcome: 'completed' });
  });
});
