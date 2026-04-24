import { useState } from "react";
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Settings, TreePine, Plus, LogOut, Search, Sun, Moon, PanelLeftClose, PanelLeftOpen, ChevronsUpDown, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { listTrees } from "@/api/trees";
import { queryKeys } from "@/lib/queryKeys";
import { setTheme } from "@/lib/theme";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { UserAvatar, userInitials } from "@/components/common/UserAvatar";

interface Props {
  collapsed: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed, onToggle }: Props) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [treeSearch, setTreeSearch] = useState("");
  const [themeState, setThemeState] = useState(() =>
    document.documentElement.classList.contains("dark") ? "dark" as const : "light" as const
  );

  const { data: trees } = useQuery({
    queryKey: queryKeys.trees.all(),
    queryFn: () => listTrees(0, 100),
  });

  const initials = userInitials(user?.full_name, user?.username);

  const c = collapsed;

  return (
    <div className="flex flex-col h-full py-4 w-full overflow-hidden">

      {/* Brand */}
      <div className={`px-3 mb-4 ${c ? "flex justify-center" : ""}`}>
        <div className="flex items-center gap-2">
          <Link to="/dashboard" title="Dashboard">
            <TreePine className="h-5 w-5 text-primary shrink-0" />
          </Link>
          {!c && <span className="font-bold text-base flex-1 whitespace-nowrap">TellingTree</span>}
          {onToggle && (
            <button onClick={onToggle} title={c ? "Expand sidebar" : "Collapse sidebar"}
              className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0">
              {c ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        {!c && <p className="text-xs text-muted-foreground mt-0.5 ml-7 whitespace-nowrap">Family stories, preserved</p>}
      </div>

      {/* Dashboard */}
      <div className={c ? "px-1 flex justify-center" : "px-3"}>
        <NavLink to="/dashboard" title="Dashboard" className={({ isActive }) =>
          `flex items-center ${c ? "justify-center h-8 w-8" : "gap-2.5 px-3 py-2"} rounded-md text-sm transition-colors ${
            isActive ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          }`
        }>
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          {!c && <span className="whitespace-nowrap">Dashboard</span>}
        </NavLink>
      </div>

      <Separator className={`my-3 ${c ? "mx-2" : ""}`} />

      {/* Trees */}
      <div className={`flex-1 overflow-y-auto min-h-0 ${c ? "px-1 flex flex-col items-center" : "px-3"}`}>
        {!c && (
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">My Trees</span>
            <Link to="/dashboard" title="Create new tree"
              className="flex items-center justify-center h-5 w-5 rounded hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors">
              <Plus className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {!c && (trees?.items.length ?? 0) > 5 && (
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

        <div className={c ? "flex flex-col items-center gap-0.5" : "space-y-0.5"}>
          {!c && trees?.items.length === 0 && (
            <p className="text-xs text-muted-foreground px-1 py-1 italic">No trees yet.</p>
          )}
          {(trees?.items ?? [])
            .filter(t => !treeSearch || t.name.toLowerCase().includes(treeSearch.toLowerCase()))
            .map((tree) => {
              const active = location.pathname.startsWith(`/trees/${tree.slug}`);
              return (
                <Link key={tree.id} to={`/trees/${tree.slug}`} title={c ? tree.name : undefined}
                  className={`flex items-center ${c ? "justify-center h-8 w-8" : "gap-2.5 px-3 py-1.5"} rounded-md text-sm transition-colors ${
                    active ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <TreePine className={`h-3.5 w-3.5 shrink-0 ${c ? "" : "opacity-60"}`} />
                  {!c && <span className="truncate">{tree.name}</span>}
                </Link>
              );
            })}
        </div>
      </div>

      <Separator className={`my-3 ${c ? "mx-2" : ""}`} />

      {/* Admin link (superadmins only) */}
      {user?.is_superadmin && (
        <div className={`mb-1 ${c ? "px-1 flex justify-center" : "px-3"}`}>
          <NavLink to="/admin" title="Admin" className={({ isActive }) =>
            `flex items-center ${c ? "justify-center h-8 w-8" : "gap-2.5 px-3 py-2"} rounded-md text-sm transition-colors ${
              isActive ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`
          }>
            <Shield className="h-4 w-4 shrink-0" />
            {!c && <span className="whitespace-nowrap">Admin</span>}
          </NavLink>
        </div>
      )}

      {/* Account chip (dropdown) + theme toggle */}
      <div className={`${c ? "px-1 flex flex-col items-center gap-1.5 mb-3" : "px-3 mb-4 flex items-center gap-1.5"}`}>
        <DropdownMenu>
          <DropdownMenuTrigger
            title={c ? (user?.full_name || user?.username || "Account") : undefined}
            className={`flex items-center ${c ? "justify-center h-9 w-9" : "gap-2.5 px-2 py-1.5 flex-1 min-w-0"} rounded-md hover:bg-accent text-foreground transition-colors`}
          >
            {user && (
              <UserAvatar
                userId={user.id}
                hasAvatar={user.has_avatar}
                initials={initials}
                size={c ? 28 : 32}
              />
            )}
            {!c && (
              <>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium leading-tight truncate whitespace-nowrap">
                    {user?.full_name || user?.username}
                  </p>
                  {user?.full_name && (
                    <p className="text-xs text-muted-foreground leading-tight truncate whitespace-nowrap">@{user.username}</p>
                  )}
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent side={c ? "right" : "top"} align="start" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-0.5">
                  <p className="text-sm font-medium truncate">{user?.full_name || user?.username}</p>
                  {user?.email && (
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  )}
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {user?.is_superadmin && (
              <DropdownMenuItem onClick={() => navigate("/admin")}>
                <Shield className="h-4 w-4 mr-2" />
                Admin
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={() => {
            const isDark = document.documentElement.classList.contains("dark");
            const next = isDark ? "light" : "dark";
            setTheme(next);
            setThemeState(next);
          }}
          title={`Switch to ${themeState === "dark" ? "light" : "dark"} mode`}
          className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors shrink-0"
        >
          {themeState === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
