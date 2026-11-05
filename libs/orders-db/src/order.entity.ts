import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export interface OrderItem {
  name: string;
  quantity: number;
}

@Entity({ name: 'orders' })
export class Order {
  @PrimaryColumn('uuid')
  idempotencyKey: string;

  @Column()
  terminalId: string;

  @Column('jsonb')
  items: OrderItem[];

  @Column({ default: false })
  inventoryIssue: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
