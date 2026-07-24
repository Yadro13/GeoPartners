import Link from "next/link";
import { ArrowLeft, MapPinOff } from "lucide-react";

export default function NotFound() {
  return <main className="system-state">
    <div className="system-state__mark" aria-hidden="true">GP</div>
    <MapPinOff className="system-state__icon" size={28} />
    <p className="system-state__eyebrow">Помилка 404</p>
    <h1>Сторінку не знайдено</h1>
    <p>Адреса могла змінитися або сторінка більше не існує.</p>
    <div className="system-state__actions">
      <Link href="/"><ArrowLeft size={17} />Повернутися до карти</Link>
    </div>
  </main>;
}
