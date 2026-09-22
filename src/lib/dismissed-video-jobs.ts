"use client";

import { useSyncExternalStore } from "react";

// „Ausblenden“ gescheiterter Video-Aufträge (Welle 51) — CLIENTSEITIG je Browser.
//
// Warum nicht in der DB: video_jobs hat kein passendes Feld (Spalten laut Migrationen
// 0012/0014/0017/0020/0025/0026: id, account_id, video_path, title, status, tutorial_id,
// error, created_by, created_at, updated_at, note, progress, clicks, kind, render_style,
// output_path, chapters, category_id) und diese Welle legt bewusst KEINE Migration an.
// Den Auftrag zu löschen wäre zwar möglich, würde aber die Fehlerspur für den Support
// vernichten. Folge: Ausgeblendetes gilt nur in diesem Browser; nach 7 Tagen verschwindet
// der Hinweis ohnehin (FAILED_VIDEO_DAYS). Bibliothek und Glocke teilen sich diesen Speicher
// und bleiben über ein Fenster-Ereignis synchron.

const KEY = "steply-dismissed-video-jobs";
const EVENT = "steply-dismissed-video-jobs";
const MAX = 100; // ältere IDs fallen heraus (Hinweise sind ohnehin nur 7 Tage sichtbar)

let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function subscribe(cb: () => void) {
  const onChange = () => {
    cache = null;
    cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Auftrag ausblenden (in diesem Browser). */
export function dismissVideoJob(id: string) {
  const next = [id, ...read().filter((x) => x !== id)].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* privater Modus o. Ä.: dann nur für diese Sitzung */
  }
  cache = next;
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Ausgeblendete Auftrags-IDs. Auf dem Server und beim ersten Client-Render `null`
 * (noch unbekannt) — Aufrufer blenden Fehlschläge bis dahin aus, damit nichts aufblitzt.
 */
export function useDismissedVideoJobs(): string[] | null {
  return useSyncExternalStore<string[] | null>(subscribe, read, () => null);
}
