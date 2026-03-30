import { getSupabaseBrowserClient } from "@/lib/supabase";

export function subscribePostgresTable(
  table: string,
  onEvent: () => void
): { unsubscribe: () => void } {
  const client = getSupabaseBrowserClient();
  if (!client) {
    return { unsubscribe: () => {} };
  }
  const channel = client
    .channel(`table:${table}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => {
        onEvent();
      }
    )
    .subscribe();
  return {
    unsubscribe: (): void => {
      void client.removeChannel(channel);
    }
  };
}

export function subscribeUserNotifications(
  userId: string,
  onEvent: (payload: { title?: string }) => void
): { unsubscribe: () => void } {
  const client = getSupabaseBrowserClient();
  if (!client || !userId) {
    return { unsubscribe: () => {} };
  }
  const channel = client
    .channel(`user_notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "user_notifications",
        filter: `"userId"=eq.${userId}`
      },
      (payload) => {
        const row = payload.new as { title?: string } | null;
        onEvent({ title: row?.title });
      }
    )
    .subscribe();

  return {
    unsubscribe: (): void => {
      void client.removeChannel(channel);
    }
  };
}
