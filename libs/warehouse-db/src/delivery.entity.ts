import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'deliveries' })
// named to match the AddRestockRequestId migration
@Unique('UQ_deliveries_restockRequestId', ['restockRequestId'])
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  restockRequestId: string | null;

  @Column()
  terminalId: string;

  @Column()
  itemName: string;

  @Column('int')
  quantity: number;

  @Column({ default: false })
  delivered: boolean;

  @Column({ default: false })
  notifiedOrdersManagement: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
