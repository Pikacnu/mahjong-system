export type ModuleData = {
  code: string;
  version: number;
  hash: bigint;
  name: string;
};

export class ModuleManager {
  private static instance: ModuleManager | null = null;
  private modules: Map<string, Array<Omit<ModuleData, 'name'>>> = new Map();
  private currentVersion: number = 0;

  constructor() {}

  public static getInstance() {
    if (!this.instance) {
      this.instance = new ModuleManager();
    }
    return this.instance;
  }

  public addModule({ name, code, hash, version }: ModuleData) {
    const previousData = this.modules.get(name) || [];
    this.modules.set(name, [...previousData, { code, hash, version }]);
  }

  public getModule(name: string): ModuleData | undefined {
    const module = this.modules.get(name);
    if (!module) return undefined;
    const versionData = module.find((m) => m.version === this.currentVersion);
    if (!versionData) return undefined;
    return { name, ...versionData };
  }

  public setVersion(version: number) {
    this.currentVersion = version;
  }

  public deleteModule(name: string) {
    this.modules.delete(name);
  }
}
