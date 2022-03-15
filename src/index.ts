let globalConfig: Required<Configuration> | null = null;

export function config(): Required<Configuration> {
    if (globalConfig) return globalConfig;
    throw new Error("node-ga4 was not initialized! Please, make sure to call initGoogleAnalytics() before any other functions.");
}

export interface Configuration {
    measurementId: string;
    baseUrl: string;
    retrieveCookie(userId: string): Promise<string>;
    storeCookie(userId: string, value: string): Promise<void>;
    sessionIdleTime?: number;
    titlesMap?: Record<string, string> | null;
    crmIdPropertyName?: string | null;
    ignoreIds?: string[];
}

export function initGoogleAnalytics(config: Configuration): void {
    const defaultOptions: Partial<Configuration> = {
        sessionIdleTime: 10000,
        titlesMap: null,
        crmIdPropertyName: "crm_id",
        ignoreIds: [],
    };

    globalConfig = { ...defaultOptions, ...config } as Required<Configuration>;
}

