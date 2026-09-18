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
    href: "/posts?category=development",
  },
  {
    title: "生活切片",
    accent: "blue",
    href: "/posts?category=daily-life",
  },
  {
    title: "阅读与灵感",
    accent: "red",
    href: "/posts?category=reading",
  },
] as const;

export default function HomePage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-label="首页封面">
        <Image
          src={nightCourier}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="100vw"
          className={styles.heroImage}
        />
        <div className={styles.heroShade} />
        <div className={styles.heroGrid} aria-hidden="true" />
        <SiteHeader active="home" overlay />
        <h1 className="sr-only">EastherPhil</h1>
      </section>

      <main>
        <section id="notebooks" className={styles.notebooks} aria-label="主题">
          <div className={styles.notebookGrid}>
            {notebooks.map((notebook) => (
              <Link href={notebook.href} className={styles.notebookCard} key={notebook.title}>
                <span className={`${styles.cardAccent} ${styles[notebook.accent]}`} aria-hidden="true" />
                <h2>{notebook.title}</h2>
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
