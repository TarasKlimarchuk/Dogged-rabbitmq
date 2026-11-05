export const ORDER_PATTERNS = {
  PLACE: 'order.place',
};

export const ORDERS_QUEUE = 'orders_queue';
export const ORDERS_DLQ = 'orders_queue.dlq';

// How many times a message is delivered before RabbitMQ gives up on it.
export const ORDERS_MAX_DELIVERIES = 5;

// Both the producer (terminal) and the consumer declare orders_queue, and
// RabbitMQ rejects a declaration whose arguments differ from the existing
// queue (PRECONDITION_FAILED). Keep this the single source for both sides.
export const ORDERS_QUEUE_OPTIONS = {
  durable: true,
  arguments: {
    'x-queue-type': 'quorum',
    // After this many failed deliveries (nack with requeue), the message is
    // dead-lettered instead of requeued, which stops endless retry loops.
    'x-delivery-limit': ORDERS_MAX_DELIVERIES,
    // Dead letters go through the default exchange (''), which routes by
    // queue name, so they land in ORDERS_DLQ.
    'x-dead-letter-exchange': '',
    'x-dead-letter-routing-key': ORDERS_DLQ,
  },
};

export const ORDERS_DLQ_OPTIONS = {
  durable: true,
  arguments: { 'x-queue-type': 'quorum' },
};
