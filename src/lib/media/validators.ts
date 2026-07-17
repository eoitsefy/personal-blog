import { z } from "zod";

export const adminAssetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().max(120).default(""),
  kind: z.enum(["ALL", "IMAGE", "AUDIO", "DOCUMENT"]).default("ALL"),
  referenced: z.enum(["ALL", "REFERENCED", "UNUSED"]).default("ALL"),
  deleted: z.enum(["active", "trash"]).default("active"),
});

export const ADMIN_ASSET_PAGE_SIZE = 24;
