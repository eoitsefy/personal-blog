import Link from "next/link";
import styles from "./site-shell.module.css";

type SiteHeaderProps = {
  tone?: "dark" | "light";
  active?: "home" | "posts" | "places" | "assistant";
  overlay?: boolean;
};

export function SiteMark() {
  return (
    <span className={styles.mark} aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

export function SiteHeader({ tone = "dark", active, overlay = false }: SiteHeaderProps) {
  return (
    <header className={`${styles.header} ${styles[tone]} ${overlay ? styles.overlay : ""}`}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="EastherPhil 沿途手记首页">
          <SiteMark />
          <span className={styles.brandCopy}>
            <strong>EASTHER / FIELD NOTES</strong>
            <small>个人观察与沿途记录</small>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="主导航">
          <Link href="/" aria-current={active === "home" ? "page" : undefined}>
            首页
          </Link>
          <Link href="/posts" aria-current={active === "posts" ? "page" : undefined}>
            日志
          </Link>
          <Link href="/places" aria-current={active === "places" ? "page" : undefined}>
            地点
          </Link>
          <Link href="/assistant" aria-current={active === "assistant" ? "page" : undefined}>
            助手
          </Link>
          <Link href="/#about">关于</Link>
        </nav>

        <Link href="/admin" className={styles.consoleLink}>
          管理台 <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter({ tone = "light" }: { tone?: "dark" | "light" }) {
  return (
    <footer className={`${styles.footer} ${styles[tone]}`}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <SiteMark />
          <div>
            <strong>EASTHER FIELD JOURNAL</strong>
            <p>把短暂的念头，整理成可以回望的坐标。</p>
          </div>
        </div>
        <div className={styles.footerMeta}>
          <span>ORIGINAL VISUAL SYSTEM / 2026</span>
          <span>BUILT FOR QUIET READING</span>
        </div>
      </div>
    </footer>
  );
}
