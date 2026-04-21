import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />}
          {item.href ? (
            <Link
              to={item.href}
              className={`hover:text-foreground transition-colors truncate${i === 0 ? " font-medium shrink-0" : ""}`}
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground truncate">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
