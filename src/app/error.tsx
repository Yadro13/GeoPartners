"use client";

import { useEffect } from "react";
import Link from "next/link";
import { House, RotateCcw, TriangleAlert } from "lucide-react";

export default function ErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error("ui_route_error", { name: error.name, digest: error.digest ?? null });
  }, [error]);

  return <main className="system-state">
    <div className="system-state__mark" aria-hidden="true">GP</div>
    <TriangleAlert className="system-state__icon" size={28} />
    <p className="system-state__eyebrow">Тимчасова помилка</p>
    <h1>Не вдалося завантажити сторінку</h1>
    <p>Перевірте з&apos;єднання та повторіть операцію. Введені дані не надсилаються повторно автоматично.</p>
    <div className="system-state__actions">
      <button type="button" onClick={unstable_retry}><RotateCcw size={17} />Спробувати ще раз</button>
      <Link href="/"><House size={17} />До робочого простору</Link>
    </div>
    {error.digest ? <small>Код помилки: {error.digest}</small> : null}
  </main>;
}
