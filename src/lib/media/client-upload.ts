// Transfer progress covers the request body; the server may still validate and save afterward.
export function uploadWithProgress(data: FormData, onProgress: (percent: number) => void): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/assets");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.floor(event.loaded / event.total * 100)));
    };
    xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status, statusText: xhr.statusText }));
    xhr.onerror = () => reject(new TypeError("网络连接失败，请检查网络后重试"));
    xhr.onabort = () => reject(new Error("上传已取消，请重试。"));
    xhr.ontimeout = () => reject(new Error("上传超时，请重试。"));
    xhr.send(data);
  });
}
