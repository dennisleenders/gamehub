import type { MetadataRoute } from "next";

// Served by Next at /manifest.webmanifest, with <link rel="manifest"> auto-injected
// into <head>. Icons point at the stable /icons/* route handlers. iOS leans on the
// apple-* meta tags + apple-touch-icon for Add-to-Home-Screen, but a valid manifest
// makes this a proper installable PWA on Android/desktop too.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GameVault",
    short_name: "GameVault",
    description: "A shared collection vault for our games.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#13111a",
    theme_color: "#13111a",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
