import { BatchLoadFn, DataLoaderOptions, DataLoader as IDataLoader } from './types';

type Batch<K, V> = {
  keys: K[];
  callbacks: Array<(value: V | Error) => void>;
  hasDispatched: boolean;
};

class DataLoaderImpl<K, V> implements IDataLoader<K, V> {
  private batchLoadFn: BatchLoadFn<K, V>;
  private options: Required<DataLoaderOptions<K, V>>;
  private batch: Batch<K, V> | null = null;
  private cache = new Map<any, Promise<V>>();

  constructor(
    batchLoadFn: BatchLoadFn<K, V>,
    options?: DataLoaderOptions<K, V>
  ) {
    this.batchLoadFn = batchLoadFn;
    this.options = {
      batch: options?.batch ?? true,
      cache: options?.cache ?? true,
      cacheKeyFn: options?.cacheKeyFn ?? ((key: K) => key)
    };
  }

  load(key: K): Promise<V> {
    if (key === undefined || key === null) {
      throw new Error('The loader.load() function must be called with a value, ' +
                     `but got: ${String(key)}.`);
    }

    const cacheKey = this.options.cacheKeyFn(key);

    if (this.options.cache) {
      const cachedPromise = this.cache.get(cacheKey);
      if (cachedPromise) {
        return cachedPromise;
      }
    }

    const promise = new Promise<V>((resolve, reject) => {
      if (!this.options.batch || !this.batch || this.batch.hasDispatched) {
        this.batch = {
          keys: [],
          callbacks: [],
          hasDispatched: false
        };
        enqueuePostPromiseJob(() => this.dispatchBatch());
      }

      const batch = this.batch;
      batch.keys.push(key);
      batch.callbacks.push((value: V | Error) => {
        if (value instanceof Error) {
          reject(value);
        } else {
          resolve(value);
        }
      });
    });

    if (this.options.cache) {
      this.cache.set(cacheKey, promise);
    }

    return promise;
  }

  loadMany(keys: K[]): Promise<V[]> {
    return Promise.all(keys.map(key => {
      try {
        return this.load(key);
      } catch (error) {
        return Promise.reject(error);
      }
    }));
  }

  clear(key: K): this {
    const cacheKey = this.options.cacheKeyFn(key);
    this.cache.delete(cacheKey);
    return this;
  }

  clearAll(): this {
    this.cache.clear();
    return this;
  }

  prime(key: K, value: V | Error): this {
    const cacheKey = this.options.cacheKeyFn(key);
    if (!this.cache.has(cacheKey)) {
      const promise = value instanceof Error
        ? Promise.reject(value)
        : Promise.resolve(value);
      this.cache.set(cacheKey, promise);
    }
    return this;
  }

  private async dispatchBatch(): Promise<void> {
    const batch = this.batch;
    if (!batch || batch.hasDispatched) {
      return;
    }

    batch.hasDispatched = true;
    const { keys, callbacks } = batch;

    try {
      const values = await this.batchLoadFn(keys);

      if (!Array.isArray(values)) {
        throw new Error(
          'DataLoader batch function must return an array of values, ' +
          `but got: ${String(values)}.`
        );
      }

      if (values.length !== keys.length) {
        throw new Error(
          'DataLoader batch function must return an array of length ' +
          `${keys.length} values, but got ${values.length} values.`
        );
      }

      for (let i = 0; i < callbacks.length; i++) {
        callbacks[i](values[i]);
      }
    } catch (error) {
      for (let i = 0; i < callbacks.length; i++) {
        callbacks[i](error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}

let queued = false;
const queue: Array<() => void> = [];

function enqueuePostPromiseJob(fn: () => void): void {
  queue.push(fn);
  if (!queued) {
    queued = true;
    Promise.resolve().then(dispatchQueue);
  }
}

function dispatchQueue(): void {
  const currentQueue = queue.slice();
  queue.length = 0;
  queued = false;

  for (const fn of currentQueue) {
    try {
      fn();
    } catch (error) {
      console.error('Error in DataLoader dispatch queue:', error);
    }
  }
}

export function createDataLoader<K, V>(
  batchLoadFn: BatchLoadFn<K, V>,
  options?: DataLoaderOptions<K, V>
): IDataLoader<K, V> {
  return new DataLoaderImpl<K, V>(batchLoadFn, options);
}

export { DataLoaderImpl };
export type DataLoader<K, V> = IDataLoader<K, V>;
