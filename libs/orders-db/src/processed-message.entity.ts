import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// Inbox: the id of every message this database has already applied.
// The consumer inserts the id in the same transaction as the change the
// message causes, so a redelivered message (at-least-once delivery) finds its
// id here and is skipped instead of being applied twice.
@Entity({ name: 'processed_messages' })
export class ProcessedMessage {
  @PrimaryColumn('uuid')
  messageId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  processedAt: Date;
}
