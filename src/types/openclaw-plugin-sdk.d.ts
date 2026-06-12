declare module "openclaw/plugin-sdk" {
  export interface PluginRuntime {
    config: {
      loadConfig(): Record<string, any>;
      [key: string]: any;
    };
    channel: {
      reply: {
        finalizeInboundContext(input: Record<string, unknown>): unknown;
        dispatchReplyWithBufferedBlockDispatcher(input: Record<string, unknown>): Promise<void>;
      };
      media: {
        saveMediaBuffer(
          buffer: Buffer,
          mimeType: string,
          arg3?: unknown,
          arg4?: unknown,
          fileName?: string,
        ): Promise<{ path: string }>;
      };
    };
    system: {
      enqueueSystemEvent(event: Record<string, unknown>): void;
      runCommandWithTimeout(command: string, args: string[], options: Record<string, unknown>): Promise<unknown>;
    };
  }

  export interface OpenClawPluginApi {
    runtime: PluginRuntime;
    pluginConfig?: Record<string, unknown>;
    on(hookName: string, handler: (...args: any[]) => unknown): void;
    registerChannel(channel: unknown): void;
    registerTool(tool: unknown): void;
    registerService(service: unknown): void;
  }

  export type OpenClawPluginToolFactory = unknown;

  export function createPluginRuntimeStore<T>(message: string): {
    setRuntime(runtime: T): void;
    getRuntime(): T;
  };
}

declare module "openclaw/plugin-sdk/core" {
  export interface ChannelPlugin<TAccount = unknown> {
    id: string;
    meta: Record<string, unknown>;
    capabilities: Record<string, unknown>;
    reload?: Record<string, unknown>;
    config: Record<string, unknown>;
    outbound?: unknown;
    messaging?: unknown;
    gateway: {
      startAccount(ctx: unknown): Promise<void>;
      stopAccount(ctx?: unknown): Promise<void>;
    };
    agentPrompt?: Record<string, unknown>;
  }
}
