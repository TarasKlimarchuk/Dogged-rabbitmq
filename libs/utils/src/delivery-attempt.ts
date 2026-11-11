// Quorum queues set x-delivery-count on redeliveries (it's absent on the first
// one), so the current attempt is that count + 1.
export function deliveryAttempt(message: {
  properties?: { headers?: Record<string, unknown> };
}): number {
  const previous = Number(
    message.properties?.headers?.['x-delivery-count'] ?? 0,
  );
  return (Number.isFinite(previous) ? previous : 0) + 1;
}
