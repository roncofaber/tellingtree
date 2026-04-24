import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { listNotifications, markAllRead, markRead, type Notification } from "@/api/notifications";
import { listTrees } from "@/api/trees";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { PageHeader } from "@/components/common/PageHeader";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["notifications", "all"],
    queryFn: () => listNotifications(false, 100),
  });

  const { data: trees } = useQuery({
    queryKey: queryKeys.trees.all(),
    queryFn: () => listTrees(),
    staleTime: 60_000,
  });

  const markReadMut = useMutation({
    mutationFn: (id: string) => markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllMut = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const handleClick = (n: Notification) => {
    if (!n.read_at) markReadMut.mutate(n.id);
    const slug = trees?.items?.find((t: { id: string; slug: string }) => t.id === n.tree_id)?.slug;
    if (!slug || !n.entity_id) return;
    if (n.entity_type === "person") navigate(`/trees/${slug}/people/${n.entity_id}`);
    else if (n.entity_type === "story") navigate(`/trees/${slug}/stories/${n.entity_id}`);
  };

  const unreadCount = (notifications ?? []).filter(n => !n.read_at).length;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto w-full space-y-4">
        <PageHeader items={[{ label: "Notifications" }]} />

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => markAllMut.mutate()} disabled={markAllMut.isPending}>
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Mark all read
            </Button>
          )}
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : !notifications?.length ? (
          <div className="border rounded-lg py-16 text-center text-muted-foreground text-sm">
            No notifications yet.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden divide-y">
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`flex w-full items-start gap-3 px-4 py-3.5 text-left text-sm transition-colors hover:bg-muted ${!n.read_at ? "bg-primary/5" : ""}`}
              >
                {!n.read_at && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                <div className={`min-w-0 flex-1 ${n.read_at ? "pl-5" : ""}`}>
                  <p className={`leading-snug ${!n.read_at ? "font-medium" : "text-muted-foreground"}`}>{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <button
                    onClick={e => { e.stopPropagation(); markReadMut.mutate(n.id); }}
                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                    title="Mark as read"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
