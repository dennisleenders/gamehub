import { ImageResponse } from "next/og";

// Stable, named manifest icons: /icons/192, /icons/512, /icons/maskable-512.
// Named routes (not generateImageMetadata's hashed URLs) so manifest.ts can
// reference them literally and middleware can whitelist the /icons/ prefix.
// Pre-rendered to static PNGs at build time.
export const dynamic = "force-static";

type Spec = { px: number; maskable: boolean };
const SPECS: Record<string, Spec> = {
  "192": { px: 192, maskable: false },
  "512": { px: 512, maskable: false },
  "maskable-512": { px: 512, maskable: true },
};

export function generateStaticParams() {
  return Object.keys(SPECS).map((size) => ({ size }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const spec = SPECS[size];
  if (!spec) return new Response("Not found", { status: 404 });

  // Maskable icons must keep the mark inside the ~80% safe circle, so pad it in
  // and let the gradient fill to every edge.
  const pad = spec.maskable ? "12%" : "0";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: pad,
          background: "radial-gradient(125% 125% at 30% 18%, #6fc7b3 0%, #2c5d57 40%, #13111a 82%)",
        }}
      >
        <svg width="58%" height="58%" viewBox="0 0 24 24" fill="none" stroke="#13111a" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Z" />
          <path d="M6 15v-2" />
          <path d="M12 15V9" />
          <circle cx="12" cy="6" r="3" />
        </svg>
      </div>
    ),
    { width: spec.px, height: spec.px },
  );
}
