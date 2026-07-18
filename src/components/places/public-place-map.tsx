"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicMapRuntimeConfig } from "@/lib/map/config";
import {
  chunkForAmapConversion,
  getAmapConversionType,
  type PublicMapPoint,
} from "@/lib/map/coordinates";
import type { MapClientEvent } from "@/lib/map/telemetry";
import styles from "./public-place-map.module.css";

type AMapLngLat = { getLng(): number; getLat(): number };
type AMapMarker = {
  setContent(content: HTMLElement): void;
  setOffset(offset: unknown): void;
  on(event: "click", listener: () => void): void;
};
type AMapMap = {
  addControl(control: unknown): void;
  setFitView(overlays?: unknown, immediately?: boolean, avoid?: number[], maximumZoom?: number): void;
  destroy(): void;
};
type AMapCluster = { setMap(map: AMapMap | null): void };
type AMapNamespace = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMap;
  Scale: new (options?: Record<string, unknown>) => unknown;
  ToolBar: new (options?: Record<string, unknown>) => unknown;
  Pixel: new (x: number, y: number) => unknown;
  MarkerCluster: new (
    map: AMapMap,
    points: AMapClusterPoint[],
    options: {
      gridSize: number;
      renderMarker(context: { marker: AMapMarker; data: AMapClusterPoint[] }): void;
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("AMap loader timed out")), timeoutMs);
    }),
  ]);
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
        converted.push(...await convertBatch(AMap, batch, source));
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
        style={{ left: `${Math.min(96, Math.max(4, left))}%`, top: `${Math.min(92, Math.max(8, top))}%` }}
        aria-label={`${point.name}，${point.locationLabel}`}
      ><i>{index + 1}</i><span>{point.name}</span></a>;
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
    const startedAt = performance.now();

    async function initialize() {
      try {
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

        const conversion = await convertPublicPoints(AMap, points);
        if (cancelled || !containerRef.current) return;
        setOmittedCount(conversion.omittedCount);
        if (conversion.points.length === 0) throw new Error("No coordinates could be plotted safely");

        map = new AMap.Map(containerRef.current, {
          viewMode: "2D",
          zoom: 5,
          mapStyle: "amap://styles/whitesmoke",
          showLabel: true,
        });
        map.addControl(new AMap.Scale());
        map.addControl(new AMap.ToolBar({ position: { right: "18px", top: "18px" } }));
        cluster = new AMap.MarkerCluster(map, conversion.points, {
          gridSize: 64,
          renderMarker({ marker, data }) {
            const point = data[0];
            const element = document.createElement("button");
            element.type = "button";
            element.className = styles.mapMarker;
            element.textContent = point.name.slice(0, 1);
            element.title = `${point.name} · ${point.locationLabel}`;
            marker.setContent(element);
            marker.setOffset(new AMap.Pixel(-17, -17));
            const navigateToCard = () => {
              document.getElementById(`place-${point.slug}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              window.history.replaceState(null, "", `#place-${point.slug}`);
            };
            element.addEventListener("click", navigateToCard);
            marker.on("click", navigateToCard);
          },
          renderClusterMarker({ marker, count }) {
            const element = document.createElement("span");
            element.className = styles.clusterMarker;
            element.textContent = String(count);
            element.setAttribute("aria-label", `${count} 个地点`);
            marker.setContent(element);
            marker.setOffset(new AMap.Pixel(-21, -21));
          },
        });
        map.setFitView(undefined, false, [72, 72, 72, 72], 13);
        setState("ready");
        const durationMs = Math.round(performance.now() - startedAt);
        reportMapEvent({ provider: "amap", kind: "map_ready", pointCount: conversion.points.length, omittedCount: conversion.omittedCount, durationMs });
        if (conversion.omittedCount > 0) {
          reportMapEvent({ provider: "amap", kind: "coordinate_conversion_partial", pointCount: points.length, omittedCount: conversion.omittedCount, durationMs });
        }
      } catch {
        if (cancelled) return;
        setState("error");
        reportMapEvent({ provider: "amap", kind: "map_runtime_error", pointCount: points.length, omittedCount: points.length, durationMs: Math.round(performance.now() - startedAt) });
      }
    }

    void initialize();
    return () => {
      cancelled = true;
      cluster?.setMap(null);
      map?.destroy();
    };
  }, [config, loaderReady, points]);

  const fallbackMessage = state === "error"
    ? "高德地图当前不可用，已自动切换为本地坐标概览。下方文字目录仍可正常使用。"
    : config.provider === "amap" && config.reason
      ? "高德地图尚未配置完成，当前使用本地坐标概览。"
      : undefined;

  return <section className={styles.panel} aria-labelledby="public-map-heading">
    <div className={styles.heading}>
      <div><p>AMAP / PRIVACY-SAFE ADAPTER</p><h2 id="public-map-heading">公开地点地图</h2></div>
      <span>仅把公开精度坐标发送给高德地图。隐藏地点、内部坐标、草稿和回收站内容不会进入浏览器地图。</span>
    </div>
    <div className={styles.mapStage}>
      {state !== "ready" ? <CoordinateFallback points={points} message={fallbackMessage} /> : null}
      {config.enabled && points.length > 0 ? <>
        <div
          ref={containerRef}
          className={`${styles.mapCanvas} ${state === "ready" ? styles.mapCanvasReady : ""}`}
          role="region"
          aria-label={`高德地图，显示 ${points.length - omittedCount} 个公开地点`}
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
      {state === "ready" ? `高德地图已加载${omittedCount ? `；${omittedCount} 个坐标转换失败，已从地图省略` : ""}` : state === "loading" ? "正在加载高德地图；文字目录可立即使用" : state === "error" ? "高德地图加载失败，已启用本地概览" : "当前使用本地坐标概览"}
    </p>
  </section>;
}
