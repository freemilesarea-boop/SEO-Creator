/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  // Electron 로컬 파일에서 로드 시 필요
  assetPrefix: "./",
  // 이미지 최적화는 static export에서 비활성화
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
