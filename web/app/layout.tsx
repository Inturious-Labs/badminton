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

const SITE_URL = "https://badminton.inturious.com";
const TITLE = "2026 Shanghai Bilingual Schools Parents' Badminton — Team Tournament";
const DESCRIPTION =
  "Tournament analysis for the 2026 Shanghai International & Bilingual Schools Parents' Badminton Spring League (团体赛). Standings, knockout journey, team rosters, and pair-by-pair deployment stats across 12 schools.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "badminton",
    "tournament analysis",
    "羽毛球",
    "团体赛",
    "2026 上海国际及双语学校家长羽毛球春季赛",
    "Shanghai bilingual schools",
    "parents badminton",
    "Inturious Labs",
    "team tournament",
    "round-robin",
    "knockout bracket",
    "pair stats",
    "tournament standings",
  ],
  authors: [{ name: "Inturious Labs", url: "https://inturious.com" }],
  creator: "Inturious Labs",
  publisher: "Inturious Labs",
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Inturious Labs · Badminton",
    locale: "en_US",
    images: [
      {
        url: "/hero.jpg",
        width: 1191,
        height: 603,
        alt: TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/hero.jpg"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
