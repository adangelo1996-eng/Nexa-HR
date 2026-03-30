"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { getToken, getSessionUser } from "@/lib/auth-session";
import {
  fetchUserNotifications,
  markUserNotificationRead,
  type UserNotificationDto
} from "@/lib/api";
import { subscribeUserNotifications } from "@/lib/supabase-realtime";

function showToast(message: string): void {
  if (typeof document === "undefined") {
    return;
  }
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.className =
    "fixed bottom-6 right-6 z-[100] max-w-sm rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] px-4 py-3 text-sm text-[var(--prom-text)] shadow-[var(--card-shadow)] opacity-0 translate-y-2 transition-all duration-200";
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.classList.remove("opacity-0", "translate-y-2");
  });
  window.setTimeout(() => {
    el.classList.add("opacity-0", "translate-y-2");
    window.setTimeout(() => el.remove(), 200);
  }, 4200);
}

export function HeaderNotifications(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserNotificationDto[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const list = await fetchUserNotifications(token, 30);
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const user = getSessionUser();
    if (!user?.id) {
      return;
    }
    const { unsubscribe } = subscribeUserNotifications(user.id, (ev) => {
      void refresh();
      if (ev.title) {
        showToast(ev.title);
      }
    });
    return unsubscribe;
  }, [refresh]);

  const unread = items.filter((n) => !n.read).length;

  async function onRead(id: string): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    await markUserNotificationRead(token, id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--prom-line-strong)] text-[var(--prom-text)] transition-[background,opacity] hover:bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)]"
        aria-label="Notifiche"
        title="Notifiche"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-1 w-[min(calc(100vw-2rem),320px)] rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] shadow-[var(--card-shadow)] transition-opacity">
          <div className="max-h-72 overflow-auto py-1">
            {loading ? (
              <p className="px-3 py-2 text-sm text-[var(--prom-muted)]">Caricamento…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[var(--prom-muted)]">Nessuna notifica</p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={`border-b border-[var(--prom-line)] px-3 py-2 text-sm last:border-0 ${
                    n.read ? "opacity-70" : ""
                  }`}
                >
                  <p className="font-medium text-[var(--prom-text)]">{n.title}</p>
                  {n.body ? <p className="mt-0.5 text-xs text-[var(--prom-muted)]">{n.body}</p> : null}
                  {!n.read ? (
                    <button
                      type="button"
                      className="mt-1 text-xs text-[var(--prom-gold)] underline-offset-2 hover:underline"
                      onClick={() => void onRead(n.id)}
                    >
                      Segna letto
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <div className="border-t border-[var(--prom-line)] px-3 py-2">
            <Link
              href="/workflow"
              className="text-xs text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
              onClick={() => setOpen(false)}
            >
              Apri workflow
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
