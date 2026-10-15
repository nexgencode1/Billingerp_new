import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Billing ERP",
    template: "%s · Billing ERP",
  },
  description: "Billing, Inventory, Accounting, CRM, HR & Manufacturing — all in one.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.ico", apple: "/icon.svg" },
  // This app is private and sits behind a login — it should never be crawled
  // or indexed by search engines. See also src/app/robots.ts.
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
