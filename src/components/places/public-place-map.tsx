"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicMapRuntimeConfig } from "@/lib/map/config";
import {
  chunkForAmapConversion,
  findNearestMapPoint,
  getAmapConversionType,
  type PublicMapPoint,
} from "@/lib/map/coordinates";
import type { MapClientEvent } from "@/lib/map/telemetry";
import { fitPublicPoints, focusPublicPoint, getInitialMapPoint, getNeighborhoodMapOptions } from "@/lib/map/viewport";
import styles from "./public-place-map.module.css";

type AMapLngLat = { getLng(): number; getLat(): number };
type AMapMarker = {
  getPosition(): AMapLngLat;
  setContent(content: HTMLElement): void;
  setOffset(offset: unknown): void;
  setPosition(position: [number, number]): void;
  setMap(map: AMapMap | null): void;
};
type AMapMap = {
  addControl(control: unknown): void;
  setFitView(overlays: unknown[], immediately: boolean, avoid: number[], maximumZoom: number): void;
  setZoomAndCenter(zoom: number, center: [number, number], immediately: boolean): void;
  on(event: "complete" | "resize", listener: () => void): void;
  off(event: "complete" | "resize", listener: () => void): void;
  destroy(): void;
};
type AMapCluster = { setMap(map: AMapMap | null): void; setData(points: AMapClusterPoint[]): void };
type AMapNamespace = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMap;
  Scale: new (options?: Record<string, unknown>) => unknown;
  ToolBar: new (options?: Record<string, unknown>) => unknown;
  Pixel: new (x: number, y: number) => unknown;
  Marker: new (options: Record<string, unknown>) => AMapMarker;
  MarkerCluster: new (
    map: AMapMap,
    points: AMapClusterPoint[],
    options: {
      gridSize: number;
      maxZoom: number;
      renderMarker(context: { marker: AMapMarker }): void;
      renderClusterMarker(context: { marker: AMapMarker; count: number }): void;
    },
  ) => AMapCluster;
  convertFrom(
    coordinates: [number, number][],
    source: "gps" | "baidu",
    callback: (status: string, result: { info?: string; locations?: AMapLngLat[] }) => void,
  ): void;
};
type AMapLoader = {
  load(options: { key: string; version: string; plugins: string[] }): Promise<AMapNamespace>;
};
type AMapClusterPoint = PublicMapPoint & { lnglat: [number, number] };

declare global {
  interface Window {
    AMapLoader?: AMapLoader;
    _AMapSecurityConfig?: { serviceHost: string };
  }
}

const LOADER_URL = "https://webapi.amap.com/loader.js";
const LOAD_TIMEOUT_MS = 15_000;

function reportMapEvent(event: MapClientEvent) {
  void fetch("/api/map/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => undefined);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("AMap operation timed out")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function convertBatch(
  AMap: AMapNamespace,
  points: PublicMapPoint[],
  source: "gps" | "baidu",
) {
  return new Promise<AMapClusterPoint[]>((resolve, reject) => {
    AMap.convertFrom(
      points.map((point) => [point.longitude, point.latitude]),
      source,
      (status, result) => {
        if (status !== "complete" || result.info?.toLowerCase() !== "ok" || result.locations?.length !== points.length) {
          reject(new Error("AMap coordinate conversion failed"));
          return;
        }
        resolve(points.map((point, index) => ({
          ...point,
          lnglat: [result.locations![index].getLng(), result.locations![index].getLat()],
        })));
      },
    );
  });
}

async function convertPublicPoints(AMap: AMapNamespace, points: PublicMapPoint[]) {
  const converted: AMapClusterPoint[] = points
    .filter((point) => point.coordinateSystem === "GCJ02")
    .map((point) => ({ ...point, lnglat: [point.longitude, point.latitude] }));
  let omittedCount = 0;

  for (const coordinateSystem of ["WGS84", "BD09"] as const) {
    const source = getAmapConversionType(coordinateSystem);
    const candidates = points.filter((point) => point.coordinateSystem === coordinateSystem);
    if (!source) continue;
    for (const batch of chunkForAmapConversion(candidates)) {
      try {
        converted.push(...await withTimeout(convertBatch(AMap, batch, source), LOAD_TIMEOUT_MS));
      } catch {
        omittedCount += batch.length;
      }
    }
  }
  return { points: converted, omittedCount };
}

function CoordinateFallback({ points, message }: { points: PublicMapPoint[]; message?: string }) {
  const bounds = useMemo(() => {
    const latitudes = points.map((point) => point.latitude);
    const longitudes = points.map((point) => point.longitude);
    return {
      latMin: latitudes.length ? Math.min(...latitudes) - 0.03 : 0,
      latMax: latitudes.length ? Math.max(...latitudes) + 0.03 : 1,
      lngMin: longitudes.length ? Math.min(...longitudes) - 0.03 : 0,
      lngMax: longitudes.length ? Math.max(...longitudes) + 0.03 : 1,
    };
  }, [points]);

  if (points.length === 0) {
    return <div className={styles.emptyPlot}>当前结果没有可绘制的公开坐标；仅地区地点仍列在下方。</div>;
  }

  return <div className={styles.fallbackPlot} aria-label="无需第三方脚本的公开坐标概览">
    {message ? <p className={styles.fallbackNotice}>{message}</p> : null}
    {points.map((point, index) => {
      const left = ((point.longitude - bounds.lngMin) / Math.max(bounds.lngMax - bounds.lngMin, 0.001)) * 100;
      const top = ((bounds.latMax - point.latitude) / Math.max(bounds.latMax - bounds.latMin, 0.001)) * 100;
      return <a
        key={point.id}
        href={`#place-${point.slug}`}
        className={styles.fallbackMarker}
        style={{ left: `${Math.min(82, Math.max(18, left))}%`, top: `${Math.min(78, Math.max(28, top))}%` }}
        aria-label={`${point.name}，${point.locationLabel}`}
      ><i className={point.isFeatured ? styles.featuredFallbackMarker : undefined}>{point.isFeatured ? "★" : index + 1}</i><span>{point.name}</span></a>;
    })}
  </div>;
}

export function PublicPlaceMap({
  points,
  config,
}: {
  points: PublicMapPoint[];
  config: PublicMapRuntimeConfig;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<{ focus(id: string): void; showAll(): void } | null>(null);
  const [selection, setSelection] = useState({ id: getInitialMapPoint(points)?.id ?? "", overview: false });
  const [availableIds, setAvailableIds] = useState<string[]>([]);
  const [loaderReady, setLoaderReady] = useState(false);
  const [state, setState] = useState<"disabled" | "loading" | "ready" | "error">(
    config.enabled && points.length > 0 ? "loading" : "disabled",
  );
  const [omittedCount, setOmittedCount] = useState(0);

  useEffect(() => {
    if (!config.enabled || !loaderReady || !containerRef.current || points.length === 0) return;
    const activeConfig = config;
    let cancelled = false;
    let map: AMapMap | null = null;
    let cluster: AMapCluster | null = null;
    let selectedMarker: AMapMarker | null = null;
    let detachReadyListener: (() => void) | undefined;
    let detachResizeListener: (() => void) | undefined;
    let stage: MapClientEvent["stage"] = "sdk_load";
    const startedAt = performance.now();

    async function initialize() {
      try {
        setState("loading");
        if (!window.AMapLoader || !containerRef.current) throw new Error("AMap loader unavailable");
        window._AMapSecurityConfig = {
          serviceHost: `${window.location.origin}${activeConfig.serviceHostPath}`,
        };
        const AMap = await withTimeout(window.AMapLoader.load({
          key: activeConfig.apiKey,
          version: activeConfig.apiVersion,
          plugins: ["AMap.MarkerCluster", "AMap.Scale", "AMap.ToolBar"],
        }), LOAD_TIMEOUT_MS);
        if (cancelled || !containerRef.current) return;

        stage = "coordinate_conversion";
        const conversion = await convertPublicPoints(AMap, points);
        if (cancelled || !containerRef.current) return;
        setOmittedCount(conversion.omittedCount);
        if (conversion.points.length === 0) throw new Error("No coordinates could be plotted safely");
        const initialId = getInitialMapPoint(points)?.id;
        const initialPoint = conversion.points.find((point) => point.id === initialId)
          ?? getInitialMapPoint(conversion.points)!;
        setAvailableIds(conversion.points.map((point) => point.id));

        stage = "map_create";
        map = new AMap.Map(containerRef.current, getNeighborhoodMapOptions(initialPoint));
        const activeMap = map;
        const mapReady = new Promise<void>((resolve) => {
          const onComplete = () => resolve();
          activeMap.on("complete", onComplete);
          detachReadyListener = () => activeMap.off("complete", onComplete);
        });

        const createMarkerContent = (point: AMapClusterPoint, selected = false) => {
          const element = document.createElement("button");
          element.type = "button";
          element.className = `${styles.mapMarker} ${point.isFeatured ? styles.featuredMapMarker : ""} ${selected ? styles.selectedMapMarker : ""}`;
          element.title = `${point.name} · ${point.locationLabel}`;
          element.setAttribute("aria-label", `${selected ? "当前地点" : "查看周边"}：${point.name}${point.privacy === "APPROXIMATE" ? "（大致位置）" : ""}`);
          const pin = document.createElement("span");
          pin.className = styles.markerPin;
          pin.textContent = point.isFeatured ? "★" : "●";
          pin.setAttribute("aria-hidden", "true");
          const label = document.createElement("span");
          label.className = styles.markerLabel;
          const name = document.createElement("strong");
          name.textContent = point.name;
          label.append(name);
          if (selected || point.isFeatured || point.privacy === "APPROXIMATE") {
            const detail = document.createElement("small");
            detail.textContent = [selected ? "当前地点" : "", point.isFeatured ? "重要地点" : "", point.privacy === "APPROXIMATE" ? "大致位置" : ""].filter(Boolean).join(" · ");
            label.append(detail);
          }
          element.append(pin, label);
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            runtimeRef.current?.focus(point.id);
          });
          return element;
        };

        // A separate selected marker stays visible even when other places cluster.
        selectedMarker = new AMap.Marker({
          map: activeMap,
          position: initialPoint.lnglat,
          content: createMarkerContent(initialPoint, true),
          offset: new AMap.Pixel(-22, -22),
          zIndex: 300,
        });
        const activeMarker = selectedMarker;
        let activePointId = initialPoint.id;
        let overview = false;
        const boundsMarkers = conversion.points.map((point) => new AMap.Marker({ position: point.lnglat }));
        const fitPoints = () => {
          const container = containerRef.current;
          if (!container || cancelled) return;
          fitPublicPoints(activeMap, conversion.points, boundsMarkers, { width: container.clientWidth, height: container.clientHeight });
        };
        const onResize = () => { if (overview) fitPoints(); };
        activeMap.on("resize", onResize);
        detachResizeListener = () => activeMap.off("resize", onResize);
        const focus = (id: string) => {
          const point = conversion.points.find((candidate) => candidate.id === id);
          if (!point) return;
          activePointId = id;
          overview = false;
          activeMarker.setPosition(point.lnglat);
          activeMarker.setContent(createMarkerContent(point, true));
          cluster?.setData(conversion.points.filter((candidate) => candidate.id !== id));
          focusPublicPoint(activeMap, point);
          setSelection({ id, overview: false });
        };
        runtimeRef.current = {
          focus,
          showAll() {
            overview = conversion.points.length > 1;
            fitPoints();
            setSelection((current) => ({ ...current, overview: conversion.points.length > 1 }));
          },
        };
        setSelection({ id: initialPoint.id, overview: false });
        stage = "controls";
        map.addControl(new AMap.Scale());
        map.addControl(new AMap.ToolBar({ position: { right: "18px", top: "18px" } }));
        stage = "marker_cluster";
        cluster = conversion.points.length > 1 ? new AMap.MarkerCluster(map, conversion.points.filter((point) => point.id !== initialPoint.id), {
          gridSize: 64,
          maxZoom: 16,
          renderMarker({ marker }) {
            const position = marker.getPosition();
            const point = findNearestMapPoint(
              conversion.points.filter((candidate) => candidate.id !== activePointId),
              position.getLng(),
              position.getLat(),
            );
            if (!point) return;
            marker.setContent(createMarkerContent(point));
            marker.setOffset(new AMap.Pixel(-18, -18));
          },
          renderClusterMarker({ marker, count }) {
            const element = document.createElement("span");
            element.className = styles.clusterMarker;
            element.textContent = String(count);
            element.setAttribute("aria-label", `${count} 个地点`);
            marker.setContent(element);
            marker.setOffset(new AMap.Pixel(-21, -21));
          },
        }) : null;
        stage = "base_map";
        await withTimeout(mapReady, LOAD_TIMEOUT_MS);
        detachReadyListener?.();
        detachReadyListener = undefined;
        if (cancelled) return;
        setState("ready");
        const durationMs = Math.round(performance.now() - startedAt);
        reportMapEvent({ provider: "amap", kind: "map_ready", pointCount: conversion.points.length, omittedCount: conversion.omittedCount, durationMs });
        if (conversion.omittedCount > 0) {
          reportMapEvent({ provider: "amap", kind: "coordinate_conversion_partial", pointCount: points.length, omittedCount: conversion.omittedCount, durationMs });
        }
      } catch {
        if (cancelled) return;
        runtimeRef.current = null;
        detachReadyListener?.();
        detachReadyListener = undefined;
        detachResizeListener?.();
        detachResizeListener = undefined;
        cluster?.setMap(null);
        selectedMarker?.setMap(null);
        map?.destroy();
        map = null;
        cluster = null;
        selectedMarker = null;
        setState("error");
        reportMapEvent({ provider: "amap", kind: "map_runtime_error", stage, pointCount: points.length, omittedCount: points.length, durationMs: Math.round(performance.now() - startedAt) });
      }
    }

    void initialize();
    return () => {
      cancelled = true;
      runtimeRef.current = null;
      detachReadyListener?.();
      detachResizeListener?.();
      cluster?.setMap(null);
      selectedMarker?.setMap(null);
      map?.destroy();
    };
  }, [config, loaderReady, points]);

  const fallbackMessage = state === "error"
    ? "高德地图当前不可用，已自动切换为本地坐标概览。下方文字目录仍可正常使用。"
    : config.provider === "amap" && config.reason
      ? "高德地图尚未配置完成，当前使用本地坐标概览。"
      : undefined;
  const selectedPoint = points.find((point) => point.id === selection.id);

  return <section className={styles.panel} aria-label="地点地图">
    {state === "ready" ? <div className={styles.toolbar}>
      <label className={styles.placeSelect}><span>地点</span><select value={selection.id} onChange={(event) => runtimeRef.current?.focus(event.target.value)}>
        {points.filter((point) => availableIds.includes(point.id)).map((point) => <option key={point.id} value={point.id}>{point.isFeatured ? "★ " : ""}{point.name}{point.privacy === "APPROXIMATE" ? "（大致位置）" : ""}</option>)}
      </select></label>
      <div className={styles.viewActions}>
        <button type="button" aria-pressed={!selection.overview} onClick={() => runtimeRef.current?.focus(selection.id)}>{selectedPoint?.privacy === "APPROXIMATE" ? "所在区域" : "查看周边"}</button>
        {availableIds.length > 1 ? <button type="button" aria-pressed={selection.overview} onClick={() => runtimeRef.current?.showAll()}>全部地点</button> : null}
        {selectedPoint ? <a href={`#place-${selectedPoint.slug}`}>相关日志 ↗</a> : null}
      </div>
    </div> : null}
    <div className={styles.mapStage}>
      {state !== "ready" ? <CoordinateFallback points={points} message={fallbackMessage} /> : null}
      {config.enabled && points.length > 0 ? <>
        <div
          ref={containerRef}
          className={`${styles.mapCanvas} ${state === "ready" ? styles.mapCanvasReady : ""}`}
          role="region"
          aria-label={`高德地图，显示 ${points.length - omittedCount} 个公开地点`}
          aria-busy={state === "loading"}
          aria-hidden={state !== "ready"}
        />
        <Script
          id="amap-jsapi-loader"
          src={LOADER_URL}
          strategy="lazyOnload"
          onReady={() => {
            setLoaderReady(true);
            reportMapEvent({ provider: "amap", kind: "loader_ready", pointCount: points.length, omittedCount: 0, durationMs: 0 });
          }}
          onError={() => {
            setState("error");
            reportMapEvent({ provider: "amap", kind: "loader_error", pointCount: points.length, omittedCount: points.length, durationMs: 0 });
          }}
        />
      </> : null}
    </div>
    <p className={styles.status} role="status" aria-live="polite">
      {state === "ready" ? `${selection.overview ? "全部地点" : selectedPoint?.name ?? "高德地图"}${!selection.overview && selectedPoint?.privacy === "APPROXIMATE" ? " · 大致位置" : ""}${omittedCount ? `；${omittedCount} 个坐标转换失败，已从地图省略` : ""}` : state === "loading" ? "正在加载高德地图；文字目录可立即使用" : state === "error" ? "高德地图加载失败，已启用本地概览" : "当前使用本地坐标概览"}
    </p>
  </section>;
}
