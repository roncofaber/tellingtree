import { Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

interface EditIconProps {
  onClick?: () => void;
  href?: string;
  title?: string;
}

export function EditIcon({ onClick, href, title = "Edit" }: EditIconProps) {
  const cls = "flex items-center justify-center h-7 w-7 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-muted-foreground cursor-pointer";
  if (href) {
    return (
      <Link to={href} className={cls} title={title}>
        <Pencil className="h-3 w-3" />
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={cls} title={title}>
      <Pencil className="h-3 w-3" />
    </button>
  );
}

interface DeleteIconProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

export function DeleteIcon({ onClick, disabled, title = "Delete" }: DeleteIconProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center h-7 w-7 rounded-md border border-destructive/30 bg-destructive/5 hover:bg-destructive/15 transition-colors text-destructive/70 hover:text-destructive disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
      title={title}
    >
      <Trash2 className="h-3 w-3" />
    </button>
  );
}
