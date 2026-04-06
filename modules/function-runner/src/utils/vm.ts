import {
  QuickJSRuntime,
  Scope,
  type QuickJSHandle,
  getQuickJS,
} from 'quickjs-emscripten';
import { VM_MAX_STACK_SIZE, WORKER_MEMORY_LIMIT } from './config';
import { isCodeValid } from './tools';
import type { VMOptions, VMFunctionArgs } from './type';
import { ModuleManager } from './moduleManager';

const moduleManager = ModuleManager.getInstance();

export async function getQuickJsRuntime(): Promise<QuickJSRuntime> {
  const QuickJS = await getQuickJS();
  const quickjsRuntime = QuickJS.newRuntime();

  quickjsRuntime.setMemoryLimit(WORKER_MEMORY_LIMIT);
  quickjsRuntime.setMaxStackSize(VM_MAX_STACK_SIZE);

  quickjsRuntime.setModuleLoader((moduleName: string) => {
    const moduleData = moduleManager.getModule(moduleName)?.code;
    if (!moduleData) throw new Error(`Module not found: ${moduleName}`);
    return moduleData;
  });

  const interruptFn = (() => {
    let interruptCycles = 0;
    return () => ++interruptCycles >= 1000;
  })();

  quickjsRuntime.setInterruptHandler(interruptFn);

  return quickjsRuntime;
}

export class VM {
  private runtime: QuickJSRuntime;
  private defaultOptions: VMOptions = {
    entryFunctionName: 'entry',
    executeType: 'default',
  };

  constructor({
    runtime,
    defaultConfig,
  }: {
    runtime: QuickJSRuntime;
    defaultConfig?: Partial<VMOptions>;
  }) {
    this.runtime = runtime;
    if (defaultConfig) {
      this.defaultOptions = { ...this.defaultOptions, ...defaultConfig };
    }
  }

  validateCode(code: string) {
    return isCodeValid(code);
  }

  runCode(
    code: string,
    options = this.defaultOptions,
    functionArgs?: VMFunctionArgs,
  ) {
    return Scope.withScope((scope) => {
      const vm = scope.manage(this.runtime.newContext());

      // 執行程式碼
      const result = vm.evalCode(code, 'runtime.js', { type: 'module' });
      const exports = scope.manage(vm.unwrapResult(result));

      const jsonModule = scope.manage(vm.getProp(vm.global, 'JSON'));
      const parseFunc = scope.manage(vm.getProp(jsonModule, 'parse'));

      const [inputThis, ...argsArray] = [
        functionArgs?.this,
        ...(functionArgs?.args || []),
      ].map((obj) => {
        if (!obj) return vm.undefined;
        return scope.manage(
          vm.unwrapResult(
            vm.callFunction(
              parseFunc,
              vm.undefined,
              vm.newString(JSON.stringify(obj || {})),
            ),
          ),
        );
      }) as [QuickJSHandle, QuickJSHandle];

      let entryFunction: QuickJSHandle;
      const entryName = options.entryFunctionName;

      // 檢查並取得進入點函式
      if (vm.dump(vm.getProp(exports, entryName))) {
        entryFunction = scope.manage(vm.getProp(exports, entryName));
      } else {
        entryFunction = scope.manage(vm.getProp(vm.global, entryName));
      }

      if (vm.dump(entryFunction)) {
        // 使用展開的參數調用函數
        const callResult = vm.callFunction(
          entryFunction,
          inputThis,
          ...argsArray,
        );
        const functionVal = vm.dump(vm.unwrapResult(callResult));
        return functionVal;
      } else {
        throw new Error(`Function ${entryName} not found`);
      }
    });
  }
}
