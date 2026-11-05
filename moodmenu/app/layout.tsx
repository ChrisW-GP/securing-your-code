import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoodMenu · 今天吃点什么",
  description: "从真实菜单出发，找到此刻刚刚好的那一道。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
