import Link from "next/link";
import { FloatingAssistant } from "@/components/assistant/chibi-assistant";
import { ICP_FILING_NUMBER, ICP_FILING_URL } from "@/lib/site";
import { getCurrentUser } from "@/lib/user-auth";
import { identityLinks } from "@/lib/registration-navigation";
import styles from "./site-shell.module.css";

type SiteHeaderProps = {
  tone?: "dark" | "light";
  active?: "home" | "posts" | "places" | "assistant" | "music";
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

export async function SiteHeader({ tone = "dark", active, overlay = false }: SiteHeaderProps) {
  const user = await getCurrentUser();
  const links = identityLinks(user?.role);
  return (
    <header className={`${styles.header} ${styles[tone]} ${overlay ? styles.overlay : ""}`}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="EastherPhil 沿途手记首页">
          <SiteMark />
          <span className={styles.brandCopy}>
            <strong>EASTHERPHIL</strong>
          </span>
        </Link>

        <nav className={`${styles.nav} ${styles.localNav}`} aria-label="主导航">
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
          <Link href="/music" aria-current={active === "music" ? "page" : undefined}>音乐</Link>
        </nav>

        <div className={styles.identityLinks}>{links.map(({ href, label }) => <Link key={href} href={href} className={styles.consoleLink}>{label}</Link>)}</div>
      </div>
    </header>
  );
}

export function SiteFooter({ tone = "light" }: { tone?: "dark" | "light" }) {
  return (
    <><FloatingAssistant /><footer className={`${styles.footer} ${styles[tone]}`}>
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
    </footer></>
  );
}
