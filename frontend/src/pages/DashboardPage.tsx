import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listTrees, createTree } from "@/api/trees";
import { importGedcomStreaming, type ImportProgress } from "@/api/imports";
import { queryKeys } from "@/lib/queryKeys";
import { TreePine, Globe, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { NotificationBell } from "@/components/common/NotificationBell";
import { Skeleton } from "@/components/common/Skeleton";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTreeName, setNewTreeName] = useState("");
  const [newTreeDescription, setNewTreeDescription] = useState("");
  const [gedcomFile, setGedcomFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const gedcomRef = useRef<HTMLInputElement>(null);

  const {
    data: trees,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.trees.all(),
    queryFn: () => listTrees(0, 100),
  });

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true); setCreateError(null); setImportProgress(null);
    try {
      const tree = await createTree({ name: newTreeName, description: newTreeDescription || undefined });
      if (gedcomFile) {
        await importGedcomStreaming(tree.id, gedcomFile, (event) => {
          setImportProgress(event);
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.trees.all() });
      setDialogOpen(false);
      setNewTreeName(""); setNewTreeDescription(""); setGedcomFile(null); setImportProgress(null);
      toast.success(gedcomFile ? "Tree created and data imported" : "Tree created");
      navigate(`/trees/${tree.slug}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setCreateError(msg);
      toast.error(msg);
    } finally { setCreating(false); }
  };

  if (error)
    return <ErrorMessage message={error instanceof Error ? error.message : "Failed to load trees"} />;

  return (
    <div className="h-full overflow-auto">
    <div className="space-y-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Your Trees</h1>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Dialog open={dialogOpen} onOpenChange={(o) => { if (!creating) setDialogOpen(o); }}>
            <Button onClick={() => setDialogOpen(true)}>+ New Tree</Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a New Tree</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); handleCreate(); }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="treeName">Name</Label>
                <Input
                  id="treeName"
                  value={newTreeName}
                  onChange={(e) => setNewTreeName(e.target.value)}
                  placeholder="The Johnson Family"
                  required
                  disabled={creating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="treeDesc">Description</Label>
                <Input
                  id="treeDesc"
                  value={newTreeDescription}
                  onChange={(e) => setNewTreeDescription(e.target.value)}
                  placeholder="Our family history and stories"
                  disabled={creating}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Import GEDCOM <span className="text-muted-foreground">(optional)</span></Label>
                <input ref={gedcomRef} type="file" accept=".ged,.gedcom" className="hidden"
                  onChange={(e) => setGedcomFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => gedcomRef.current?.click()} disabled={creating}>
                    Choose file
                  </Button>
                  <span className="text-xs text-muted-foreground truncate">{gedcomFile?.name ?? "No file selected"}</span>
                </div>
              </div>
              {creating && importProgress && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {importProgress.phase === "parsing" && "Parsing file..."}
                    {importProgress.phase === "persons" && `Importing people... ${importProgress.current ?? 0} / ${importProgress.total ?? "?"}`}
                    {importProgress.phase === "relationships" && `Creating relationships... ${importProgress.current ?? 0} / ${importProgress.total ?? "?"}`}
                    {importProgress.phase === "done" && "Done!"}
                  </p>
                  {importProgress.total && importProgress.current !== undefined && (
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }} />
                    </div>
                  )}
                </div>
              )}
              {createError && <p className="text-sm text-destructive">{createError}</p>}
              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? (importProgress ? "Importing..." : "Creating...") : gedcomFile ? "Create & Import" : "Create Tree"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : trees?.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <TreePine className="h-14 w-14 text-muted-foreground/20" />
          <div>
            <h2 className="text-lg font-semibold mb-1">No family trees yet</h2>
            <p className="text-sm text-muted-foreground max-w-sm">Create your first family tree to start preserving your family's stories, photos, and memories.</p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>Create your first tree</Button>
        </div>
      ) : isLoading ? null : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trees?.items.map((tree) => {
            const updated = new Date(tree.updated_at);
            const daysSinceUpdate = Math.floor((Date.now() - updated.getTime()) / 86400000);
            const updatedLabel = daysSinceUpdate === 0 ? "Updated today" : daysSinceUpdate === 1 ? "Updated yesterday" : daysSinceUpdate < 30 ? `Updated ${daysSinceUpdate} days ago` : `Updated ${updated.toLocaleDateString()}`;

            return (
              <Link key={tree.id} to={`/trees/${tree.slug}`}>
                <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer h-full group">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                        <TreePine className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-semibold leading-tight group-hover:text-primary transition-colors">{tree.name}</h3>
                        {tree.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{tree.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {tree.is_public
                          ? <><Globe className="h-3 w-3" /> Public</>
                          : <><Lock className="h-3 w-3" /> Private</>
                        }
                      </div>
                      <span className="text-xs text-muted-foreground">{updatedLabel}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}
