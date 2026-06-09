import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import RegisterSW from "@/components/RegisterSW";
import IosInstallHint from "@/components/IosInstallHint";
import { SPLASH_SCREENS } from "@/lib/splash";

export const metadata: Metadata = {
  // Makes icon/manifest/splash URLs absolute-correct behind a LAN IP or tunnel
  // and silences the Next metadata warning. Falls back to localhost in dev.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  applicationName: "GameVault",
  title: "GameVault",
  description: "A shared collection vault for our games.",
  formatDetection: { telephone: false },
  // Next emits the modern `mobile-web-app-capable`, but iOS (esp. older versions)
  // needs the legacy apple-prefixed tag to launch standalone — add it explicitly.
  other: { "apple-mobile-web-app-capable": "yes" },
  appleWebApp: {
    capable: true,
    title: "GameVault",
    statusBarStyle: "black-translucent",
    // DRY: same table the /splash/[id] route renders from, so URL + media + size
    // never drift apart.
    startupImage: SPLASH_SCREENS.map((s) => ({ url: `/splash/${s.id}`, media: s.media })),
  },
};

export const viewport: Viewport = {
  themeColor: "#13111a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // required so env(safe-area-inset-*) report real insets
  // Intentionally NOT disabling zoom — iOS ignores it and it harms accessibility.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Manrope:wght@400;500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
        <RegisterSW />
        <IosInstallHint />
      </body>
    </html>
  );
}
