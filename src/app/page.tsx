import Image from "next/image";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/site-shell";
import styles from "./home.module.css";

const notebooks = [
  {
    code: "01 / BUILD",
    title: "技术随记",
    description: "把开发过程中的判断、踩坑与解决方案整理成可复用的记录。",
    accent: "amber",
  },
  {
    code: "02 / DAILY",
    title: "生活切片",
    description: "收集旅途、天气、相遇与平常日子里那些值得停留的片刻。",
    accent: "blue",
  },
  {
    code: "03 / INPUT",
    title: "阅读与灵感",
    description: "关于书、游戏、影像和忽然出现的念头，也关于它们留下的回声。",
    accent: "red",
  },
] as const;

export default function HomePage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <Image
          src="/images/journal/night-courier.png"
          alt="雨夜中的移动城市与驻足远望的原创信使"
          fill
          priority
          sizes="100vw"
          className={styles.heroImage}
        />
        <div className={styles.heroShade} />
        <div className={styles.heroGrid} aria-hidden="true" />
        <SiteHeader active="home" overlay />

        <div className={styles.heroContent}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <span>FIELD JOURNAL</span>
              <span>CN / 026</span>
            </div>
            <h1 id="hero-title">
              记录沿途，
              <br />
              <em>保存此刻。</em>
            </h1>
            <p>
              这里存放技术、阅读与日常生活的个人记录。
              <br />
              不追逐结论，只为给不断向前的日子留下坐标。
            </p>
            <div className={styles.heroActions}>
              <Link href="/posts" className={styles.primaryAction}>
                进入日志索引 <span aria-hidden="true">→</span>
              </Link>
              <a href="#notebooks" className={styles.secondaryAction}>
                查看记录分类
              </a>
            </div>
          </div>

          <aside className={styles.coordinateCard} aria-label="日志信息">
            <span className={styles.coordinateIndex}>EP / 01</span>
            <div>
              <small>CURRENT POSITION</small>
              <strong>31°13′N / 121°28′E</strong>
            </div>
            <div>
              <small>ARCHIVE STATUS</small>
              <strong><i /> ONLINE</strong>
            </div>
          </aside>
        </div>

        <a className={styles.scrollHint} href="#notebooks">
          <span>SCROLL TO EXPLORE</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <main>
        <section id="notebooks" className={styles.notebooks} aria-labelledby="notebooks-title">
          <div className={styles.sectionHeading}>
            <div>
              <span>ARCHIVE / NOTEBOOKS</span>
              <h2 id="notebooks-title">三种记录，一条持续延伸的路线</h2>
            </div>
            <p>没有固定更新频率。每一篇都来自真实经历，也允许保留未完成的思考。</p>
          </div>

          <div className={styles.notebookGrid}>
            {notebooks.map((notebook, index) => (
              <Link href="/posts" className={styles.notebookCard} key={notebook.code}>
                <span className={`${styles.cardAccent} ${styles[notebook.accent]}`} aria-hidden="true" />
                <div className={styles.cardTopline}>
                  <span>{notebook.code}</span>
                  <span>0{index + 1}</span>
                </div>
                <h3>{notebook.title}</h3>
                <p>{notebook.description}</p>
                <span className={styles.cardArrow} aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        </section>

        <section id="about" className={styles.about} aria-labelledby="about-title">
          <div className={styles.aboutLabel}>
            <span>ABOUT THIS PLACE</span>
            <b>FIELD NOTE / 00</b>
          </div>
          <div className={styles.aboutCopy}>
            <h2 id="about-title">一座只为自己保留的私人档案室。</h2>
            <p>
              我是 EastherPhil。这个博客用来记录开发中的实践、生活里的观察，
              以及那些暂时找不到归类位置的想法。它不需要成为知识库，也不必时刻保持完整；
              能够诚实、清楚地保存当时的我，就已经足够。
            </p>
            <Link href="/posts">
              从最近的记录开始阅读 <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className={styles.aboutGraphic} aria-hidden="true">
            <span>EP</span>
            <i />
            <b>026</b>
          </div>
        </section>
      </main>

      <SiteFooter tone="dark" />
    </div>
  );
}
