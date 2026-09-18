"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { PublicMapRuntimeConfig } from "@/lib/map/config";

type LngLat = { getLng(): number; getLat(): number };
type NearbyPoi = {
  id: string;
  name: string;
  address: string;
  district: string;
  type: string;
  location: LngLat;
};
type PlaceSearchResult = {
  info?: string;
  poiList?: { pois?: NearbyPoi[] };
};
type ReGeocodeResult = {
  info?: string;
  regeocode?: {
    formattedAddress?: string;
    addressComponent?: { province?: string; city?: string | string[]; district?: string };
  };
};
type AMapMarker = {
  setPosition(position: [number, number]): void;
};
type AMapMap = {
  add(overlay: unknown): void;
  destroy(): void;
  on(event: "click", listener: (event: { lnglat: LngLat }) => void): void;
  setCenter(center: [number, number]): void;
  setZoom(zoom: number): void;
};
type PlaceSearch = {
  searchNearBy(
    keyword: string,
    center: [number, number],
    radius: number,
    callback: (status: string, result: PlaceSearchResult | string) => void,
  ): void;
};
type Geocoder = {
  getAddress(
    position: [number, number],
    callback: (status: string, result: ReGeocodeResult | string) => void,
  ): void;
};
type AMapNamespace = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMap;
  Marker: new (options: Record<string, unknown>) => AMapMarker;
  PlaceSearch: new (options: Record<string, unknown>) => PlaceSearch;
  Geocoder: new (options?: Record<string, unknown>) => Geocoder;
};
type AMapLoader = {
  load(options: { key: string; version: string; plugins: string[] }): Promise<AMapNamespace>;
};

export type PickedPlace = {
  name?: string;
  locationLabel?: string;
  latitude: number;
  longitude: number;
  coordinateSystem: "GCJ02";
  coordinateSource: string;
};

const LOADER_URL = "https://webapi.amap.com/loader.js";
function districtLabel(component?: { province?: string; city?: string | string[]; district?: string }) {
  if (!component) return "";
  const city = Array.isArray(component.city) ? component.city[0] : component.city;
  return [component.province, city, component.district].filter(Boolean).join("");
}

export function PlacePicker({
  config,
  latitude,
  longitude,
  onPick,
}: {
  config: PublicMapRuntimeConfig;
  latitude: number;
  longitude: number;
  onPick(value: PickedPlace): void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<{ map: AMapMap; marker: AMapMarker; search: PlaceSearch; geocoder: Geocoder } | null>(null);
  const centerRef = useRef<[number, number]>(latitude !== 0 || longitude !== 0 ? [longitude, latitude] : [116.397428, 39.90923]);
  const onPickRef = useRef(onPick);
  const [loaderReady, setLoaderReady] = useState(false);
  const [status, setStatus] = useState(config.enabled ? "正在加载地图…" : "地图选点暂不可用，请手工填写坐标。");
  const [keyword, setKeyword] = useState("");
  const [nearby, setNearby] = useState<NearbyPoi[]>([]);
  const [searching, setSearching] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  function searchNearby(position: [number, number], requestedKeyword = keyword) {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setSearching(true);
    setStatus("正在查询周边地点…");
    runtime.search.searchNearBy(
      requestedKeyword.trim(),
      position,
      3000,
      (resultStatus, result) => {
        setSearching(false);
        if (resultStatus !== "complete" || typeof result === "string" || result.info?.toLowerCase() !== "ok") {
          setNearby([]);
          setStatus("周边地点查询失败，可调整关键词后重试。");
          return;
        }
        const pois = (result.poiList?.pois ?? []).filter((poi) => poi.location).slice(0, 12);
        setNearby(pois);
        setStatus(pois.length ? `找到 ${pois.length} 个周边地点` : "附近未找到匹配地点");
      },
    );
  }

  function selectCoordinate(position: [number, number]) {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.marker.setPosition(position);
    centerRef.current = position;
    runtime.map.setCenter(position);
    runtime.geocoder.getAddress(position, (resultStatus, result) => {
      const locationLabel = resultStatus === "complete" && typeof result !== "string" && result.info?.toLowerCase() === "ok"
        ? districtLabel(result.regeocode?.addressComponent)
        : undefined;
      onPickRef.current({
        latitude: position[1],
        longitude: position[0],
        coordinateSystem: "GCJ02",
        coordinateSource: "高德地图选点",
        ...(locationLabel ? { locationLabel } : {}),
      });
    });
    searchNearby(position);
  }

  useEffect(() => {
    if (!config.enabled || !loaderReady || !containerRef.current) return;
    const activeConfig = config;
    let cancelled = false;
    let map: AMapMap | null = null;

    async function initialize() {
      try {
        const browserWindow = window as unknown as {
          AMapLoader?: AMapLoader;
          _AMapSecurityConfig?: { serviceHost: string };
        };
        if (!browserWindow.AMapLoader || !containerRef.current) throw new Error("loader unavailable");
        browserWindow._AMapSecurityConfig = { serviceHost: `${window.location.origin}${activeConfig.serviceHostPath}` };
        const AMap = await browserWindow.AMapLoader.load({
          key: activeConfig.apiKey,
          version: activeConfig.apiVersion,
          plugins: ["AMap.PlaceSearch", "AMap.Geocoder"],
        });
        if (cancelled || !containerRef.current) return;
        const hasInitialPosition = latitude !== 0 || longitude !== 0;
        const initialPosition = centerRef.current;
        map = new AMap.Map(containerRef.current, {
          viewMode: "2D",
          zoom: hasInitialPosition ? 15 : 11,
          center: initialPosition,
          mapStyle: "amap://styles/whitesmoke",
        });
        const marker = new AMap.Marker({ position: initialPosition });
        map.add(marker);
        runtimeRef.current = {
          map,
          marker,
          search: new AMap.PlaceSearch({
            pageSize: 20,
            extensions: "base",
            type: "风景名胜|餐饮服务|交通设施服务|科教文化服务|生活服务|购物服务",
          }),
          geocoder: new AMap.Geocoder(),
        };
        setMapReady(true);
        map.on("click", (event) => selectCoordinate([event.lnglat.getLng(), event.lnglat.getLat()]));
        setStatus(hasInitialPosition ? "可点击地图调整位置并查看周边地点" : "请点击地图选择位置");
        if (hasInitialPosition) searchNearby(initialPosition, "");
      } catch {
        setStatus("地图加载失败，请手工填写坐标。");
      }
    }

    void initialize();
    return () => {
      cancelled = true;
      setMapReady(false);
      runtimeRef.current = null;
      map?.destroy();
    };
    // The picker initializes once per runtime configuration. Form coordinate changes are
    // applied through the picker itself and must not recreate the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, loaderReady]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || (latitude === 0 && longitude === 0)) return;
    const position: [number, number] = [longitude, latitude];
    centerRef.current = position;
    runtime.marker.setPosition(position);
    runtime.map.setCenter(position);
  }, [latitude, longitude]);

  function choosePoi(poi: NearbyPoi) {
    const position: [number, number] = [poi.location.getLng(), poi.location.getLat()];
    centerRef.current = position;
    runtimeRef.current?.marker.setPosition(position);
    runtimeRef.current?.map.setCenter(position);
    runtimeRef.current?.map.setZoom(17);
    onPickRef.current({
      name: poi.name,
      locationLabel: poi.district || poi.address || poi.name,
      latitude: position[1],
      longitude: position[0],
      coordinateSystem: "GCJ02",
      coordinateSource: poi.id ? `高德地图 POI ${poi.id}` : "高德地图 POI",
    });
    setStatus(`已选择：${poi.name}`);
  }

  function handleNearbySearch() {
    searchNearby(centerRef.current);
  }

  return <section className="grid gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-700" aria-label="地图选点与周边地点">
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-56 flex-1 gap-1 text-sm">
        <span>周边地点关键词</span>
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="例如：咖啡、车站、公园" className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950" />
      </label>
      <button type="button" disabled={!mapReady || searching} onClick={handleNearbySearch} className="rounded-lg border border-neutral-400 px-4 py-2 text-sm disabled:opacity-50">
        {searching ? "查询中…" : "查询周边"}
      </button>
    </div>
    <div ref={containerRef} className="h-80 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800" />
    {config.enabled ? <Script id="admin-amap-jsapi-loader" src={LOADER_URL} strategy="lazyOnload" onReady={() => setLoaderReady(true)} onError={() => setStatus("地图脚本加载失败，请手工填写坐标。")} /> : null}
    <p className="text-sm text-neutral-500" role="status" aria-live="polite">{status}</p>
    {nearby.length ? <ul className="grid max-h-64 gap-2 overflow-y-auto md:grid-cols-2" aria-label="周边地点列表">
      {nearby.map((poi) => <li key={poi.id || `${poi.name}-${poi.location.getLng()}-${poi.location.getLat()}`}>
        <button type="button" onClick={() => choosePoi(poi)} className="w-full rounded-lg border border-neutral-200 p-3 text-left hover:border-amber-500 dark:border-neutral-700">
          <strong className="block text-sm">{poi.name}</strong>
          <span className="mt-1 block text-xs text-neutral-500">{poi.address || poi.district || poi.type}</span>
        </button>
      </li>)}
    </ul> : null}
  </section>;
}
