"use client";

import { X } from "lucide-react";
import { useEffect, useId } from "react";
import { classes } from "@/lib/classes";

export function Modal({
  title,
  children,
  onClose,
  className,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={classes(
          "max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border bg-background shadow-2xl sm:max-w-2xl sm:rounded-2xl",
          className,
        )}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-3 sm:px-5">
          <h2 id={titleId} className="font-semibold">{title}</h2>
          <button type="button" aria-label="Fechar" onClick={onClose} className="focus-ring rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
