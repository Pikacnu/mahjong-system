import {
  QuickJSRuntime,
  Scope,
  type QuickJSHandle,
  getQuickJS,
  QuickJSContext,
} from 'quickjs-emscripten';
import { VM_MAX_STACK_SIZE, WORKER_MEMORY_LIMIT } from './config';
import { isCodeValid } from './tools';
import type { VMOptions, VMFunctionArgs } from './type';
import type { ModuleManager } from '../manager/moduleManager';

export async function getQuickJsRuntime(
  moduleManager: ModuleManager,
): Promise<QuickJSRuntime> {
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
    options?: Partial<VMOptions>,
    functionArgs?: VMFunctionArgs,
  ) {
    return Scope.withScope((scope) => {
      const resolvedOptions: VMOptions = {
        ...this.defaultOptions,
        ...(options || {}),
      };
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
      const entryName = resolvedOptions.entryFunctionName;

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

export class durableVM {
  private runtime: QuickJSRuntime;
  private currentContext: QuickJSContext | null = null;

  constructor({ runtime }: { runtime: QuickJSRuntime }) {
    this.runtime = runtime;
  }

  public validateCode(code: string) {
    return isCodeValid(code);
  }

  public init(code: string) {
    if (this.currentContext) {
      this.currentContext.dispose();
      this.currentContext = null;
    }

    const vm = this.runtime.newContext();
    const result = vm.evalCode(code, 'durableRuntime.js', { type: 'module' });

    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      vm.dispose();
      throw new Error(String(error));
    }

    result.value.dispose();

    this.currentContext = vm;
    return true;
  }

  public getValue(name: string) {
    if (!this.currentContext) {
      throw new Error('durableVM not initialized');
    }
    const value = this.currentContext.getProp(this.currentContext.global, name);
    try {
      return this.currentContext.dump(value);
    } finally {
      value.dispose();
    }
  }

  private serializeValue(val: any) {
    if (!this.currentContext) {
      throw new Error('durableVM not initialized');
    }
    const jsonModule = this.currentContext.getProp(
      this.currentContext.global,
      'JSON',
    );
    const stringifyFunc = this.currentContext.getProp(jsonModule, 'stringify');
    const value = this.currentContext.unwrapResult(
      this.currentContext.callFunction(
        stringifyFunc,
        this.currentContext.undefined,
        this.currentContext.newString(JSON.stringify(val)),
      ),
    );
    jsonModule.dispose();
    stringifyFunc.dispose();
    return value;
  }

  public setValue(name: string, val: any) {
    if (!this.currentContext) {
      throw new Error('durableVM not initialized');
    }
    const value = this.serializeValue(val);
    this.currentContext.setProp(this.currentContext.global, name, value);
    value.dispose();
    return true;
  }

  public runFunction(
    functionName: string,
    functionArgs: {
      this: any;
      args: any[];
    },
  ) {
    if (!this.currentContext) {
      throw new Error('durableVM not initialized');
    }
    const func = this.currentContext.getProp(
      this.currentContext.global,
      functionName,
    );
    if (this.currentContext.dump(func) === '[object Function]') {
      const thisVal = this.serializeValue(functionArgs.this);
      const argsVal = this.serializeValue(functionArgs.args);
      const result = this.currentContext.unwrapResult(
        this.currentContext.callFunction(func, thisVal, argsVal),
      );
      func.dispose();
      thisVal.dispose();
      argsVal.dispose();
      return this.currentContext.dump(result);
    } else {
      func.dispose();
      throw new Error(`Function ${functionName} not found`);
    }
  }

  public clean() {
    this.currentContext?.dispose();
    this.currentContext = null;
  }
}
