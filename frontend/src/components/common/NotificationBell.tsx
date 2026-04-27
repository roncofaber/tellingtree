import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { Bell, Check } from "lucide-react";
import { listNotifications, getUnreadCount, markRead, markAllRead, type Notification } from "@/api/notifications";
import { listTrees } from "@/api/trees";
import { queryKeys } from "@/lib/queryKeys";

interface Props {
  variant?: "default" | "sidebar";
}

export function NotificationBell({ variant = "default" }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const { data: trees } = useQuery({
    queryKey: queryKeys.trees.all(),
    queryFn: () => listTrees(),
    staleTime: 60_000,
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const inButton = buttonRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inButton && !inDropdown) setOpen(false);
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
    return `${Math.floor(hrs / 24)}d`;
  };

  const handleNotificationClick = (n: Notification) => {
    if (!n.read_at) markReadMut.mutate(n.id);
    setOpen(false);
    if (!n.tree_id) {
      if (n.type === "user_pending_approval") navigate("/admin");
      else if (n.type === "account_approved") navigate("/dashboard");
      return;
    }
    const slug = trees?.items?.find(t => t.id === n.tree_id)?.slug;
    if (!slug || !n.entity_id) return;
    if (n.entity_type === "person") navigate(`/trees/${slug}/people/${n.entity_id}`);
    else if (n.entity_type === "story") navigate(`/trees/${slug}/stories/${n.entity_id}`);
  };

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const estimatedHeight = 400;
      const spaceBelow = window.innerHeight - rect.bottom;
      const style: React.CSSProperties = { position: "fixed", zIndex: 9999, width: 320 };

      if (variant === "sidebar") {
        style.left = rect.right + 8;
        if (spaceBelow < estimatedHeight) {
          style.bottom = window.innerHeight - rect.bottom;
        } else {
          style.top = rect.top;
        }
      } else {
        style.right = window.innerWidth - rect.right;
        if (spaceBelow < estimatedHeight) {
          style.bottom = window.innerHeight - rect.top + 8;
        } else {
          style.top = rect.bottom + 8;
        }
      }
      setDropdownStyle(style);
    }
    setOpen(o => !o);
  };

  const buttonClass = variant === "sidebar"
    ? "relative flex items-center justify-center h-9 w-9 rounded-md text-sm transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    : "relative flex items-center justify-center h-9 w-9 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors";

  const dropdown = open ? (
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className="max-w-[calc(100vw-1rem)] rounded-lg border bg-popover shadow-lg overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-semibold">Notifications</span>
        {unread > 0 && (
          <button onClick={() => markAllMut.mutate()} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Check className="h-3 w-3" /> Mark all read
          </button>
        )}
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        {notifications === undefined ? (
          <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No notifications</p>
        ) : (
          notifications.map(n => (
            <button
              key={n.id}
              onClick={() => handleNotificationClick(n)}
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
      <Link
        to="/notifications"
        onClick={() => setOpen(false)}
        className="block text-center text-xs text-primary hover:underline py-2 border-t"
      >
        View all notifications
      </Link>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={buttonClass}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full bg-destructive text-[10px] font-bold text-white flex items-center justify-center px-1">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {createPortal(dropdown, document.body)}
    </>
  );
}
