export function MusicIcon({ name }: { name: "play" | "pause" | "next" | "previous" | "close" | "music" | "effects" | "queue" | "collapse" }) {
  const paths = {
    play: "m9 5 11 7-11 7Z", pause: "M8 5v14M16 5v14", next: "m5 5 10 7-10 7ZM19 5v14", previous: "m19 5-10 7 10 7ZM5 5v14",
    close: "m6 6 12 12M18 6 6 18", music: "M9 18V5l12-2v12M9 9l12-2M9 18c0 2-6 4-6 1s6-4 6-1Zm12-3c0 2-6 4-6 1s6-4 6-1Z",
    effects: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4", queue: "M3 6h14M3 11h10M3 16h8M17 10v9c0 2-5 3-5 1s5-4 5-1Zm0 0 4 1", collapse: "M5 12h14",
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "pause" ? 3.5 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
