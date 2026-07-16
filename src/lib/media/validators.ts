import { z } from "zod";

export const adminAssetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  deleted: z.enum(["active", "trash"]).default("active"),
});

export const ADMIN_ASSET_PAGE_SIZE = 24;
