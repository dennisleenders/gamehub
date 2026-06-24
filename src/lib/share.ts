// Web Share with a clipboard fallback. `navigator.share` opens the native share
// sheet on iOS/Android (and some desktops); everywhere else we copy a text+link
// blob so the action still does something useful. The caller toasts on "copied".
export type ShareResult = "shared" | "copied" | "failed" | "dismissed";

export async function shareOrCopy(input: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<ShareResult> {
  const url = input.url ?? (typeof window !== "undefined" ? window.location.origin : "");

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: input.title, text: input.text, url });
      return "shared";
    } catch (e) {
      // The user dismissing the sheet throws AbortError — not a real failure, and
      // not something to fall back from (they chose not to share).
      if ((e as Error)?.name === "AbortError") return "dismissed";
      // Any other error: fall through to the clipboard path.
    }
  }

  const blob = [input.text, url].filter(Boolean).join("\n");
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(blob);
      return "copied";
    }
  } catch {
    /* clipboard blocked */
  }
  return "failed";
}
