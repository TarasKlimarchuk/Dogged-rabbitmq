export const ORDER_PATTERNS = {
  PLACE: 'order.place',
};

export const ORDERS_QUEUE = 'orders_queue';
export const ORDERS_DLQ = 'orders_queue.dlq';

// How many times a failed message is requeued before RabbitMQ dead-letters it
// (the quorum queue's x-delivery-limit). The first delivery is not a requeue.
export const ORDERS_DELIVERY_LIMIT = 5;

// Total processing attempts per message: the first delivery + every requeue.
export const ORDERS_MAX_ATTEMPTS = ORDERS_DELIVERY_LIMIT + 1;

// Both the producer (terminal) and the consumer declare orders_queue, and
// RabbitMQ rejects a declaration whose arguments differ from the existing
// queue (PRECONDITION_FAILED). Keep this the single source for both sides.
export const ORDERS_QUEUE_OPTIONS = {
  durable: true,
  arguments: {
    'x-queue-type': 'quorum',
    // After this many requeues (reject/nack with requeue), the next failure
    // dead-letters the message instead, which stops endless retry loops.
    'x-delivery-limit': ORDERS_DELIVERY_LIMIT,
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
