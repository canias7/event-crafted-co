// Who replied to an invitation and what they answered (owner's call, Oct
// 2026): totals (people coming including plus-ones, maybe, can't make
// it), a meal tally, and each reply with its plus-ones, meal, dietary
// needs, song request and answers to the host's own questions. The host
// can download it all as a CSV for the caterer or planner.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { InviteQuestion } from "@/lib/invitations";
import { intlLocale } from "@/lib/intlLocale";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Reply {
  id: string;
  name: string;
  email: string | null;
  status: "going" | "maybe" | "not_going";
  plus_ones: number;
  meal_choice: string | null;
  dietary: string | null;
  song_request: string | null;
  answers: Record<string, string>;
  created_at: string;
}

const STATUS_PILL: Record<Reply["status"], string> = {
  going: "bg-primary text-primary-foreground",
  maybe: "bg-pending text-accent",
  not_going: "bg-muted text-foreground",
};

export function RsvpRepliesDialog({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  questions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle: string;
  questions: InviteQuestion[];
}) {
  const { t } = useTranslation("hostEvents");
  const [rows, setRows] = useState<Reply[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(null);
    let alive = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any)
      .from("host_event_rsvps")
      .select("id, name, email, status, plus_ones, meal_choice, dietary, song_request, answers, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .then(({ data }: { data: Reply[] | null }) => {
        if (alive) setRows(data ?? []);
      });
    return () => {
      alive = false;
    };
  }, [open, eventId]);

  const totals = useMemo(() => {
    const r = rows ?? [];
    const going = r.filter((x) => x.status === "going");
    const meals: Record<string, number> = {};
    for (const x of going) if (x.meal_choice) meals[x.meal_choice] = (meals[x.meal_choice] ?? 0) + 1;
    return {
      people: going.reduce((n, x) => n + 1 + (x.plus_ones ?? 0), 0),
      maybe: r.filter((x) => x.status === "maybe").length,
      no: r.filter((x) => x.status === "not_going").length,
      meals,
    };
  }, [rows]);

  function downloadCsv() {
    const qs = questions;
    const head = [
      t("replies.csv.name"),
      t("replies.csv.email"),
      t("replies.csv.status"),
      t("replies.csv.plusOnes"),
      t("replies.csv.meal"),
      t("replies.csv.dietary"),
      t("replies.csv.song"),
      ...qs.map((q) => q.label),
      t("replies.csv.replied"),
    ];
    const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [head.map(esc).join(",")];
    for (const r of rows ?? []) {
      lines.push(
        [
          r.name,
          r.email,
          t(`replies.status.${r.status}`),
          r.plus_ones,
          r.meal_choice,
          r.dietary,
          r.song_request,
          ...qs.map((q) => r.answers?.[q.id] ?? ""),
          new Date(r.created_at).toLocaleString(intlLocale()),
        ]
          .map(esc)
          .join(","),
      );
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${eventTitle.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "rsvps"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-editorial text-2xl">{t("replies.title")}</DialogTitle>
          <DialogDescription>{eventTitle}</DialogDescription>
        </DialogHeader>

        {rows === null ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                [totals.people, t("replies.coming", { count: totals.people })],
                [totals.maybe, t("replies.maybe", { count: totals.maybe })],
                [totals.no, t("replies.no", { count: totals.no })],
              ].map(([n, label], i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-3">
                  <p className="font-editorial text-2xl m-0 tnum">{n}</p>
                  <p className="text-xs m-0">{label}</p>
                </div>
              ))}
            </div>
            {Object.keys(totals.meals).length > 0 ? (
              <p className="text-sm">
                <span className="font-bold">{t("replies.meals")}: </span>
                {Object.entries(totals.meals)
                  .map(([m, n]) => `${m} ${n}`)
                  .join(" · ")}
              </p>
            ) : null}

            {rows.length === 0 ? (
              <p className="text-sm py-6 text-center">{t("replies.none")}</p>
            ) : (
              <ul className="m-0 p-0 list-none divide-y divide-border">
                {rows.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="m-0 text-sm font-bold truncate">
                          {r.name}
                          {r.status === "going" && r.plus_ones > 0 ? ` +${r.plus_ones}` : ""}
                        </p>
                        {r.email ? <p className="m-0 text-xs truncate">{r.email}</p> : null}
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STATUS_PILL[r.status]}`}>
                        {t(`replies.status.${r.status}`)}
                      </span>
                    </div>
                    <dl className="m-0 mt-1.5 space-y-0.5 text-xs">
                      {r.meal_choice ? <Detail label={t("replies.csv.meal")} value={r.meal_choice} /> : null}
                      {r.dietary ? <Detail label={t("replies.csv.dietary")} value={r.dietary} /> : null}
                      {r.song_request ? <Detail label={t("replies.csv.song")} value={r.song_request} /> : null}
                      {questions.map((q) =>
                        r.answers?.[q.id] ? <Detail key={q.id} label={q.label} value={r.answers[q.id]} /> : null,
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            )}

            {rows.length > 0 ? (
              <Button variant="outline" onClick={downloadCsv} className="self-start">
                <Download className="h-4 w-4" /> {t("replies.download")}
              </Button>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="font-bold shrink-0">{/[?:：]$/.test(label) ? label : `${label}:`}</dt>
      <dd className="m-0 min-w-0 break-words">{value}</dd>
    </div>
  );
}
