export type ModuleData = {
  code: string;
  version: number;
  hash: bigint;
  name: string;
};

export class ModuleManager {
  private static instance: ModuleManager | null = null;
  private modules: Map<string, Array<Omit<ModuleData, 'name'>>> = new Map();
  // key is getModuleSearchKey, value is timestamp
  private modulesTimestamps: Map<string, number> = new Map();
  private dependencyVersions: Map<string, number> = new Map();
  private maxModuleCacheSize: number = 50;

  constructor() {}

  private getModuleSearchKey(name: string, version: number) {
    return `${name}_${version}`;
  }

  public static getInstance(maxModuleCacheSize: number = 50) {
    if (!this.instance) {
      this.instance = new ModuleManager();
      this.instance.maxModuleCacheSize = maxModuleCacheSize;
    }
    return this.instance;
  }

  public addModule({ name, code, hash, version }: ModuleData) {
    if (!this.modules.has(name)) {
      this.modules.set(name, []);
    }
    if (this.modules.get(name)!.length >= this.maxModuleCacheSize) {
      const currentUsingModules = new Set(
        Array.from(this.dependencyVersions.entries()).map(([name, version]) =>
          this.getModuleSearchKey(name, version),
        ),
      );
      const removableModuleName = Array.from(this.modulesTimestamps.entries())
        .filter(([key]) => !currentUsingModules.has(key))
        .sort(([k, t], [k2, t2]) => t - t2);
      if (
        removableModuleName.length > 0 &&
        removableModuleName[0] &&
        removableModuleName[0][1] !== undefined
      ) {
        const [keyToRemove] = removableModuleName[0];
        const [nameToRemove, versionToRemove] = keyToRemove.split('_') as [
          string,
          string,
        ];
        this.modules.set(
          nameToRemove,
          this.modules
            .get(nameToRemove)!
            .filter((m) => m.version.toString() !== versionToRemove),
        );
        this.modulesTimestamps.delete(keyToRemove);
      }
    }
    const previousData = this.modules.get(name) || [];
    this.modulesTimestamps.set(
      this.getModuleSearchKey(name, version),
      Date.now(),
    );
    this.modules.set(name, [...previousData, { code, hash, version }]);
  }

  public getModule(name: string): ModuleData | undefined {
    const module = this.modules.get(name);
    if (!module) return undefined;
    const versionData = module.find(
      (m) => m.version === this.dependencyVersions.get(name),
    );
    if (!versionData) return undefined;
    return { name, ...versionData };
  }

  public getModuleData(name: string, version: number): ModuleData | undefined {
    const module = this.modules.get(name);
    if (!module) return undefined;
    const versionData = module.find((m) => m.version === version);
    if (!versionData) return undefined;
    return { name, ...versionData };
  }

  public setDependencyVersion(name: string, version: number) {
    this.dependencyVersions.set(name, version);
  }

  public setDependenciesVersion(
    dependencies: { name: string; version: number }[],
  ) {
    dependencies.forEach((dep) => {
      this.setDependencyVersion(dep.name, dep.version);
    });
  }

  public clearDependencyVersion(name: string) {
    this.dependencyVersions.delete(name);
  }

  public clearAllDependencyVersions() {
    this.dependencyVersions.clear();
  }

  public deleteModule(name: string, version?: number) {
    const currentModules = this.modules.get(name);
    if (!currentModules) return;
    this.dependencyVersions.delete(name);
    if (version === undefined) {
      return this.modules.delete(name);
    }
    const filteredModules = currentModules.filter((m) => m.version !== version);
    if (filteredModules.length === 0) {
      return this.modules.delete(name);
    }
    this.modules.set(name, filteredModules);
  }
}
