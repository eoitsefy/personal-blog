import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site/site-shell";
import { absoluteUrl } from "@/lib/site";
import nightCourier from "../../public/images/journal/night-courier.png";
import styles from "./home.module.css";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": absoluteUrl("/feed.xml") },
  },
};

const notebooks = [
  {
    title: "技术随记",
    accent: "amber",
  },
  {
    title: "生活切片",
    accent: "blue",
  },
  {
    title: "阅读与灵感",
    accent: "red",
  },
] as const;

export default function HomePage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <Image
          src={nightCourier}
          alt="雨夜中的移动城市与驻足远望的原创信使"
          fill
          priority
          placeholder="blur"
          sizes="100vw"
          className={styles.heroImage}
        />
        <div className={styles.heroShade} />
        <div className={styles.heroGrid} aria-hidden="true" />
        <SiteHeader active="home" overlay />

        <div className={styles.heroContent}>
          <div className={styles.heroCopy}>
            <h1 id="hero-title">
              记录沿途，
              <br />
              <em>保存此刻。</em>
            </h1>
            <div className={styles.heroActions}>
              <Link href="/posts" className={styles.primaryAction}>
                阅读日志 <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <main>
        <section id="notebooks" className={styles.notebooks} aria-labelledby="notebooks-title">
          <div className={styles.sectionHeading}>
            <h2 id="notebooks-title">分类</h2>
          </div>

          <div className={styles.notebookGrid}>
            {notebooks.map((notebook) => (
              <Link href="/posts" className={styles.notebookCard} key={notebook.title}>
                <span className={`${styles.cardAccent} ${styles[notebook.accent]}`} aria-hidden="true" />
                <h3>{notebook.title}</h3>
                <span className={styles.cardArrow} aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        </section>

      </main>

      <SiteFooter tone="dark" />
    </div>
  );
}
