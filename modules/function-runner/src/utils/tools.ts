import { Parser } from 'acorn';

export function isCodeValid(code: string) {
  try {
    Parser.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    return true;
  } catch {
    return false;
  }
}
