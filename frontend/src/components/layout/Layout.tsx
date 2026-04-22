import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { Sidebar } from "./Sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
export function Layout() {
  const [open, setOpen] = useState(false);
  useKeyboardShortcuts();

  return (
    <div className="flex h-screen">
      <aside className="hidden md:flex md:w-64 border-r bg-card">
        <Sidebar />
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="md:hidden flex items-center gap-2 p-4 border-b">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
              Menu
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <Sidebar />
            </SheetContent>
          </Sheet>
          <span className="font-bold">TellingTree</span>
        </header>

        <main className="flex-1 overflow-auto p-3 sm:p-6">
          <Outlet />
        </main>
      </div>
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
