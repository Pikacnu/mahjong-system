import type { FunctionInfo } from 'proto/src/generated/services/runner';

export type createCacherOptions = {
  MaxEntrys?: number;
  CacheTimeoutMin?: number;
};

class Cacher<T> {
  private cache: Map<string, T> = new Map();
  private options: createCacherOptions = {
    MaxEntrys: 100,
    CacheTimeoutMin: 60,
  };

  private cleanUpIntervalId: NodeJS.Timeout;

  constructor(options?: createCacherOptions) {
    if (options) {
      this.options = { ...this.options, ...options };
    }
    this.cleanUpIntervalId = setInterval(
      () => {
        this.cleanUpCache();
      },
      (this.options.CacheTimeoutMin! * 60 * 1000) / 4,
    );
  }

  private isCacheExpired(entryTime: number): boolean {
    const currentTime = Date.now();
    return currentTime - entryTime > this.options.CacheTimeoutMin! * 60 * 1000;
  }

  public cleanUpCache() {
    for (const [key, value] of this.cache.entries()) {
      const entryTime = (value as any).entryTime;
      if (this.isCacheExpired(entryTime)) {
        this.cache.delete(key);
      }
    }
  }

  public addCache(key: string, value: T) {
    if (this.cache.size >= this.options.MaxEntrys! && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value!;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  public setCache(key: string, value: T) {
    if (!this.cache.has(key)) {
      this.cache.set(key, value);
    }
    this.addCache(key, value);
  }

  public getCache(key: string): T | undefined {
    return this.cache.get(key);
  }

  public getCacheKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  public cleanCache() {
    this.cache.clear();
  }

  public hasCache(key: string): boolean {
    return this.cache.has(key);
  }

  public clean() {
    this.cleanUpCache();
    clearInterval(this.cleanUpIntervalId);
  }
}

export class CodeCacher extends Cacher<string> {
  private static instance: CodeCacher | null = null;
  constructor(options?: createCacherOptions) {
    super(options);
  }

  public static getInstance(options?: createCacherOptions): CodeCacher {
    if (!this.instance) {
      this.instance = new CodeCacher(options);
    }
    return this.instance;
  }

  private generateKey(functionInfo: FunctionInfo): string {
    return `${functionInfo.name}_${functionInfo.version}`;
  }

  public addCode(functionInfo: FunctionInfo, code: string) {
    this.addCache(this.generateKey(functionInfo), code);
  }

  public setCode(functionInfo: FunctionInfo, code: string) {
    this.setCache(this.generateKey(functionInfo), code);
  }

  public getCode(functionInfo: FunctionInfo): string | undefined {
    return this.getCache(this.generateKey(functionInfo));
  }

  public hasCode(functionInfo: FunctionInfo): boolean {
    return this.getCache(this.generateKey(functionInfo)) !== undefined;
  }

  public getAllFunctionNames(): string[] {
    return this.getCacheKeys();
  }

  public override clean() {
    super.clean();
    this.cleanCache();
  }
}
