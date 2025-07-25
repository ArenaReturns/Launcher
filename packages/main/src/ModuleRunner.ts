import { AppModule } from "./AppModule.js";
import { ModuleContext } from "./ModuleContext.js";
import { app } from "electron";
import type { GameSettings } from "./modules/GameUpdater.js";

class ModuleRunner implements PromiseLike<void> {
  #promise: Promise<void>;
  #modules: AppModule[] = [];
  #moduleContext: ModuleContext;

  constructor(moduleContext: ModuleContext) {
    this.#promise = Promise.resolve();
    this.#moduleContext = moduleContext;
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?:
      | ((value: void) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined
  ): PromiseLike<TResult1 | TResult2> {
    return this.#promise.then(onfulfilled, onrejected);
  }

  init(module: AppModule) {
    this.#modules.push(module);

    const p = module.enable(this.#moduleContext);

    // If module supports settings updates, register it
    if (module.onSettingsUpdate) {
      this.#moduleContext.onSettingsChange(
        module.onSettingsUpdate.bind(module)
      );
    }

    if (p instanceof Promise) {
      this.#promise = this.#promise.then(() => p);
    }

    return this;
  }
}

export function createModuleRunner(moduleContext: ModuleContext) {
  return new ModuleRunner(moduleContext);
}
