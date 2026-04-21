import { useMemo, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Settings, TreePine, Plus, LogOut, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { listTrees } from "@/api/trees";
import { queryKeys } from "@/lib/queryKeys";
import { Separator } from "@/components/ui/separator";

export function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [treeSearch, setTreeSearch] = useState("");

  const { data: trees } = useQuery({
    queryKey: queryKeys.trees.all(),
    queryFn: () => listTrees(0, 100),
  });

  const navItem = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? "bg-accent text-accent-foreground font-medium"
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    }`;

  const treeItem = (treeId: string) => {
    const active = location.pathname.startsWith(`/trees/${treeId}`);
    return `flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
      active
        ? "bg-accent text-accent-foreground font-medium"
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    }`;
  };

  const initials = (
    user?.full_name?.split(" ").map((w) => w[0]).join("").slice(0, 2) ||
    user?.username?.slice(0, 2) ||
    "?"
  ).toUpperCase();

  return (
    <div className="flex flex-col h-full py-4 w-full">

      {/* Brand */}
      <div className="px-4 mb-5">
        <div className="flex items-center gap-2">
          <TreePine className="h-5 w-5 text-primary shrink-0" />
          <span className="font-bold text-base">TellingTree</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 ml-7">Family stories, preserved</p>
      </div>

      {/* Main nav */}
      <div className="px-3">
        <NavLink to="/dashboard" className={navItem}>
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Dashboard
        </NavLink>
      </div>

      <Separator className="my-4" />

      {/* Trees */}
      <div className="flex-1 overflow-y-auto px-3 min-h-0">
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            My Trees
          </span>
          <Link
            to="/dashboard"
            title="Create new tree"
            className="flex items-center justify-center h-5 w-5 rounded hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </Link>
        </div>

        {(trees?.items.length ?? 0) > 5 && (
          <div className="relative mb-1.5">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter trees…"
              value={treeSearch}
              onChange={e => setTreeSearch(e.target.value)}
              className="w-full h-7 pl-6 pr-2 text-xs rounded-md border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}
        <div className="space-y-0.5">
          {trees?.items.length === 0 && (
            <p className="text-xs text-muted-foreground px-1 py-1 italic">No trees yet.</p>
          )}
          {(trees?.items ?? [])
            .filter(t => !treeSearch || t.name.toLowerCase().includes(treeSearch.toLowerCase()))
            .map((tree) => (
            <Link key={tree.id} to={`/trees/${tree.id}`} className={treeItem(tree.id)}>
              <TreePine className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <span className="truncate">{tree.name}</span>
            </Link>
          ))}
        </div>
      </div>

      <Separator className="my-4" />

      {/* Settings */}
      <div className="px-3 mb-4">
        <NavLink to="/settings" className={navItem}>
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </NavLink>
      </div>

      {/* User footer */}
      <div className="px-4 flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0 select-none">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight truncate">
            {user?.full_name || user?.username}
          </p>
          {user?.full_name && (
            <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
          )}
        </div>
        <button
          onClick={logout}
          title="Log out"
          className="flex items-center justify-center h-7 w-7 rounded hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors shrink-0"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
