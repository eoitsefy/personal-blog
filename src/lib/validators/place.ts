import { z } from "zod";

const coordinate = (minimum: number, maximum: number, label: string) =>
  z.coerce.number().finite().min(minimum, `${label}不能小于 ${minimum}`).max(maximum, `${label}不能大于 ${maximum}`);

const optionalCoordinate = (minimum: number, maximum: number, label: string) =>
  z.union([z.literal(""), z.null(), coordinate(minimum, maximum, label)]).optional();

const placeFields = z.object({
  name: z.string().trim().min(1, "地点名称不能为空").max(100, "地点名称不能超过100个字符"),
  slug: z.string().trim().min(1, "slug不能为空").max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 仅支持小写字母、数字和中划线"),
  summary: z.string().trim().max(500, "地点说明不能超过500个字符").optional().or(z.literal("")),
  locationLabel: z.string().trim().min(1, "公开地区名称不能为空").max(120),
  latitude: coordinate(-90, 90, "纬度"),
  longitude: coordinate(-180, 180, "经度"),
  publicLatitude: optionalCoordinate(-90, 90, "公开纬度"),
  publicLongitude: optionalCoordinate(-180, 180, "公开经度"),
  privacy: z.enum(["EXACT", "APPROXIMATE", "CITY_ONLY", "HIDDEN"]),
  coordinateSystem: z.enum(["WGS84", "GCJ02", "BD09"]),
  coordinateSource: z.string().trim().min(1, "坐标来源不能为空").max(160, "坐标来源不能超过160个字符"),
  occurredAt: z.string().datetime({ offset: true }).optional().or(z.literal("")),
  coverAssetId: z.string().trim().max(64).optional().or(z.literal("")),
});

function validatePrivacy(
  value: z.infer<typeof placeFields>,
  context: z.RefinementCtx,
) {
  const publicLat = typeof value.publicLatitude === "number" ? value.publicLatitude : null;
  const publicLng = typeof value.publicLongitude === "number" ? value.publicLongitude : null;

  if (value.privacy === "APPROXIMATE") {
    if (publicLat === null || publicLng === null) {
      context.addIssue({ code: "custom", path: ["publicLatitude"], message: "模糊展示必须填写一组公开坐标" });
      return;
    }
    if (Math.abs(publicLat - value.latitude) < 0.0001 && Math.abs(publicLng - value.longitude) < 0.0001) {
      context.addIssue({ code: "custom", path: ["publicLatitude"], message: "模糊坐标不能与内部精确坐标相同" });
    }
  }
}

export const CreatePlaceInputSchema = placeFields.superRefine(validatePrivacy);
export type CreatePlaceInput = z.infer<typeof CreatePlaceInputSchema>;

export const UpdatePlaceInputSchema = placeFields.partial().refine(
  (value) => Object.keys(value).length > 0,
  "至少需要修改一个字段",
);

export const adminPlaceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().max(80).default(""),
  privacy: z.enum(["ALL", "EXACT", "APPROXIMATE", "CITY_ONLY", "HIDDEN"]).default("ALL"),
  deleted: z.enum(["active", "trash"]).default("active"),
});

export const publicPlaceListQuerySchema = z.object({
  q: z.string().trim().max(80).default(""),
});
