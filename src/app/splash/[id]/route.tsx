import { ImageResponse } from "next/og";
import { SPLASH_SCREENS } from "@/lib/splash";

// One renderer for every iOS launch splash. The matching <link rel=
// "apple-touch-startup-image"> tags are emitted from the same SPLASH_SCREENS
// table in layout.tsx, so URL + media + pixel size stay in lockstep.
// Pre-rendered to static PNGs at build time.
export const dynamic = "force-static";

export function generateStaticParams() {
  return SPLASH_SCREENS.map((s) => ({ id: s.id }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const screen = SPLASH_SCREENS.find((s) => s.id === id);
  if (!screen) return new Response("Not found", { status: 404 });

  // Mark scales with the smaller dimension so it reads well on phones and iPads.
  const mark = Math.round(Math.min(screen.w, screen.h) * 0.22);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(90% 60% at 50% 38%, #1d2a2a 0%, #13111a 70%)",
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 24 24" fill="none" stroke="#6fc7b3" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Z" />
          <path d="M6 15v-2" />
          <path d="M12 15V9" />
          <circle cx="12" cy="6" r="3" />
        </svg>
      </div>
    ),
    { width: screen.w, height: screen.h },
  );
}
