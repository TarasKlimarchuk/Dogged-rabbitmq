import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export const REPLENISHMENT_PATTERNS = {
  RESTOCK_REQUESTED: 'replenishment.restock_requested',
  RESTOCK_DELIVERED: 'replenishment.restock_delivered',
} as const;

// Published by orders-worker (through its outbox) when a terminal's
// stock for an item drops below the reorder threshold. A class (not an
// interface) so the consumer can validate incoming payloads against it.
export class RestockRequestedEvent {
  // The outbox row id. Delivery is at-least-once, so the consumer must use
  // this to recognise and drop a message it has already handled. It is also
  // the restock's correlation id: warehouse stores it as
  // delivery.restockRequestId and sends it back in RestockDeliveredEvent.
  @IsUUID()
  messageId: string;

  // The order whose stock reservation took the item below the reorder
  // threshold. Only for tracing: one restock serves every later order for
  // that item, so this names the trigger, not "the" order. Optional so
  // messages published before this field existed still validate.
  @IsOptional()
  @IsUUID()
  triggeredByOrderId?: string;

  @IsString()
  @IsNotEmpty()
  terminalId: string;

  @IsString()
  @IsNotEmpty()
  itemName: string;

  @IsInt()
  @Min(1)
  upToCapacity: number;
}

// Published by warehouse (through its outbox) when a courier confirms a
// delivery. orders-worker adds the quantity to the terminal's stock and
// clears its restockPending flag, so the next low-stock check can request
// another restock.
export class RestockDeliveredEvent {
  // The outbox row id. Adding stock is not idempotent, so the consumer
  // records every messageId it handled and drops repeats.
  @IsUUID()
  messageId: string;

  @IsUUID()
  deliveryId: string;

  // The RestockRequestedEvent.messageId this delivery fulfils, so the restock
  // can be followed end to end in the logs. Null for deliveries created
  // before restock requests carried an id.
  @IsOptional()
  @IsUUID()
  restockRequestId?: string | null;

  @IsString()
  @IsNotEmpty()
  terminalId: string;

  @IsString()
  @IsNotEmpty()
  itemName: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

// How many times a failed message is requeued before RabbitMQ dead-letters it
// (the quorum queue's x-delivery-limit). The first delivery is not a requeue.
// Applies to both replenishment queues below.
export const REPLENISHMENTS_DELIVERY_LIMIT = 5;

// Total processing attempts per message: the first delivery + every requeue.
export const REPLENISHMENTS_MAX_ATTEMPTS = REPLENISHMENTS_DELIVERY_LIMIT + 1;

// Both the producer and the consumer declare each queue, and RabbitMQ rejects
// a declaration whose arguments differ from the existing queue
// (PRECONDITION_FAILED). Keep these the single source for both sides.
function quorumQueueWithDlq(dlq: string) {
  return {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      // After this many requeues (reject/nack with requeue), the next failure
      // dead-letters the message instead, which stops endless retry loops.
      'x-delivery-limit': REPLENISHMENTS_DELIVERY_LIMIT,
      // Dead letters go through the default exchange (''), which routes by
      // queue name, so they land in the given DLQ.
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': dlq,
    },
  };
}

const DLQ_OPTIONS = {
  durable: true,
  arguments: { 'x-queue-type': 'quorum' },
};

// orders-worker -> restock-request-consumer
export const REPLENISHMENTS_QUEUE = 'replenishments_queue';
export const REPLENISHMENTS_DLQ = 'replenishments_queue.dlq';
export const REPLENISHMENTS_QUEUE_OPTIONS =
  quorumQueueWithDlq(REPLENISHMENTS_DLQ);
export const REPLENISHMENTS_DLQ_OPTIONS = DLQ_OPTIONS;

// warehouse -> orders-worker
export const RESTOCK_DELIVERIES_QUEUE = 'restock_deliveries_queue';
export const RESTOCK_DELIVERIES_DLQ = 'restock_deliveries_queue.dlq';
export const RESTOCK_DELIVERIES_QUEUE_OPTIONS = quorumQueueWithDlq(
  RESTOCK_DELIVERIES_DLQ,
);
export const RESTOCK_DELIVERIES_DLQ_OPTIONS = DLQ_OPTIONS;
