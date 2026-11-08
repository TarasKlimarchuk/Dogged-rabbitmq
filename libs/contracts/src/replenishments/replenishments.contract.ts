export const ORDER_PATTERNS = {
  PLACE: 'replenishment.place',
};

export const REPLENISHMENTS_QUEUE = 'replenishments_queue';
export const REPLENISHMENTS_DLQ = 'replenishments_queue.dlq';

// How many times a failed message is requeued before RabbitMQ dead-letters it
// (the quorum queue's x-delivery-limit). The first delivery is not a requeue.
export const REPLENISHMENTS_DELIVERY_LIMIT = 5;

// Total processing attempts per message: the first delivery + every requeue.
export const REPLENISHMENTS_MAX_ATTEMPTS = REPLENISHMENTS_DELIVERY_LIMIT + 1;

// Both the producer (terminal) and the consumer declare replenishments_queue, and
// RabbitMQ rejects a declaration whose arguments differ from the existing
// queue (PRECONDITION_FAILED). Keep this the single source for both sides.
export const REPLENISHMENTS_QUEUE_OPTIONS = {
  durable: true,
  arguments: {
    'x-queue-type': 'quorum',
    // After this many requeues (reject/nack with requeue), the next failure
    // dead-letters the message instead, which stops endless retry loops.
    'x-delivery-limit': REPLENISHMENTS_DELIVERY_LIMIT,
    // Dead letters go through the default exchange (''), which routes by
    // queue name, so they land in REPLENISHMENTS_DLQ.
    'x-dead-letter-exchange': '',
    'x-dead-letter-routing-key': REPLENISHMENTS_DLQ,
  },
};

export const REPLENISHMENTS_DLQ_OPTIONS = {
  durable: true,
  arguments: { 'x-queue-type': 'quorum' },
};
