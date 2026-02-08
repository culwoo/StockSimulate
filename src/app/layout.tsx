import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";

import "./globals.css";

const headingFont = Noto_Sans_KR({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "700"]
});

const bodyFont = Noto_Sans_KR({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"]
});

export const metadata: Metadata = {
  title: "StockSimulate | ETF 시뮬레이터",
  description: "미국 ETF 수익률 비교와 적립식 백테스트를 지원하는 포트폴리오 시뮬레이터"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${headingFont.variable} ${bodyFont.variable}`}>{children}</body>
    </html>
  );
}
