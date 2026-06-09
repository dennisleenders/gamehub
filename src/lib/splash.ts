// Single source of truth for the iOS launch-splash screens. Consumed by BOTH the
// `apple-touch-startup-image` links (src/app/layout.tsx) and the image route that
// renders them (src/app/splash/[id]/route.tsx), so the media queries and pixel
// sizes can never drift apart.
//
// iOS matches a startup image by device-width/height in CSS POINTS plus the
// device-pixel-ratio and orientation; the PNG itself must be the PHYSICAL pixel
// size (points × dpr). Portrait only. A device not listed here simply falls back
// to the manifest background_color (#13111a) — which, since our splash is just
// that colour + a centred mark, is nearly indistinguishable.
type Device = { id: string; pt: [number, number]; dpr: number };

const DEVICES: Device[] = [
  // iPhones (portrait)
  { id: "iphone-16-pro-max", pt: [440, 956], dpr: 3 },
  { id: "iphone-16-pro", pt: [402, 874], dpr: 3 },
  { id: "iphone-15-pro-max", pt: [430, 932], dpr: 3 }, // 14 Pro Max / 15 Plus
  { id: "iphone-15-pro", pt: [393, 852], dpr: 3 }, // 14 Pro / 15 / 16
  { id: "iphone-14-plus", pt: [428, 926], dpr: 3 }, // 12/13 Pro Max
  { id: "iphone-14", pt: [390, 844], dpr: 3 }, // 12 / 13 / 14
  { id: "iphone-x", pt: [375, 812], dpr: 3 }, // X / XS / 11 Pro / 12-13 mini
  { id: "iphone-xr", pt: [414, 896], dpr: 2 }, // XR / 11 / XS Max (dpr 2)
  { id: "iphone-8-plus", pt: [414, 736], dpr: 3 },
  { id: "iphone-8", pt: [375, 667], dpr: 2 }, // 6/7/8 / SE 2-3
  // iPads (portrait) — cheap, share the renderer
  { id: "ipad-11", pt: [834, 1194], dpr: 2 },
  { id: "ipad-pro-12", pt: [1024, 1366], dpr: 2 },
];

export const SPLASH_SCREENS = DEVICES.map((d) => {
  const [w, h] = d.pt;
  return {
    id: d.id,
    w: w * d.dpr,
    h: h * d.dpr,
    media:
      `(device-width: ${w}px) and (device-height: ${h}px) ` +
      `and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait)`,
  };
});

export type SplashScreen = (typeof SPLASH_SCREENS)[number];
