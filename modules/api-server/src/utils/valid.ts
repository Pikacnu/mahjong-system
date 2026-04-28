import { Parser } from 'acorn';

export function validateCode(
  code: string,
): [false, string] | [true, string, ReturnType<typeof Parser.parse>] {
  try {
    const res = Parser.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });
    return [true, 'Success', res];
  } catch (e: any) {
    return [false, `${e.message}`];
  }
}
