import { type ReactNode } from "react";
import { Breadcrumb } from "./Breadcrumb";
import { NotificationBell } from "./NotificationBell";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface Props {
  items: BreadcrumbItem[];
  actions?: ReactNode;
}

export function PageHeader({ items, actions }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <Breadcrumb items={items} />
      <div className="flex items-center gap-2 shrink-0">
        {actions}
        <NotificationBell />
      </div>
    </div>
  );
}
