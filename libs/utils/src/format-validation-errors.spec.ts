import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  validate,
} from 'class-validator';
import { formatErrors } from './format-validation-errors.js';

class Item {
  @IsString()
  name: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

class Message {
  @IsUUID()
  id: string;

  @ValidateNested({ each: true })
  @Type(() => Item)
  items: Item[];
}

async function errorsFor(payload: unknown) {
  return validate(plainToInstance(Message, payload));
}

describe('formatErrors', () => {
  it('returns an empty string when there are no errors', () => {
    expect(formatErrors([])).toBe('');
  });

  it('formats a top-level constraint with its property name', async () => {
    const errors = await errorsFor({ id: 'not-a-uuid', items: [] });

    expect(formatErrors(errors)).toBe('id: id must be a UUID');
  });

  it('builds a dotted path for errors inside nested arrays', async () => {
    const errors = await errorsFor({
      id: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d',
      items: [{ name: 'Hot Dog', quantity: 0 }],
    });

    expect(formatErrors(errors)).toBe(
      'items.0.quantity: quantity must not be less than 1',
    );
  });

  it('joins multiple errors with "; " and never includes rejected values', async () => {
    const errors = await errorsFor({
      id: 'secret-value',
      items: [{ name: 42, quantity: 1 }],
    });

    const formatted = formatErrors(errors);

    expect(formatted).toBe(
      'id: id must be a UUID; items.0.name: name must be a string',
    );
    expect(formatted).not.toContain('secret-value');
  });
});
