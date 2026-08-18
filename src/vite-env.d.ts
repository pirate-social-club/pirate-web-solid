/// <reference types="vite/client" />
/// <reference types="filesystem-routing/types" />

declare module "virtual:solid-manifest" {
  const manifest: import("@solidjs/web").AssetManifest;
  export default manifest;
}

declare module "virtual:solid-ssr-handler" {
  export interface SolidSsrHandlerOptions {
    readonly context?: Readonly<{
      readonly API_NEXT_ORIGIN?: string;
    }>;
  }

  export function handleRequest(request: Request, options?: SolidSsrHandlerOptions): Promise<Response>;
}
