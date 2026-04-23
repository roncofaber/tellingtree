import { useCallback, useState } from "react";
import { Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { Sidebar } from "./Sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

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
        <header className="md:hidden flex items-center gap-2 p-4 border-b">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
              Menu
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <Sidebar collapsed={false} />
            </SheetContent>
          </Sheet>
          <span className="font-bold">TellingTree</span>
        </header>

        <main className="flex-1 overflow-auto p-3 sm:p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
