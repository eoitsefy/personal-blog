import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PublicPlaceMap } from "@/components/places/public-place-map";
import { SiteFooter, SiteHeader } from "@/components/site/site-shell";
import { getPublicMapRuntimeConfig } from "@/lib/map/config";
import type { PublicMapPoint } from "@/lib/map/coordinates";
import { publicPlaceSelect, publicPlaceWhere, serializePublicPlace } from "@/lib/places";
import { prisma } from "@/lib/prisma";
import { isUiPreviewEnabled } from "@/lib/ui-preview";
import styles from "./places.module.css";

export const metadata: Metadata = {
  title: "地点档案",
  description: "沿途手记中公开分享的地点、时间与关联日志。敏感位置会降低精度或完全隐藏。",
  alternates: { canonical: "/places" },
};
export const revalidate = 60;
type PageProps = { searchParams: Promise<{ q?: string | string[] }> };

export default async function PlacesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim().slice(0, 80) ?? "";
  const records = isUiPreviewEnabled() ? [] : await prisma.place.findMany({
    where: {
      ...publicPlaceWhere,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { locationLabel: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    select: {
      ...publicPlaceSelect,
      posts: { where: { post: { status: "PUBLISHED", deletedAt: null } }, orderBy: { post: { publishedAt: "desc" } }, select: { post: { select: { slug: true, title: true, publishedAt: true } } } },
    },
  });
  const places = records.flatMap((record) => {
    const place = serializePublicPlace(record);
    return place ? [{ ...place, posts: record.posts.map(({ post }) => post) }] : [];
  });
  const mapPoints = places.flatMap((place): PublicMapPoint[] => place.coordinates ? [{
    id: place.id,
    slug: place.slug,
    name: place.name,
    locationLabel: place.locationLabel,
    privacy: place.privacy as "EXACT" | "APPROXIMATE",
    coordinateSystem: place.coordinateSystem,
    latitude: place.coordinates.latitude,
    longitude: place.coordinates.longitude,
  }] : []);
  const mapConfig = getPublicMapRuntimeConfig();

  return <div className={styles.page}>
    <SiteHeader tone="light" active="places" />
    <main id="main-content">
      <header className={styles.hero}><div><p>PLACE ARCHIVE / PRIVACY SAFE</p><h1>沿途坐标</h1><span>地图只使用地点的公开精度。隐藏地点、草稿与回收站文章不会进入此页面。</span></div><b>{String(places.length).padStart(2, "0")}</b></header>
      <section className={styles.workspace}>
        <form action="/places" className={styles.search}><label><span>搜索地点或地区</span><input type="search" name="q" defaultValue={q} maxLength={80} placeholder="例如：杭州、展览、散步" /></label><button>检索</button>{q ? <Link href="/places">清除</Link> : null}</form>

        <PublicPlaceMap points={mapPoints} config={mapConfig} />

        <section className={styles.listSection} aria-labelledby="place-list-heading"><div className={styles.listHeading}><p>ACCESSIBLE TEXT INDEX</p><h2 id="place-list-heading">地点与关联日志</h2></div>
          {places.length === 0 ? <p className={styles.empty}>暂无符合条件的公开地点。</p> : <ol className={styles.placeList}>{places.map((place, index) => <li key={place.id} id={`place-${place.slug}`} className={styles.placeCard}>
            {place.cover ? <div className={styles.cover}><Image src={place.cover.url} alt={place.cover.alt} fill sizes="(max-width: 760px) 100vw, 32vw" className={styles.coverImage} unoptimized /></div> : <div className={styles.coverFallback} aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span></div>}
            <div className={styles.placeBody}><div className={styles.placeMeta}><span>{place.locationLabel}</span><span>{place.privacy === "EXACT" ? "精确公开" : place.privacy === "APPROXIMATE" ? "模糊坐标" : "仅地区"}</span>{place.occurredAt ? <time dateTime={place.occurredAt.toISOString()}>{place.occurredAt.toLocaleDateString("zh-CN")}</time> : null}</div><h3>{place.name}</h3>{place.summary ? <p>{place.summary}</p> : null}<div className={styles.postLinks}>{place.posts.map((post) => <Link key={post.slug} href={`/posts/${post.slug}`}>{post.title} <span>↗</span></Link>)}</div></div>
          </li>)}</ol>}
        </section>
      </section>
    </main>
    <SiteFooter />
  </div>;
}
