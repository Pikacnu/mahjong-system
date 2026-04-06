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

  constructor(options?: createCacherOptions) {
    if (options) {
      this.options = { ...this.options, ...options };
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

  public addCode(functionName: string, code: string) {
    this.addCache(functionName, code);
  }

  public getCode(functionName: string): string | undefined {
    return this.getCache(functionName);
  }

  public setCode(functionName: string, code: string) {
    this.addCache(functionName, code);
  }

  public hasCode(functionName: string): boolean {
    return this.getCache(functionName) !== undefined;
  }

  public getAllFunctionNames(): string[] {
    return this.getCacheKeys();
  }
}
