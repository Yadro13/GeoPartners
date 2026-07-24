"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function WorkspaceModal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = [
      "button:not([disabled])",
      "[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    const getFocusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
      .filter((element) => element.offsetParent !== null);
    const focusable = getFocusable();
    (focusable[0] ?? dialogRef.current)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const currentFocusable = getFocusable();
      if (!currentFocusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return <div className="workspace-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="workspace-modal" data-wide={wide} role="dialog" aria-modal="true" aria-labelledby="workspace-modal-title" aria-describedby={description ? "workspace-modal-description" : undefined} tabIndex={-1}>
      <header><div><h2 id="workspace-modal-title">{title}</h2>{description ? <p id="workspace-modal-description">{description}</p> : null}</div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><X size={20} /></button></header>
      <div className="workspace-modal__body">{children}</div>
    </section>
  </div>;
}
