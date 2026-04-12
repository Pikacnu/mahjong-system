export function shuffleArray<T>(array: Array<T>): Array<T> {
  const shuffledArray = [...array];
  for (let i = shuffledArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledArray[i], shuffledArray[j]] = [
      shuffledArray[j]!,
      shuffledArray[i]!,
    ];
  }
  return shuffledArray;
}

export function decodeUnknown(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function encodeUnknown(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function decodeFromBytes(value: any): unknown {
  if (Buffer.isBuffer(value)) {
    const text = value.toString('utf-8');
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  if (value instanceof Uint8Array) {
    const text = Buffer.from(value).toString('utf-8');
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return value;
}

export function encodeToBytes(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return value;
  if (
    typeof value === 'object' ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    try {
      const text =
        typeof value === 'string' ? value : JSON.stringify(value ?? null);
      return Buffer.from(text, 'utf-8');
    } catch {
      return value;
    }
  }
  return value;
}
