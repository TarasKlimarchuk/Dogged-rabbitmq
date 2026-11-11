import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

// Transactional outbox: a message to publish is written here in the same
// transaction as the business change that caused it, so the two are saved
// together or not at all. A relay publishes unsent rows to the broker later.
@Entity({ name: 'outbox' })
@Index('IDX_outbox_unpublished', ['createdAt'], {
  where: '"publishedAt" IS NULL',
})
export class OutboxMessage {
  // Also sent as the message's messageId, so consumers can drop duplicates.
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  pattern: string;

  @Column('jsonb')
  payload: object;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  // NULL until the broker has confirmed the publish.
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column('int', { default: 0 })
  attempts: number;

  @Column('text', { nullable: true })
  lastError: string | null;
}
