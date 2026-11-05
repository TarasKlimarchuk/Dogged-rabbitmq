import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'terminal_stock' })
export class TerminalStock {
  @PrimaryColumn()
  terminalId: string;

  @PrimaryColumn()
  itemName: string;

  @Column('int')
  quantity: number;

  @Column('int')
  capacity: number;

  @Column({ default: false })
  restockPending: boolean;
}
