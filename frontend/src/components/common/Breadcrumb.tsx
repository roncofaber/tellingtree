import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const navigate = useNavigate();

  return (
    <nav className="flex items-center gap-1.5 min-w-0">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center justify-center h-8 w-8 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        title="Go back"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 min-w-0">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />}
            {i === 0 && items.length > 1 && item.href ? (
              <Link to={item.href} className="text-muted-foreground hover:text-foreground transition-colors shrink-0" title={item.label}>
                <Home className="h-4 w-4" />
              </Link>
            ) : item.href ? (
              <Link
                to={item.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate max-w-[150px]"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-sm font-medium text-foreground truncate max-w-[220px]">{item.label}</span>
            )}
          </span>
        ))}
      </div>
    </nav>
  );
}
