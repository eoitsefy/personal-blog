export const AMAP_API_VERSION = "2.0";
export const AMAP_SERVICE_HOST_PATH = "/_AMapService";

type MapEnvironment = {
  [key: string]: string | undefined;
  MAP_PROVIDER?: string;
  AMAP_JS_API_KEY?: string;
};

export type PublicMapRuntimeConfig =
  | {
      enabled: true;
      provider: "amap";
      apiKey: string;
      apiVersion: typeof AMAP_API_VERSION;
      serviceHostPath: typeof AMAP_SERVICE_HOST_PATH;
      reason: null;
    }
  | {
      enabled: false;
      provider: "none" | "amap";
      apiKey: null;
      apiVersion: typeof AMAP_API_VERSION;
      serviceHostPath: typeof AMAP_SERVICE_HOST_PATH;
      reason: "provider_disabled" | "missing_key" | "invalid_key";
    };

const AMAP_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function getPublicMapRuntimeConfig(
  environment: MapEnvironment = process.env,
): PublicMapRuntimeConfig {
  const provider = environment.MAP_PROVIDER?.trim().toLowerCase();
  if (provider !== "amap") {
    return {
      enabled: false,
      provider: "none",
      apiKey: null,
      apiVersion: AMAP_API_VERSION,
      serviceHostPath: AMAP_SERVICE_HOST_PATH,
      reason: "provider_disabled",
    };
  }

  const apiKey = environment.AMAP_JS_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return {
      enabled: false,
      provider: "amap",
      apiKey: null,
      apiVersion: AMAP_API_VERSION,
      serviceHostPath: AMAP_SERVICE_HOST_PATH,
      reason: "missing_key",
    };
  }
  if (!AMAP_KEY_PATTERN.test(apiKey)) {
    return {
      enabled: false,
      provider: "amap",
      apiKey: null,
      apiVersion: AMAP_API_VERSION,
      serviceHostPath: AMAP_SERVICE_HOST_PATH,
      reason: "invalid_key",
    };
  }

  return {
    enabled: true,
    provider: "amap",
    apiKey,
    apiVersion: AMAP_API_VERSION,
    serviceHostPath: AMAP_SERVICE_HOST_PATH,
    reason: null,
  };
}

export function getMapHealthSummary(environment: MapEnvironment = process.env) {
  const config = getPublicMapRuntimeConfig(environment);
  return { provider: config.provider, enabled: config.enabled, reason: config.reason };
}
