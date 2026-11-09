import type { ClientProxy } from '@nestjs/microservices';
import type { DataSource } from 'typeorm';
import { Observable, of, throwError } from 'rxjs';
import { OutboxMessage } from '@app/orders-db';
import { OUTBOX_MAX_ATTEMPTS, OutboxRelay } from './outbox.relay.js';

function row(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    id: 'message-1',
    pattern: 'replenishment.restock_requested',
    payload: { terminalId: 'terminal-a', itemName: 'Hot Dog' },
    createdAt: new Date(),
    publishedAt: null,
    attempts: 0,
    lastError: null,
    ...overrides,
  };
}

function setup(
  batch: OutboxMessage[],
  emit = vi.fn().mockReturnValue(of(undefined)),
) {
  const qb = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    setLock: vi.fn().mockReturnThis(),
    setOnLocked: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue(batch),
  };
  const manager = {
    getRepository: () => ({ createQueryBuilder: () => qb }),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  };
  const transaction = vi.fn(
    async (work: (m: typeof manager) => Promise<unknown>) => work(manager),
  );
  const relay = new OutboxRelay(
    { transaction } as unknown as DataSource,
    { emit } as unknown as ClientProxy,
  );
  return { relay, qb, manager, emit, transaction };
}

describe('OutboxRelay', () => {
  it('publishes unsent rows with their id as messageId, then marks them sent', async () => {
    const { relay, emit, manager } = setup([row()]);

    const published = await relay.publishBatch();

    expect(published).toBe(1);
    expect(emit).toHaveBeenCalledWith('replenishment.restock_requested', {
      messageId: 'message-1',
      terminalId: 'terminal-a',
      itemName: 'Hot Dog',
    });
    expect(manager.update).toHaveBeenCalledWith(OutboxMessage, 'message-1', {
      publishedAt: expect.any(Date),
    });
  });

  it('locks rows with SKIP LOCKED so replicas never pick the same batch', async () => {
    const { relay, qb } = setup([]);

    await relay.publishBatch();

    expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(qb.setOnLocked).toHaveBeenCalledWith('skip_locked');
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('attempts'),
      {
        maxAttempts: OUTBOX_MAX_ATTEMPTS,
      },
    );
  });

  it('does not mark a row sent when the broker rejects the publish, and records the error', async () => {
    const emit = vi
      .fn()
      .mockReturnValue(throwError(() => new Error('broker down')));
    const { relay, manager } = setup([row()], emit);

    const published = await relay.publishBatch();

    expect(published).toBe(0);
    expect(manager.update).not.toHaveBeenCalledWith(
      OutboxMessage,
      'message-1',
      expect.objectContaining({ publishedAt: expect.anything() }),
    );
    expect(manager.update).toHaveBeenCalledWith(OutboxMessage, 'message-1', {
      attempts: expect.any(Function),
      lastError: 'broker down',
    });
  });

  it('keeps going after one failed row, so one bad message does not block the rest', async () => {
    const emit = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('broker down')))
      .mockReturnValueOnce(of(undefined));
    const { relay, manager } = setup(
      [row({ id: 'bad' }), row({ id: 'good' })],
      emit,
    );

    const published = await relay.publishBatch();

    expect(published).toBe(1);
    expect(manager.update).toHaveBeenCalledWith(OutboxMessage, 'good', {
      publishedAt: expect.any(Date),
    });
  });

  it('waits for the broker confirm before marking the row sent', async () => {
    // emit() is an Observable; a relay that forgot lastValueFrom would mark
    // the row sent before this one ever settles
    let confirm!: () => void;
    const pending = new Promise<void>((resolve) => (confirm = resolve));
    const emit = vi.fn().mockReturnValue(
      new Observable((subscriber) => {
        void pending.then(() => {
          subscriber.next(undefined);
          subscriber.complete();
        });
      }),
    );
    const { relay, manager } = setup([row()], emit);

    const run = relay.publishBatch();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(manager.update).not.toHaveBeenCalled();

    confirm();
    await run;
    expect(manager.update).toHaveBeenCalledTimes(1);
  });

  it('tick() never overlaps itself and never throws', async () => {
    const { relay, transaction } = setup([]);
    let release!: () => void;
    transaction.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve(0))),
    );

    const first = relay.tick();
    await relay.tick(); // returns at once: first is still running
    expect(transaction).toHaveBeenCalledTimes(1);
    release();
    await first;

    transaction.mockRejectedValueOnce(new Error('db down'));
    await expect(relay.tick()).resolves.toBeUndefined();
  });
});
