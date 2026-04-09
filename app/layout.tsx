import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Transcribble",
  description: "Private voice workspace for turning recordings into searchable, editable knowledge on this device.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
  applicationName: "Transcribble",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Transcribble",
  },
  metadataBase: new URL("https://transcribble.vercel.app"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${plexMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
