"use client";

import { useRef, useState } from "react";
import { Download, Upload, FileJson, Table } from "lucide-react";
import type { Game } from "@/lib/types";
import { money } from "@/lib/types";
import { useToast } from "@/components/Toast";

// Catalogue fields we round-trip. Deliberately excludes server-managed fields
// (id, created_at, added_by, household_id) and client-joined ones (progress,
// playthroughs): a re-import recreates the shared catalogue entry, not per-user
// progress.
const EXPORT_FIELDS = [
  "title", "platform", "status", "condition", "region", "genre", "year",
  "developer", "publisher", "rating", "value_cents", "cover", "description",
  "screenshots", "platforms", "hltb", "igdb_id", "pricecharting_id",
] as const;

function pickFields(src: Partial<Game>): Partial<Game> {
  const out: Record<string, unknown> = {};
  for (const k of EXPORT_FIELDS) {
    const v = (src as Record<string, unknown>)[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as Partial<Game>;
}

// Normalise an imported row to known fields and a valid game status.
function sanitize(raw: unknown): Partial<Game> {
  if (!raw || typeof raw !== "object") return {};
  const fields = pickFields(raw as Partial<Game>);
  fields.status = (raw as Partial<Game>).status === "wishlist" ? "wishlist" : "owned";
  return fields;
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10);

// CSV cell quoting: wrap + double up quotes when the value contains a comma,
// quote, or newline.
const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const CSV_COLS: { label: string; get: (g: Game) => unknown }[] = [
  { label: "Title", get: (g) => g.title },
  { label: "Platform", get: (g) => g.platform },
  { label: "Status", get: (g) => g.status },
  { label: "Condition", get: (g) => g.condition },
  { label: "Region", get: (g) => g.region },
  { label: "Genre", get: (g) => g.genre },
  { label: "Year", get: (g) => g.year },
  { label: "Developer", get: (g) => g.developer },
  { label: "Publisher", get: (g) => g.publisher },
  { label: "Rating", get: (g) => g.rating },
  { label: "Value", get: (g) => money(g.value_cents) },
  { label: "IGDB ID", get: (g) => g.igdb_id },
];

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px",
  background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)",
  color: "var(--ink)", fontSize: 13, fontWeight: 700, fontFamily: "var(--display)", cursor: "pointer",
};

export default function DataTransfer({
  games,
  importGames,
}: {
  games: Game[];
  importGames: (rows: Partial<Game>[]) => Promise<number>;
}) {
  const { notify } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const exportJson = () => {
    const payload = {
      app: "GameVault",
      version: 1,
      exported_at: new Date().toISOString(),
      games: games.map(pickFields),
    };
    download(
      `gamevault-${today()}.json`,
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
  };

  const exportCsv = () => {
    const lines = [
      CSV_COLS.map((c) => csvCell(c.label)).join(","),
      ...games.map((g) => CSV_COLS.map((c) => csvCell(c.get(g))).join(",")),
    ];
    download(
      `gamevault-${today()}.csv`,
      new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    );
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later
    if (!file) return;
    setImporting(true);
    try {
      const parsed = JSON.parse(await file.text());
      const list: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { games?: unknown[] })?.games)
          ? (parsed as { games: unknown[] }).games
          : [];
      if (!list.length) {
        notify({ title: "Nothing to import", message: "No games found in that file." });
        return;
      }

      // Dedupe against the current collection by IGDB id, then title+platform.
      const haveIgdb = new Set(games.map((g) => g.igdb_id).filter(Boolean) as number[]);
      const keyOf = (t?: string | null, p?: string | null) =>
        `${(t ?? "").toLowerCase()}|${(p ?? "").toLowerCase()}`;
      const haveKey = new Set(games.map((g) => keyOf(g.title, g.platform)));

      const toAdd: Partial<Game>[] = [];
      let skipped = 0;
      for (const raw of list) {
        const fields = sanitize(raw);
        if (!fields.title || !fields.platform) { skipped++; continue; }
        const key = keyOf(fields.title, fields.platform);
        if ((fields.igdb_id && haveIgdb.has(fields.igdb_id)) || haveKey.has(key)) {
          skipped++;
          continue;
        }
        toAdd.push(fields);
        if (fields.igdb_id) haveIgdb.add(fields.igdb_id);
        haveKey.add(key);
      }

      const added = await importGames(toAdd);
      notify({
        title: "Import complete",
        message: `${added} added${skipped ? `, ${skipped} skipped (duplicates)` : ""}.`,
      });
    } catch {
      notify({ title: "Import failed", message: "That file isn't valid GameVault JSON." });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
      <button style={btn} onClick={exportJson} type="button">
        <FileJson size={15} /> Export JSON
      </button>
      <button style={btn} onClick={exportCsv} type="button">
        <Table size={15} /> Export CSV
      </button>
      <button
        style={{ ...btn, opacity: importing ? 0.6 : 1 }}
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        type="button"
      >
        {importing ? <Download size={15} /> : <Upload size={15} />}
        {importing ? "Importing…" : "Import JSON"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={onPick}
        style={{ display: "none" }}
      />
    </div>
  );
}
