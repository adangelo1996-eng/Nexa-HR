"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export type NexaSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type NexaSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: NexaSelectOption[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  "aria-label"?: string;
  id?: string;
};

export function NexaSelect({
  value,
  onChange,
  options,
  placeholder = "Seleziona…",
  className = "",
  buttonClassName = "",
  disabled = false,
  "aria-label": ariaLabel,
  id: idProp
}: NexaSelectProps): React.JSX.Element {
  const autoId = useId();
  const id = idProp ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === value);

  const updateMenuPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setMenuStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 160)
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onScrollOrResize = (): void => updateMenuPosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      const portal = document.getElementById(`nexa-select-menu-${id}`);
      if (portal?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, id]);

  const menu =
    open && menuStyle && typeof document !== "undefined"
      ? createPortal(
          <ul
            id={`nexa-select-menu-${id}`}
            role="listbox"
            className="nexa-select-menu"
            style={{
              position: "fixed",
              top: menuStyle.top,
              left: menuStyle.left,
              width: menuStyle.width,
              zIndex: 320
            }}
          >
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <li key={opt.value || "__empty__"} role="option" aria-selected={active}>
                  <button
                    type="button"
                    disabled={opt.disabled}
                    className={[
                      "nexa-select-menu-item w-full text-left",
                      active ? "nexa-select-menu-item-active" : ""
                    ].join(" ")}
                    onClick={() => {
                      if (opt.disabled) return;
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={["relative", className].filter(Boolean).join(" ")}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          "nexa-select-trigger flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--prom-line)] px-2 py-1.5 text-left text-sm text-[var(--prom-text)]",
          buttonClassName
        ].join(" ")}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown
          className={["h-4 w-4 shrink-0 text-[var(--prom-muted)] transition-transform", open ? "rotate-180" : ""].join(
            " "
          )}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}
