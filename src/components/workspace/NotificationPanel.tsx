"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { History, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import type { NotificationQueueSummary } from "@/lib/notification-monitor";

const previewSummary: NotificationQueueSummary = {
  state: "ok",
  pending: 0,
  failed: 0,
  exhausted: 0,
  due: 0,
  oldestUnsentAt: null,
  checkedAt: new Date(0).toISOString(),
};

export function NotificationPanel({ isAdmin, preview }: { isAdmin: boolean; preview: boolean }) {
  const [summary, setSummary] = useState<NotificationQueueSummary | null>(preview ? previewSummary : null);
  const [loading, setLoading] = useState(isAdmin && !preview);
  const [error, setError] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!isAdmin || preview) return;
    setLoading(true);
    setError("");
    try {
      setSummary(await fetchSummary(signal));
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Не вдалося перевірити чергу.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [isAdmin, preview]);

  useEffect(() => {
    if (!isAdmin || preview) return;
    const controller = new AbortController();
    void fetchSummary(controller.signal)
      .then((body) => setSummary(body))
      .catch((reason) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "Не вдалося перевірити чергу.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isAdmin, preview]);

  if (!isAdmin) return <div className="notification-panel"><ShieldCheck size={24} /><h3>Нових сповіщень немає</h3><p>Системні повідомлення з&apos;являться тут.</p></div>;

  return <div className="notification-panel">
    {summary?.state === "attention" ? <TriangleAlert className="notification-panel__icon" data-tone="warning" size={26} /> : <ShieldCheck className="notification-panel__icon" size={26} />}
    <h3>{summary ? statusTitle(summary) : "Перевірка черги сповіщень"}</h3>
    {loading ? <p role="status">Отримуємо актуальний стан…</p> : error ? <div className="notification-panel__error" role="alert"><p>{error}</p><button className="command-button" type="button" onClick={() => void refresh()}><RefreshCw size={16} />Спробувати ще раз</button></div> : summary ? <>
      <p>{statusDescription(summary)}</p>
      <dl className="notification-status">
        <div><dt>Очікують</dt><dd>{summary.pending}</dd></div>
        <div><dt>Повторна спроба</dt><dd>{summary.failed}</dd></div>
        <div data-tone={summary.exhausted ? "warning" : undefined}><dt>Потребують уваги</dt><dd>{summary.exhausted}</dd></div>
      </dl>
      {summary.oldestUnsentAt ? <small className="notification-status__age"><History size={14} />Найстаріше невідправлене: {formatDate(summary.oldestUnsentAt)}</small> : null}
      <button className="command-button notification-status__refresh" type="button" onClick={() => void refresh()}><RefreshCw size={16} />Оновити стан</button>
    </> : null}
    <Link className="command-button command-button--primary" href="/admin/registrations">Переглянути заявки</Link>
  </div>;
}

function statusTitle(summary: NotificationQueueSummary) {
  if (summary.state === "attention") return "Черга потребує уваги";
  if (summary.state === "processing") return "Повідомлення очікують відправлення";
  return "Черга сповіщень працює штатно";
}

function statusDescription(summary: NotificationQueueSummary) {
  if (summary.exhausted) return "Ліміт автоматичних спроб вичерпано. Перевірте журнали notification worker.";
  if (summary.failed) return "Worker повторить невдалі відправлення за розкладом.";
  if (summary.pending) return "Нові повідомлення вже поставлено в чергу.";
  return "Невідправлених email або Telegram-повідомлень немає.";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function fetchSummary(signal?: AbortSignal) {
  const response = await fetch("/api/admin/notifications/status", { signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "Не вдалося перевірити чергу.");
  return body as NotificationQueueSummary;
}
