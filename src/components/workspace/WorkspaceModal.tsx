"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function WorkspaceModal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return <div className="workspace-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workspace-modal" data-wide={wide} role="dialog" aria-modal="true" aria-labelledby="workspace-modal-title">
      <header><div><h2 id="workspace-modal-title">{title}</h2>{description ? <p>{description}</p> : null}</div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><X size={20} /></button></header>
      <div className="workspace-modal__body">{children}</div>
    </section>
  </div>;
}
