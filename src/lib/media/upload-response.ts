// Nginx may return HTML; JSON parse errors are not connection failures.
export async function readUploadResponse(response: Response) {
  if (response.status === 401) throw new Error("登录已过期，请重新登录后重试，编辑内容会保留。");
  if (response.status === 413) throw new Error("文件超过上传大小限制，请压缩后重试；视频最多 64 MiB。");
  if ([502, 503, 504].includes(response.status)) throw new Error("上传服务暂时不可用或超时，请稍后重试。");
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body?.data?.asset) throw new Error(body?.error?.message ?? `上传失败（HTTP ${response.status}），请重试或联系管理员。`);
  return body.data.asset;
}
