import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Creator - 플레이리스트 SEO · 썸네일 생성기",
  description:
    "YouTube 음악 플레이리스트를 위한 SEO 최적화 제목과 썸네일 컨셉을 자동으로 생성합니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="font-sans">{children}</body>
    </html>
  );
}
