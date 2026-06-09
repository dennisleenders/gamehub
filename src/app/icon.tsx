import { ImageResponse } from "next/og";

// Generated favicon / browser-tab icon. Next auto-injects the <link rel="icon">.
// A joystick mark (matching the app's lucide brand glyph) drawn as inline SVG so
// it stays crisp when the browser downsamples it for the tab. No external fonts.
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(120% 120% at 30% 20%, #6fc7b3 0%, #2c5d57 38%, #13111a 78%)",
          borderRadius: 42,
        }}
      >
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#13111a" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
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
