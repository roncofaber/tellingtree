import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { listNotifications, getUnreadCount, markRead, markAllRead, type Notification } from "@/api/notifications";

export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { data: countData } = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: () => getUnreadCount(),
    refetchInterval: 30000,
  });

  const { data: notifications } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => listNotifications(false, 20),
    enabled: open,
  });

  const markReadMut = useMutation({
    mutationFn: (id: string) => markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllMut = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unread = countData?.count ?? 0;

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  const handleClick = (n: Notification) => {
    if (!n.read_at) markReadMut.mutate(n.id);
    setOpen(false);
    // Navigate based on entity type — we don't know the tree slug here,
    // so just close the dropdown. The message gives context.
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center h-8 w-8 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full bg-destructive text-[10px] font-bold text-white flex items-center justify-center px-1">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full mt-2 right-0 z-50 w-80 rounded-lg border bg-popover shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button onClick={() => markAllMut.mutate()} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Check className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {!notifications || notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No notifications</p>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted ${!n.read_at ? "bg-primary/5" : ""}`}
                >
                  {!n.read_at && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />}
                  <div className={`min-w-0 flex-1 ${n.read_at ? "pl-3.5" : ""}`}>
                    <p className={`leading-tight ${!n.read_at ? "font-medium" : "text-muted-foreground"}`}>{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
