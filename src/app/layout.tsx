import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://eastherphil.cn"),
  title: {
    default: "EastherPhil 的沿途手记",
    template: "%s | EastherPhil 的沿途手记",
  },
  description: "记录技术、阅读与日常生活的个人日志。",
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "EastherPhil 的沿途手记",
    title: "EastherPhil 的沿途手记",
    description: "记录技术、阅读与日常生活的个人日志。",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
