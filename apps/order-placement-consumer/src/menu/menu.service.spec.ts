import type { Repository } from 'typeorm';
import type { MenuItem } from '@app/orders-db';
import { MenuService } from './menu.service.js';

function createRepo(find: ReturnType<typeof vi.fn>): Repository<MenuItem> {
  return { find } as unknown as Repository<MenuItem>;
}

describe('MenuService', () => {
  it('returns names that are not on the menu', async () => {
    const find = vi.fn().mockResolvedValue([{ id: '1', name: 'Hot Dog', price: 5 }]);
    const service = new MenuService(createRepo(find));

    await expect(service.findMissingNames(['Hot Dog', 'Pizza'])).resolves.toEqual(['Pizza']);
  });

  it('deduplicates names before querying', async () => {
    const find = vi.fn().mockResolvedValue([{ id: '1', name: 'Hot Dog', price: 5 }]);
    const service = new MenuService(createRepo(find));

    await service.findMissingNames(['Hot Dog', 'Hot Dog']);

    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0][0].where.name.value).toEqual(['Hot Dog']);
  });

  it('does not query for an empty list', async () => {
    const find = vi.fn();
    const service = new MenuService(createRepo(find));

    await expect(service.findMissingNames([])).resolves.toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });
});
