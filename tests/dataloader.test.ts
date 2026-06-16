import { createDataLoader } from '../src/dataloader';

describe('DataLoader', () => {
  it('should batch multiple loads', async () => {
    const batchFn = jest.fn(async (keys: string[]) => {
      return keys.map(key => `value:${key}`);
    });

    const loader = createDataLoader<string, string>(batchFn);

    const [a, b, c] = await Promise.all([
      loader.load('a'),
      loader.load('b'),
      loader.load('c')
    ]);

    expect(a).toBe('value:a');
    expect(b).toBe('value:b');
    expect(c).toBe('value:c');
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('should cache repeated loads', async () => {
    const batchFn = jest.fn(async (keys: string[]) => {
      return keys.map(key => `value:${key}`);
    });

    const loader = createDataLoader<string, string>(batchFn);

    const a1 = await loader.load('a');
    const a2 = await loader.load('a');

    expect(a1).toBe('value:a');
    expect(a2).toBe('value:a');
    expect(batchFn).toHaveBeenCalledTimes(1);
  });

  it('should support loadMany', async () => {
    const batchFn = jest.fn(async (keys: string[]) => {
      return keys.map(key => `value:${key}`);
    });

    const loader = createDataLoader<string, string>(batchFn);

    const results = await loader.loadMany(['a', 'b', 'c']);

    expect(results).toEqual(['value:a', 'value:b', 'value:c']);
    expect(batchFn).toHaveBeenCalledTimes(1);
  });

  it('should handle errors from batch function', async () => {
    const error = new Error('Batch error');
    const batchFn = jest.fn(async () => {
      throw error;
    });

    const loader = createDataLoader<string, string>(batchFn);

    await expect(loader.load('a')).rejects.toThrow(error);
  });

  it('should handle individual errors', async () => {
    const batchFn = jest.fn(async (keys: string[]) => {
      return keys.map(key =>
        key === 'b' ? new Error(`Error for ${key}`) : `value:${key}`
      );
    });

    const loader = createDataLoader<string, string>(batchFn);

    const a = await loader.load('a');
    await expect(loader.load('b')).rejects.toThrow('Error for b');
    const c = await loader.load('c');

    expect(a).toBe('value:a');
    expect(c).toBe('value:c');
  });

  it('should clear cache', async () => {
    const batchFn = jest.fn(async (keys: string[]) => {
      return keys.map(key => `value:${key}`);
    });

    const loader = createDataLoader<string, string>(batchFn);

    await loader.load('a');
    loader.clear('a');
    await loader.load('a');

    expect(batchFn).toHaveBeenCalledTimes(2);
  });

  it('should clear all cache', async () => {
    const batchFn = jest.fn(async (keys: string[]) => {
      return keys.map(key => `value:${key}`);
    });

    const loader = createDataLoader<string, string>(batchFn);

    await Promise.all([loader.load('a'), loader.load('b')]);
    loader.clearAll();
    await Promise.all([loader.load('a'), loader.load('b')]);

    expect(batchFn).toHaveBeenCalledTimes(2);
  });

  it('should prime cache', async () => {
    const batchFn = jest.fn(async (keys: string[]) => {
      return keys.map(key => `value:${key}`);
    });

    const loader = createDataLoader<string, string>(batchFn);
    loader.prime('a', 'primed:a');

    const result = await loader.load('a');

    expect(result).toBe('primed:a');
    expect(batchFn).not.toHaveBeenCalled();
  });

  it('should handle multiple batches across ticks', async () => {
    const batchFn = jest.fn(async (keys: string[]) => {
      return keys.map(key => `value:${key}`);
    });

    const loader = createDataLoader<string, string>(batchFn);

    const batch1 = await Promise.all([
      loader.load('a'),
      loader.load('b')
    ]);

    const batch2 = await Promise.all([
      loader.load('c'),
      loader.load('d')
    ]);

    expect(batch1).toEqual(['value:a', 'value:b']);
    expect(batch2).toEqual(['value:c', 'value:d']);
    expect(batchFn).toHaveBeenCalledTimes(2);
    expect(batchFn).toHaveBeenNthCalledWith(1, ['a', 'b']);
    expect(batchFn).toHaveBeenNthCalledWith(2, ['c', 'd']);
  });

  it('should validate return value length', async () => {
    const batchFn = jest.fn(async (keys: string[]) => {
      return ['only one'];
    });

    const loader = createDataLoader<string, string>(batchFn);

    await expect(
      Promise.all([loader.load('a'), loader.load('b')])
    ).rejects.toThrow('length 2 values');
  });

  it('should throw for null/undefined key', () => {
    const batchFn = jest.fn();
    const loader = createDataLoader<string, string>(batchFn);

    expect(() => loader.load(null as any)).toThrow();
    expect(() => loader.load(undefined as any)).toThrow();
  });

  it('should support custom cacheKeyFn', async () => {
    const batchFn = jest.fn(async (keys: number[]) => {
      return keys.map(key => `value:${key}`);
    });

    const cacheKeyFn = (key: number) => `key:${key}`;
    const loader = createDataLoader<number, string>(batchFn, { cacheKeyFn });

    const [a, b] = await Promise.all([
      loader.load(1),
      loader.load(1)
    ]);

    expect(a).toBe('value:1');
    expect(b).toBe('value:1');
    expect(batchFn).toHaveBeenCalledTimes(1);
  });

  it('should support disabling cache', async () => {
    const batchFn = jest.fn(async (keys: string[]) => {
      return keys.map(key => `value:${key}`);
    });

    const loader = createDataLoader<string, string>(batchFn, { cache: false });

    const a1 = await loader.load('a');
    const a2 = await loader.load('a');

    expect(a1).toBe('value:a');
    expect(a2).toBe('value:a');
    expect(batchFn).toHaveBeenCalledTimes(2);
  });

  it('should support disabling batching', async () => {
    const batchFn = jest.fn(async (keys: string[]) => {
      return keys.map(key => `value:${key}`);
    });

    const loader = createDataLoader<string, string>(batchFn, { batch: false });

    const [a, b] = await Promise.all([
      loader.load('a'),
      loader.load('b')
    ]);

    expect(a).toBe('value:a');
    expect(b).toBe('value:b');
    expect(batchFn).toHaveBeenCalledTimes(2);
  });
});
