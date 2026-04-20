import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function Sidebar() {
  const { user, logout } = useAuth();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? "bg-accent text-accent-foreground font-medium"
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    }`;

  return (
    <div className="flex flex-col h-full p-4">
      <div className="mb-6">
        <h1 className="text-lg font-bold">TellingTree</h1>
        <p className="text-xs text-muted-foreground">Family stories, preserved</p>
      </div>

      <nav className="flex-1 space-y-1">
        <NavLink to="/dashboard" className={linkClass}>
          Dashboard
        </NavLink>
        <NavLink to="/settings" className={linkClass}>
          Settings
        </NavLink>
      </nav>

      <Separator className="my-4" />

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground truncate">
          {user?.full_name || user?.username}
        </p>
        <Button variant="outline" size="sm" className="w-full" onClick={logout}>
          Log out
        </Button>
      </div>
    </div>
  );
}
