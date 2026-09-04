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
      readonly PERSONA_PUBLIC_PROFILE_PREFLIGHT?: import("./features/profiles/persona-public-profile/persona-public-profile-preflight.ts").PersonaPublicProfilePreflight;
      readonly PUBLIC_POST_PREFLIGHT?: import("./features/posts/public-post/public-post-preflight.ts").PublicPostPreflight;
      readonly CANONICAL_ASSET_ORIGIN?: string;
      readonly DISABLE_HYDRATION?: boolean;
    }>;
  }

  export function handleRequest(request: Request, options?: SolidSsrHandlerOptions): Promise<Response>;
}
