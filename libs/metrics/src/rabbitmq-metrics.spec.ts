import { Registry } from '@prometheus-io/client';
import { RabbitmqMetrics } from './rabbitmq-metrics.js';

describe('RabbitmqMetrics', () => {
  let registry: Registry;
  let metrics: RabbitmqMetrics;

  beforeEach(() => {
    registry = new Registry();
    metrics = new RabbitmqMetrics(registry);
  });

  it('counts settled messages per pattern and outcome', async () => {
    metrics.messageSettled('order.place', 'ack');
    metrics.messageSettled('order.place', 'ack');
    metrics.messageSettled('order.place', 'dead_letter');
    metrics.messageSettled('restock.delivered', 'requeue');

    const text = await registry.metrics();
    expect(text).toContain(
      'rabbitmq_messages_settled_total{pattern="order.place",outcome="ack"} 2',
    );
    expect(text).toContain(
      'rabbitmq_messages_settled_total{pattern="order.place",outcome="dead_letter"} 1',
    );
    expect(text).toContain(
      'rabbitmq_messages_settled_total{pattern="restock.delivered",outcome="requeue"} 1',
    );
  });
});
