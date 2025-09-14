import { describe, expect, it, vi } from 'vitest';

vi.useFakeTimers();

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('forwardWithRetry', () => {
  it('retries and queues events on CMS failure', async () => {
    process.env.ALARM_MAX_RETRIES = '2';
    process.env.ALARM_RETRY_BACKOFF_MS = '10';
    const mod = await import('../src/alarms/tcp-listener.js');

    fetchMock.mockRejectedValue(new Error('fail'));
    const evt = { foo: 'bar' };
    const p = mod.forwardWithRetry(evt);
    await vi.runAllTimersAsync();
    await p;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mod.failedEvents.length).toBe(1);

    fetchMock.mockResolvedValue({ ok: true, text: async () => '' } as any);
    const p2 = mod.processFailedEvents();
    await vi.runAllTimersAsync();
    await p2;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mod.failedEvents.length).toBe(0);
  });
});
