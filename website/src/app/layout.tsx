import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";
import "./globals.css";

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Engineering Notebook Editor",
  description: "A professional engineering notebook editor for VEX robotics teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${workSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-nb-surface text-nb-on-surface dark:bg-nb-dark-bg dark:text-nb-dark-on-surface">
        {children}
      </body>
    </html>
  );
}
