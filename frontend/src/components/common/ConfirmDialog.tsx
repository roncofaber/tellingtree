import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  isPending?: boolean;
}

export function ConfirmDialog({
  open, onClose, onConfirm,
  title = "Are you sure?",
  message = "This action cannot be undone.",
  confirmLabel = "Delete",
  destructive = true,
  isPending = false,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            size="sm"
            onClick={() => { onConfirm(); onClose(); }}
            disabled={isPending}
          >
            {isPending ? "…" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
