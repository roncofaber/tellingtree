import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  arrayMove, rectSortingStrategy, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { listTrees, createTree } from "@/api/trees";
import { importGedcomStreaming, importZipStreaming, type ImportProgress } from "@/api/imports";
import { queryKeys } from "@/lib/queryKeys";
import { TreePine, Globe, Lock, Pin, LayoutGrid, LayoutList, GripVertical } from "lucide-react";
import { TreeIconPicker, resolveTreeIcon } from "@/components/tree/TreeIconPicker";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Skeleton } from "@/components/common/Skeleton";
import type { Tree } from "@/types/tree";

// ─── Sortable card (grid view) ────────────────────────────────────────────────

function SortableCard({ tree, isPinned, onPin }: { tree: Tree; isPinned: boolean; onPin: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tree.id });
  const TreeIcon = resolveTreeIcon(tree.icon);
  const updated = new Date(tree.updated_at);
  const days = Math.floor((Date.now() - updated.getTime()) / 86400000);
  const updatedLabel = days === 0 ? "Updated today" : days === 1 ? "Updated yesterday" : days < 30 ? `Updated ${days} days ago` : `Updated ${updated.toLocaleDateString()}`;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative group/card ${isDragging ? "opacity-50 z-50" : ""}`}
    >
      <Link to={`/trees/${tree.slug}`}>
        <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer h-full group">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                <TreeIcon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1 pr-12">
                <h3 className="text-base font-semibold leading-tight group-hover:text-primary transition-colors">{tree.name}</h3>
                {tree.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{tree.description}</p>}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {tree.is_public ? <><Globe className="h-3 w-3" /> Public</> : <><Lock className="h-3 w-3" /> Private</>}
              </div>
              <span className="text-xs text-muted-foreground">{updatedLabel}</span>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Drag handle */}
      <button
        {...attributes} {...listeners}
        className="absolute top-3 left-3 z-10 p-1 rounded opacity-0 group-hover/card:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
        title="Drag to reorder"
        onClick={e => e.preventDefault()}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Pin button */}
      <button
        onClick={onPin}
        title={isPinned ? "Unpin tree" : "Pin tree to top"}
        className={`absolute top-3 right-3 z-10 p-1 rounded transition-all ${
          isPinned ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover/card:opacity-100 hover:text-primary"
        }`}
      >
        <Pin className={`h-3.5 w-3.5 ${isPinned ? "fill-current" : ""}`} />
      </button>
    </div>
  );
}

// ─── Sortable row (list view) ─────────────────────────────────────────────────

function SortableRow({ tree, isPinned, onPin }: { tree: Tree; isPinned: boolean; onPin: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tree.id });
  const TreeIcon = resolveTreeIcon(tree.icon);
  const updated = new Date(tree.updated_at);
  const days = Math.floor((Date.now() - updated.getTime()) / 86400000);
  const updatedLabel = days === 0 ? "Today" : days === 1 ? "Yesterday" : days < 30 ? `${days}d ago` : updated.toLocaleDateString();

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group/card ${isDragging ? "opacity-50 bg-muted z-50" : ""}`}
    >
      <button
        {...attributes} {...listeners}
        className="text-muted-foreground opacity-0 group-hover/card:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0"
        title="Drag to reorder"
        onClick={e => e.preventDefault()}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <TreeIcon className="h-4 w-4 text-primary" />
      </div>

      <Link to={`/trees/${tree.slug}`} className="flex-1 min-w-0">
        <p className="text-sm font-medium hover:text-primary transition-colors truncate">{tree.name}</p>
        {tree.description && <p className="text-xs text-muted-foreground truncate">{tree.description}</p>}
      </Link>

      <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
        {tree.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
        <span className="hidden sm:block">{updatedLabel}</span>
        <button
          onClick={onPin}
          title={isPinned ? "Unpin" : "Pin to top"}
          className={`p-1 rounded transition-all ${isPinned ? "text-primary" : "opacity-0 group-hover/card:opacity-100 hover:text-primary"}`}
        >
          <Pin className={`h-3.5 w-3.5 ${isPinned ? "fill-current" : ""}`} />
        </button>
      </div>
    </div>
  );
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, updatePreferences } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTreeName, setNewTreeName] = useState("");
  const [newTreeDescription, setNewTreeDescription] = useState("");
  const [newTreeIcon, setNewTreeIcon] = useState("TreePine");
  const [startFrom, setStartFrom] = useState<"empty" | "gedcom" | "zip">("empty");
  const [gedcomFile, setGedcomFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const gedcomRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  const { data: trees, isLoading, error } = useQuery({
    queryKey: queryKeys.trees.all(),
    queryFn: () => listTrees(0, 100),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const resetDialog = () => {
    setNewTreeName(""); setNewTreeDescription(""); setNewTreeIcon("TreePine");
    setStartFrom("empty"); setGedcomFile(null); setZipFile(null); setImportProgress(null);
  };

  const handleCreate = async () => {
    setCreating(true); setCreateError(null); setImportProgress(null);
    try {
      if (startFrom === "zip") {
        if (!zipFile) { setCreateError("Please select a ZIP backup file."); return; }
        const result = await importZipStreaming(zipFile, newTreeName || undefined, (e) => setImportProgress(e));
        queryClient.invalidateQueries({ queryKey: queryKeys.trees.all() });
        setDialogOpen(false); resetDialog();
        const skipped = result.media_skipped > 0 ? ` (${result.media_skipped} media files skipped)` : "";
        toast.success(`Tree restored: ${result.persons_created} people, ${result.stories_created} stories, ${result.media_imported} media${skipped}`);
        navigate(`/trees/${result.tree_slug}`);
      } else {
        const tree = await createTree({ name: newTreeName, description: newTreeDescription || undefined, icon: newTreeIcon });
        if (startFrom === "gedcom" && gedcomFile) {
          await importGedcomStreaming(tree.id, gedcomFile, (e) => setImportProgress(e));
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.trees.all() });
        setDialogOpen(false); resetDialog();
        toast.success(startFrom === "gedcom" ? "Tree created and data imported" : "Tree created");
        navigate(`/trees/${tree.slug}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setCreateError(msg);
      toast.error(msg);
    } finally { setCreating(false); }
  };

  const pinnedIds = new Set(user?.preferences?.pinned_trees ?? []);
  const dashView = user?.preferences?.dashboard_view ?? "grid";
  const treeOrder = user?.preferences?.tree_order ?? [];

  // Sort: respect saved order, append any new trees at the end
  const sortedTrees = [...(trees?.items ?? [])].sort((a, b) => {
    const ai = treeOrder.indexOf(a.id);
    const bi = treeOrder.indexOf(b.id);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });

  const toggleDashView = async () => {
    const next = dashView === "grid" ? "list" : "grid";
    try { await updatePreferences({ dashboard_view: next }); } catch { /* silent */ }
  };

  const togglePin = async (treeId: string) => {
    const next = pinnedIds.has(treeId)
      ? (user?.preferences?.pinned_trees ?? []).filter(id => id !== treeId)
      : [...(user?.preferences?.pinned_trees ?? []), treeId];
    // Also move to front of tree_order when pinning
    let newOrder = treeOrder.filter(id => id !== treeId);
    if (!pinnedIds.has(treeId)) newOrder = [treeId, ...newOrder];
    try {
      await updatePreferences({ pinned_trees: next, tree_order: newOrder });
    } catch {
      toast.error("Failed to update pin");
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedTrees.findIndex(t => t.id === active.id);
    const newIndex = sortedTrees.findIndex(t => t.id === over.id);
    const newOrder = arrayMove(sortedTrees, oldIndex, newIndex).map(t => t.id);
    try {
      await updatePreferences({ tree_order: newOrder });
    } catch {
      toast.error("Failed to save order");
    }
  };

  if (error)
    return <ErrorMessage message={error instanceof Error ? error.message : "Failed to load trees"} />;

  const treeIds = sortedTrees.map(t => t.id);

  return (
    <div className="h-full overflow-auto">
      <div className="space-y-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Your Trees</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleDashView}
              title={dashView === "grid" ? "Switch to list view" : "Switch to grid view"}
              className="flex items-center justify-center h-8 w-8 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-muted-foreground"
            >
              {dashView === "grid" ? <LayoutList className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </button>
            <Dialog open={dialogOpen} onOpenChange={(o) => { if (!creating) { setDialogOpen(o); if (!o) resetDialog(); } }}>
              <Button onClick={() => setDialogOpen(true)}>+ New Tree</Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a New Tree</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="space-y-4">

                  {/* Start from */}
                  <div className="space-y-2">
                    <Label className="text-xs">Start from</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: "empty",  label: "Empty tree" },
                        { value: "gedcom", label: "GEDCOM (.ged)" },
                        { value: "zip",    label: "Backup (.zip)" },
                      ] as const).map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          disabled={creating}
                          onClick={() => setStartFrom(value)}
                          className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                            startFrom === value
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-input text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Name — optional for ZIP (falls back to backup name) */}
                  <div className="space-y-2">
                    <Label htmlFor="treeName">
                      Name {startFrom === "zip" && <span className="text-muted-foreground font-normal">(optional — defaults to backup name)</span>}
                    </Label>
                    <Input
                      id="treeName"
                      value={newTreeName}
                      onChange={(e) => setNewTreeName(e.target.value)}
                      placeholder={startFrom === "zip" ? "Leave blank to use backup name" : "The Johnson Family"}
                      required={startFrom !== "zip"}
                      disabled={creating}
                    />
                  </div>

                  {/* Description + Icon — only for empty/GEDCOM */}
                  {startFrom !== "zip" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="treeDesc">Description</Label>
                        <Input id="treeDesc" value={newTreeDescription} onChange={(e) => setNewTreeDescription(e.target.value)} placeholder="Our family history and stories" disabled={creating} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Icon</Label>
                        <TreeIconPicker value={newTreeIcon} onChange={setNewTreeIcon} />
                      </div>
                    </>
                  )}

                  {/* GEDCOM file picker */}
                  {startFrom === "gedcom" && (
                    <div className="space-y-2">
                      <Label className="text-xs">GEDCOM file</Label>
                      <input ref={gedcomRef} type="file" accept=".ged,.gedcom" className="hidden" onChange={(e) => { setGedcomFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                      <div className="flex items-center gap-3">
                        <Button type="button" variant="outline" size="sm" onClick={() => gedcomRef.current?.click()} disabled={creating}>Choose file</Button>
                        <span className="text-xs text-muted-foreground truncate">{gedcomFile?.name ?? "No file selected"}</span>
                      </div>
                    </div>
                  )}

                  {/* ZIP file picker */}
                  {startFrom === "zip" && (
                    <div className="space-y-2">
                      <Label className="text-xs">Backup file</Label>
                      <input ref={zipRef} type="file" accept=".zip" className="hidden" onChange={(e) => { setZipFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                      <div className="flex items-center gap-3">
                        <Button type="button" variant="outline" size="sm" onClick={() => zipRef.current?.click()} disabled={creating}>Choose file</Button>
                        <span className="text-xs text-muted-foreground truncate">{zipFile?.name ?? "No file selected"}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">All people, stories, and media will be restored into a new tree.</p>
                    </div>
                  )}

                  {/* Progress */}
                  {creating && importProgress && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {importProgress.phase === "validating"   && "Validating backup..."}
                        {importProgress.phase === "parsing"      && "Parsing file..."}
                        {importProgress.phase === "tags"         && `Restoring tags... ${importProgress.current ?? 0} / ${importProgress.total ?? "?"}`}
                        {importProgress.phase === "persons"      && `Restoring people... ${importProgress.current ?? 0} / ${importProgress.total ?? "?"}`}
                        {importProgress.phase === "relationships" && `Restoring relationships... ${importProgress.current ?? 0} / ${importProgress.total ?? "?"}`}
                        {importProgress.phase === "stories"      && `Restoring stories... ${importProgress.current ?? 0} / ${importProgress.total ?? "?"}`}
                        {importProgress.phase === "media"        && `Restoring media... ${importProgress.current ?? 0} / ${importProgress.total ?? "?"}`}
                        {importProgress.phase === "done"         && "Done!"}
                      </p>
                      {importProgress.total != null && importProgress.current != null && (
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }} />
                        </div>
                      )}
                    </div>
                  )}

                  {createError && <p className="text-sm text-destructive">{createError}</p>}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={creating || (startFrom === "gedcom" && !gedcomFile) || (startFrom === "zip" && !zipFile)}
                  >
                    {creating
                      ? (importProgress ? "Working..." : "Creating...")
                      : startFrom === "gedcom" ? "Create & Import"
                      : startFrom === "zip"    ? "Restore Backup"
                      : "Create Tree"}
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
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={treeIds} strategy={dashView === "grid" ? rectSortingStrategy : verticalListSortingStrategy}>
              {dashView === "list" ? (
                <div className="border rounded-lg divide-y overflow-hidden">
                  {sortedTrees.map((tree) => (
                    <SortableRow
                      key={tree.id}
                      tree={tree}
                      isPinned={pinnedIds.has(tree.id)}
                      onPin={() => togglePin(tree.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {sortedTrees.map((tree) => (
                    <SortableCard
                      key={tree.id}
                      tree={tree}
                      isPinned={pinnedIds.has(tree.id)}
                      onPin={() => togglePin(tree.id)}
                    />
                  ))}
                </div>
              )}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
