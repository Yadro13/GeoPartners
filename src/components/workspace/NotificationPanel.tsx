"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
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
  const t = useTranslations("notificationsUi");
  const format = useFormatter();
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
      setError(reason instanceof Error ? reason.message : t("checkFailed"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [isAdmin, preview, t]);

  useEffect(() => {
    if (!isAdmin || preview) return;
    const controller = new AbortController();
    void fetchSummary(controller.signal)
      .then((body) => setSummary(body))
      .catch((reason) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : t("checkFailed"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isAdmin, preview, t]);

  if (!isAdmin) return <div className="notification-panel"><ShieldCheck size={24} /><h3>{t("none")}</h3><p>{t("systemHere")}</p></div>;

  return <div className="notification-panel">
    {summary?.state === "attention" ? <TriangleAlert className="notification-panel__icon" data-tone="warning" size={26} /> : <ShieldCheck className="notification-panel__icon" size={26} />}
    <h3>{summary ? t(statusTitleKey(summary)) : t("checking")}</h3>
    {loading ? <p role="status">{t("loading")}</p> : error ? <div className="notification-panel__error" role="alert"><p>{error}</p><button className="command-button" type="button" onClick={() => void refresh()}><RefreshCw size={16} />{t("retry")}</button></div> : summary ? <>
      <p>{t(statusDescriptionKey(summary))}</p>
      <dl className="notification-status">
        <div><dt>{t("pending")}</dt><dd>{summary.pending}</dd></div>
        <div><dt>{t("retrying")}</dt><dd>{summary.failed}</dd></div>
        <div data-tone={summary.exhausted ? "warning" : undefined}><dt>{t("attention")}</dt><dd>{summary.exhausted}</dd></div>
      </dl>
      {summary.oldestUnsentAt ? <small className="notification-status__age"><History size={14} />{t("oldest", { date: format.dateTime(new Date(summary.oldestUnsentAt), { dateStyle: "medium", timeStyle: "short" }) })}</small> : null}
      <button className="command-button notification-status__refresh" type="button" onClick={() => void refresh()}><RefreshCw size={16} />{t("refresh")}</button>
    </> : null}
    <Link className="command-button command-button--primary" href="/admin/registrations">{t("requests")}</Link>
  </div>;
}

function statusTitleKey(summary: NotificationQueueSummary) {
  if (summary.state === "attention") return "attentionTitle";
  if (summary.state === "processing") return "processingTitle";
  return "okTitle";
}

function statusDescriptionKey(summary: NotificationQueueSummary) {
  if (summary.exhausted) return "exhaustedText";
  if (summary.failed) return "failedText";
  if (summary.pending) return "pendingText";
  return "okText";
}

async function fetchSummary(signal?: AbortSignal) {
  const response = await fetch("/api/admin/notifications/status", { signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "Notification queue check failed.");
  return body as NotificationQueueSummary;
}
