import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listTrees, createTree } from "@/api/trees";
import { importGedcomStreaming, type ImportProgress } from "@/api/imports";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";

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
      navigate(`/trees/${tree.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed");
    } finally { setCreating(false); }
  };

  if (isLoading) return <LoadingSpinner />;
  if (error)
    return <ErrorMessage message={error instanceof Error ? error.message : "Failed to load trees"} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your Trees</h1>
        <Dialog open={dialogOpen} onOpenChange={(o) => { if (!creating) setDialogOpen(o); }}>
          <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            New Tree
          </DialogTrigger>
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
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
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

      {trees?.items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No trees yet. Create your first family tree to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {trees?.items.map((tree) => (
            <Link key={tree.id} to={`/trees/${tree.id}`}>
              <Card className="hover:border-primary transition-colors cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-lg">{tree.name}</CardTitle>
                </CardHeader>
                {tree.description && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {tree.description}
                    </p>
                  </CardContent>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
