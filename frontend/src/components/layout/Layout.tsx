import { useCallback, useState } from "react";
import { Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { Sidebar } from "./Sidebar";
import { NotificationBell } from "@/components/common/NotificationBell";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { Menu } from "lucide-react";

export function Layout() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem("sidebar-collapsed") === "true"
  );
  useKeyboardShortcuts();

  const handleToggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  return (
    <div className="flex h-screen">
      <aside className={`hidden md:flex border-r bg-card shrink-0 transition-[width] duration-200 ease-in-out overflow-hidden ${collapsed ? "md:w-14" : "md:w-64"}`}>
        <Sidebar collapsed={collapsed} onToggle={handleToggle} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger className="flex items-center justify-center h-8 w-8 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
                <Menu className="h-4 w-4" />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 overflow-hidden">
                <Sidebar collapsed={false} />
              </SheetContent>
            </Sheet>
            <span className="font-bold text-sm">TellingTree</span>
          </div>
          <NotificationBell />
        </header>

        <main className="flex-1 overflow-hidden animate-fade-in">
          <div className="h-full w-full p-3 sm:p-6 flex flex-col">
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
