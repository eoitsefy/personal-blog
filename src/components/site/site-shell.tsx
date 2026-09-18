import Link from "next/link";
import { ICP_FILING_NUMBER, ICP_FILING_URL } from "@/lib/site";
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
            <strong>EASTHERPHIL</strong>
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
            <strong>EASTHERPHIL</strong>
          </div>
        </div>
        <div className={styles.footerMeta}>
          <a
            className={styles.filingLink}
            href={ICP_FILING_URL}
            aria-label={`${ICP_FILING_NUMBER}，前往工业和信息化部政务服务平台`}
          >
            {ICP_FILING_NUMBER}
          </a>
        </div>
      </div>
    </footer>
  );
}
