export type H3ResourceSize = "desktop" | "mobile";
export type H3DeviceHints = { smallScreen: boolean; coarsePointer: boolean; saveData: boolean };

export function selectH3Resource(hints: H3DeviceHints): H3ResourceSize {
  return hints.smallScreen || hints.coarsePointer || hints.saveData ? "mobile" : "desktop";
}
type Connection = EventTarget & { saveData?: boolean };
function connection(): Connection | undefined {
  return (navigator as Navigator & { connection?: Connection }).connection;
}
/** The server and first hydration pass always agree. Browser hints are only
 * read by the external-store client snapshot after hydration. */
export const getH3ServerResourceSnapshot = (): H3ResourceSize => "desktop";
export function getH3ResourceSnapshot(): H3ResourceSize {
  if (typeof window === "undefined") return getH3ServerResourceSnapshot();
  return selectH3Resource({ smallScreen: window.matchMedia("(max-width: 767px)").matches,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches, saveData: connection()?.saveData === true });
}
export function subscribeH3Resource(callback: () => void): () => void {
  const small = window.matchMedia("(max-width: 767px)"), coarse = window.matchMedia("(pointer: coarse)"), network = connection();
  small.addEventListener("change", callback); coarse.addEventListener("change", callback); network?.addEventListener("change", callback);
  return () => { small.removeEventListener("change", callback); coarse.removeEventListener("change", callback); network?.removeEventListener("change", callback); };
}
