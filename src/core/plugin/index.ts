import type { PluginManifest } from "./types";
import { childLogger } from "../logger";

const log = childLogger("plugin-registry");

export interface PluginContext {
  registerPlatform: (id: string, adapter: unknown) => void;
  registerAgent: (name: string, factory: () => unknown) => void;
  registerRoute: (mount: string, router: unknown) => void;
}

export interface Plugin {
  manifest: PluginManifest;
  activate: (ctx: PluginContext) => Promise<void> | void;
  deactivate?: () => Promise<void> | void;
}

export class PluginRegistry {
  private plugins = new Map<string, Plugin>();
  private platforms = new Map<string, unknown>();
  private agents = new Map<string, () => unknown>();
  private routes: Array<{ mount: string; router: unknown }> = [];

  async register(plugin: Plugin): Promise<void> {
    const id = plugin.manifest.id;
    if (this.plugins.has(id)) {
      throw new Error(`Plugin already registered: ${id}`);
    }

    const ctx: PluginContext = {
      registerPlatform: (pid, adapter) => {
        this.platforms.set(pid, adapter);
        log.info({ plugin: id, platform: pid }, "platform registered");
      },
      registerAgent: (name, factory) => {
        this.agents.set(name, factory);
        log.info({ plugin: id, agent: name }, "agent registered");
      },
      registerRoute: (mount, router) => {
        this.routes.push({ mount, router });
        log.info({ plugin: id, mount }, "route registered");
      },
    };

    await plugin.activate(ctx);
    this.plugins.set(id, plugin);
    log.info({ plugin: id, version: plugin.manifest.version }, "plugin activated");
  }

  async unregister(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    await plugin.deactivate?.();
    this.plugins.delete(id);
    log.info({ plugin: id }, "plugin deactivated");
  }

  getPlatform<T = unknown>(id: string): T | undefined {
    return this.platforms.get(id) as T | undefined;
  }

  listPlatforms(): string[] {
    return [...this.platforms.keys()];
  }

  listPlugins(): PluginManifest[] {
    return [...this.plugins.values()].map((p) => p.manifest);
  }

  getRoutes(): Array<{ mount: string; router: unknown }> {
    return [...this.routes];
  }

  createAgent(name: string): unknown | undefined {
    return this.agents.get(name)?.();
  }
}

export const pluginRegistry = new PluginRegistry();
