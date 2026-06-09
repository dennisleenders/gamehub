import { ImageResponse } from "next/og";

// Apple touch icon for the iOS home screen. Next auto-injects the
// <link rel="apple-touch-icon">. iOS applies its own rounded-square mask and
// ignores alpha, so we render a full-bleed, fully opaque tile (no internal
// corner radius) with a slightly larger mark for home-screen legibility.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(125% 125% at 30% 18%, #6fc7b3 0%, #2c5d57 40%, #13111a 82%)",
        }}
      >
        <svg width="118" height="118" viewBox="0 0 24 24" fill="none" stroke="#13111a" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Z" />
          <path d="M6 15v-2" />
          <path d="M12 15V9" />
          <circle cx="12" cy="6" r="3" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
