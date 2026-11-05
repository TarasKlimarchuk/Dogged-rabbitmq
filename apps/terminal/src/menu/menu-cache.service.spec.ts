import type { ConfigService } from '@nestjs/config';
import { MenuCacheService } from './menu-cache.service.js';

function createService(): MenuCacheService {
  const config = { get: () => ':memory:' } as unknown as ConfigService;
  return new MenuCacheService(config);
}

describe('MenuCacheService', () => {
  it('returns null when nothing has been cached yet', () => {
    const cache = createService();

    expect(cache.getCachedMenu()).toBeNull();
  });

  it('saves and reads back the menu items', () => {
    const cache = createService();
    const items = [{ name: 'Hot Dog', price: 1.99 }];

    cache.saveMenu(items);
    const snapshot = cache.getCachedMenu();

    expect(snapshot?.items).toEqual(items);
    expect(snapshot?.cachedAt).toEqual(expect.any(String));
  });

  it('overwrites the previous snapshot on each save, not accumulating rows', () => {
    const cache = createService();

    cache.saveMenu([{ name: 'Hot Dog', price: 1.99 }]);
    cache.saveMenu([{ name: 'Hot Dog', price: 2.49 }]);

    expect(cache.getCachedMenu()?.items).toEqual([
      { name: 'Hot Dog', price: 2.49 },
    ]);
  });
});
