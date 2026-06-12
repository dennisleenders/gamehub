// Full-screen launch splash. Deliberately a carbon copy of the iOS startup image
// rendered by src/app/splash/[id]/route.tsx (same gradient + joystick mark in the
// same accent) so the handoff from the native launch splash to this one is
// invisible — the user never sees a black gap. Pure markup with inline styles so
// it paints from the streamed HTML shell, before React hydrates or fonts load.
export default function Splash() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(90% 60% at 50% 38%, #1d2a2a 0%, #13111a 70%)",
      }}
    >
      <svg
        className="pulse"
        width={88}
        height={88}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#6fc7b3"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Z" />
        <path d="M6 15v-2" />
        <path d="M12 15V9" />
        <circle cx="12" cy="6" r="3" />
      </svg>
    </div>
  );
}
