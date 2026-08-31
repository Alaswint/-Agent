import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "./theme-context";

export const metadata: Metadata = {
  title: "Roleplay Agent",
  description: "AI 角色扮演对话系统",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
