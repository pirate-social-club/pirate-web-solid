export function websiteBuildMode(environment: Readonly<Record<string, string | undefined>>): boolean;
export function websiteProductionOverrides(config: unknown, environment: string | undefined): { vars: Record<string, string> };
export function checkWebsiteProductionConfig(source: unknown, built: unknown): { kind: string; worker: string; account: string; hns_enabled: false };
