export type MediaAsset = {
  id: string;
  url: string;
  originalName: string | null;
  kind: "IMAGE" | "AUDIO" | "DOCUMENT" | "VIDEO" | "OTHER";
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  refCount: number;
  deletedAt: string | Date | null;
  createdAt: string | Date;
};
