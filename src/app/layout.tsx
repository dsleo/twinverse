import type { Metadata } from "next";
import { Manrope, Outfit } from "next/font/google";
import { SiteHeader } from "../components/site/SiteHeader";
import "./globals.css";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Tweenverse",
  description: "Editorial prediction lab for grounded synthetic personas and memory injection.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <div className="site-frame">
          <SiteHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
