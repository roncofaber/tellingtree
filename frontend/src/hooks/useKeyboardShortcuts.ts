import { useEffect } from "react";

function isTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || (el as HTMLElement).isContentEditable;
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ctrl+K / Cmd+K — focus search input
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          'input[placeholder*="Search"], input[placeholder*="search"], input[placeholder*="Filter"], input[placeholder*="filter"]'
        );
        if (input) { input.focus(); input.select(); }
        return;
      }

      // Escape — clear/blur focused search input, or close notification dropdown
      if (e.key === "Escape") {
        const active = document.activeElement as HTMLInputElement | null;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
          active.blur();
          return;
        }
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
}

// Tab-navigation shortcuts for tree pages — call inside TreeDetailPage
export function useTreeTabShortcuts(navigate: (path: string) => void, base: string) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "g": navigate(`${base}/graph`); break;
        case "p": navigate(`${base}/people`); break;
        case "s": navigate(`${base}/stories`); break;
        case "m": navigate(`${base}/map`); break;
        case "h": navigate(base); break;
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [navigate, base]);
}
