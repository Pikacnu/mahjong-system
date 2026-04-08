import { Parser } from 'acorn';

export function isCodeValid(code: string) {
  try {
    Parser.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    return true;
  } catch {
    return false;
  }
}

export function objectToBuffer(obj: any): Buffer {
  const jsonString = JSON.stringify(obj);
  return Buffer.from(jsonString, 'utf-8');
}

export function bufferToObject<T>(buffer: Buffer): T {
  const jsonString = buffer.toString('utf-8');
  return JSON.parse(jsonString) as T;
}
