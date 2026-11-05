"use client";
import Image from "next/image";
import styles from "./music-record.module.css";

export function MusicRecord({ playing, coverUrl, compact = false }: { playing: boolean; coverUrl?: string; compact?: boolean }) {
  return <div className={`${styles.scene} ${compact ? styles.compact : ""}`} aria-hidden="true">
    <div className={`${styles.record} ${playing ? styles.spinning : ""}`}>
      <div className={styles.label}>{coverUrl ? <Image src={coverUrl} alt="" width={88} height={88} unoptimized /> : <><span>EASTHERPHIL</span><strong>E /</strong><small>ALONG THE WAY</small></>}</div>
    </div>
    {!compact && <div className={`${styles.arm} ${playing ? styles.engaged : ""}`} />}
  </div>;
}
