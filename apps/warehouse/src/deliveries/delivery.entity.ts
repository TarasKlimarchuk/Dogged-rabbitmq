import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'deliveries' })
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
