import { useEffect } from "react";

export function useKeyboardShortcuts() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Cmd+K or Ctrl+K — focus first visible search input
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          'input[placeholder*="Search"], input[placeholder*="search"], input[placeholder*="Filter"], input[placeholder*="filter"]'
        );
        if (input) {
          input.focus();
          input.select();
        }
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
}
