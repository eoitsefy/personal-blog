export type MediaAsset = {
  id: string;
  url: string;
  originalName: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  refCount: number;
  deletedAt: string | Date | null;
  createdAt: string | Date;
};
