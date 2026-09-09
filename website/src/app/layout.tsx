import type { Metadata } from "next";
import { Inter, Inconsolata } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const inconsolata = Inconsolata({
  subsets: ["latin"],
  variable: "--font-inconsolata",
  display: "swap",
});

const siteUrl = "https://notebook.msoevex.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ENGen | Engineering Notebook Generator",
    template: "%s | ENGen",
  },
  description:
    "ENGen is an open-source, LaTeX-powered engineering notebook editor designed specifically for robotics teams (VEX, FIRST, and more).",
  applicationName: "ENGen",
  authors: [{ name: "MSOE VEX Robotics", url: "https://msoevex.com" }],
  creator: "MSOE VEX Robotics",
  publisher: "MSOE VEX Robotics",
  keywords: [
    "engineering notebook",
    "robotics notebook",
    "VEX Robotics",
    "VEX U",
    "FIRST Robotics",
    "FTC",
    "FRC",
    "VEX",
    "LaTeX engineering notebook",
    "engineering design process",
    "notebook generator",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "ENGen",
    title: "ENGen | Engineering Notebook Generator",
    description:
      "A modern, LaTeX-powered engineering notebook editor and generator built for robotics teams.",
    images: [
      {
        url: "/og-banner.png",
        width: 1200,
        height: 630,
        alt: "ENGen - Engineering Notebook Generator",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ENGen | Engineering Notebook Generator",
    description:
      "A modern, LaTeX-powered engineering notebook editor and generator built for robotics teams.",
    images: ["/og-banner.png"],
  },
  icons: {
    icon: "/logo.svg",
  },
};

import { ThemeProvider } from "@/components/theme-provider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${inconsolata.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-nb-surface text-nb-on-surface" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
