import { useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTree, updateTree, deleteTree } from "@/api/trees";
import { listPersons } from "@/api/persons";
import { importGedcomStreaming, type ImportResult, type ImportProgress } from "@/api/imports";
import { queryKeys } from "@/lib/queryKeys";
import { loadGraphSettings, saveGraphSettings } from "@/lib/graphSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { MembersTab } from "@/components/tree/MembersTab";

export function TreeManagePage() {
  const { treeId }    = useParams<{ treeId: string }>();
  const navigate      = useNavigate();
  const queryClient   = useQueryClient();

  // Edit form
  const [name, setName]           = useState("");
  const [desc, setDesc]           = useState("");
  const [editMode, setEditMode]   = useState(false);

  // GEDCOM import
  const [importOpen,     setImportOpen]     = useState(false);
  const [importing,      setImporting]      = useState(false);
  const [importResult,   setImportResult]   = useState<ImportResult | null>(null);
  const [importError,    setImportError]    = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [selectedFile,   setSelectedFile]   = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Graph settings (localStorage)
  const [graphSettings, setGraphSettings] = useState(() => loadGraphSettings(treeId ?? ""));
  const [rootSearch, setRootSearch] = useState("");

  const { data: tree, isLoading } = useQuery({
    queryKey: queryKeys.trees.detail(treeId!),
    queryFn:  () => getTree(treeId!),
    enabled:  !!treeId,
  });

  const { data: personsData } = useQuery({
    queryKey: queryKeys.persons.full(treeId!),
    queryFn:  () => listPersons(treeId!, 0, 50000),
    enabled:  !!treeId,
  });

  const updateMut = useMutation({
    mutationFn: () => updateTree(treeId!, { name, description: desc || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trees.detail(treeId!) });
      setEditMode(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteTree(treeId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trees.all() });
      navigate("/dashboard");
    },
  });

  const startEdit = () => {
    setName(tree?.name ?? "");
    setDesc(tree?.description ?? "");
    setEditMode(true);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true); setImportResult(null); setImportError(null); setImportProgress(null);
    try {
      const result = await importGedcomStreaming(treeId!, selectedFile, (event) => {
        setImportProgress(event);
      });
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.all(treeId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.all(treeId!) });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally { setImporting(false); }
  };

  const resetImport = () => {
    setImportResult(null); setImportError(null); setImportProgress(null); setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <Link to={`/trees/${treeId}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to tree
        </Link>
        <h1 className="text-2xl font-bold mt-1">{tree?.name} — Settings</h1>
      </div>

      {/* Tree details */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Tree details</CardTitle>
            {!editMode && <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {editMode ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
              </div>
              {updateMut.error && (
                <p className="text-sm text-destructive">
                  {updateMut.error instanceof Error ? updateMut.error.message : "Failed to save"}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={updateMut.isPending} onClick={() => updateMut.mutate()}>
                  {updateMut.isPending ? "Saving…" : "Save"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Name:</span> {tree?.name}</p>
              {tree?.description && <p><span className="text-muted-foreground">Description:</span> {tree.description}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader><CardTitle className="text-base">Members</CardTitle></CardHeader>
        <CardContent>
          <MembersTab treeId={treeId!} />
        </CardContent>
      </Card>

      {/* Import */}
      <Card>
        <CardHeader><CardTitle className="text-base">Import</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Import people and relationships from a GEDCOM file exported by Heredis, Gramps, Ancestry, or any GEDCOM 5.5.1-compatible software.
          </p>
          <Button variant="outline" onClick={() => { resetImport(); setImportOpen(true); }}>
            Import GEDCOM file…
          </Button>
        </CardContent>
      </Card>

      {/* Graph settings */}
      <Card>
        <CardHeader><CardTitle className="text-base">Graph settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Default center person</Label>
            <p className="text-xs text-muted-foreground">The graph will open centered on this person.</p>
            <Input
              placeholder="Search by name…"
              value={rootSearch}
              onChange={e => setRootSearch(e.target.value)}
              className="h-8 w-56"
            />
            {rootSearch && (
              <ul className="border rounded-md max-h-40 overflow-y-auto text-sm">
                {(personsData?.items ?? [])
                  .filter(p => [p.given_name, p.family_name].join(" ").toLowerCase().includes(rootSearch.toLowerCase()))
                  .slice(0, 8)
                  .map(p => {
                    const name = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
                    const isSelected = graphSettings.defaultRootPersonId === p.id;
                    return (
                      <li key={p.id}
                        className={`px-3 py-2 cursor-pointer hover:bg-muted flex items-center justify-between ${isSelected ? "bg-primary/10 font-medium" : ""}`}
                        onClick={() => {
                          const updated = { ...graphSettings, defaultRootPersonId: p.id };
                          setGraphSettings(updated);
                          saveGraphSettings(treeId!, updated);
                          setRootSearch("");
                        }}
                      >
                        <span>{name}</span>
                        {isSelected && <span className="text-xs text-primary">✓ selected</span>}
                      </li>
                    );
                  })}
              </ul>
            )}
            {graphSettings.defaultRootPersonId && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Current: {(() => {
                    const p = personsData?.items.find(p => p.id === graphSettings.defaultRootPersonId);
                    return p ? [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed" : graphSettings.defaultRootPersonId?.slice(0,8);
                  })()}
                </span>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => {
                  const updated = { ...graphSettings, defaultRootPersonId: null };
                  setGraphSettings(updated); saveGraphSettings(treeId!, updated);
                }}>Clear</Button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Default depth (0 = unlimited)</Label>
            <p className="text-xs text-muted-foreground">Show only connections within N relationship hops from the center person.</p>
            <div className="flex items-center gap-2">
              {[0,1,2,3,4,5,6].map(d => (
                <button key={d}
                  className={`w-8 h-8 rounded text-sm font-medium transition-colors ${graphSettings.maxDepth===d?"bg-primary text-primary-foreground":"bg-muted hover:bg-muted/80"}`}
                  onClick={() => {
                    const updated = { ...graphSettings, maxDepth: d };
                    setGraphSettings(updated); saveGraphSettings(treeId!, updated);
                  }}
                >{d===0?"∞":d}</button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/40">
        <CardHeader><CardTitle className="text-base text-destructive">Danger zone</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Permanently delete this tree and all its people, relationships, stories, and media.
          </p>
          <Button variant="destructive" size="sm" className="shrink-0 ml-4" onClick={() => setDeleteOpen(true)}>
            Delete tree
          </Button>
        </CardContent>
      </Card>

      {/* Import dialog */}
      <Dialog open={importOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Import GEDCOM</DialogTitle>
              {!importing && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => { setImportOpen(false); resetImport(); }}>
                  <span className="sr-only">Close</span>&times;
                </Button>
              )}
            </div>
          </DialogHeader>

          {importResult ? (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">People added</span><span className="font-semibold">{importResult.persons_created}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Relationships added</span><span className="font-semibold">{importResult.relationships_created}</span></div>
                {importResult.skipped > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Skipped</span><span className="font-semibold">{importResult.skipped}</span></div>}
                {importResult.duplicates_skipped > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Duplicates skipped</span><span className="font-semibold">{importResult.duplicates_skipped}</span></div>}
              </div>
              {importResult.errors.length > 0 && (
                <div className="text-xs text-destructive space-y-1 max-h-32 overflow-y-auto">
                  {importResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <Button className="w-full" onClick={() => { setImportOpen(false); resetImport(); }}>Done</Button>
            </div>
          ) : importing && importProgress ? (
            <div className="space-y-4 py-2">
              <p className="text-sm font-medium">
                {importProgress.phase === "parsing" && "Parsing file..."}
                {importProgress.phase === "persons" && `Importing people... ${importProgress.current ?? 0} / ${importProgress.total ?? "?"}`}
                {importProgress.phase === "relationships" && `Creating relationships... ${importProgress.current ?? 0} / ${importProgress.total ?? "?"}`}
              </p>
              {importProgress.total && importProgress.current !== undefined && (
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }}
                  />
                </div>
              )}
              {importError && <p className="text-sm text-destructive">{importError}</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Select a <code>.ged</code> file to import.</p>
              <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                Duplicate detection is enabled. People with matching names and dates will be reused instead of duplicated.
              </p>
              <input ref={fileRef} type="file" accept=".ged,.gedcom" className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => fileRef.current?.click()}>Choose file</Button>
                <span className="text-sm text-muted-foreground truncate">{selectedFile?.name ?? "No file selected"}</span>
              </div>
              {importError && <p className="text-sm text-destructive">{importError}</p>}
              <Button className="w-full" onClick={handleImport} disabled={!selectedFile}>Import</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete "{tree?.name}"?</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will permanently delete the tree and <strong>all its data</strong> — every person, relationship, story, and media file. This cannot be undone.
            </p>
            {deleteMut.error && (
              <p className="text-sm text-destructive">
                {deleteMut.error instanceof Error ? deleteMut.error.message : "Failed to delete"}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="destructive" className="flex-1" disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate()}
              >
                {deleteMut.isPending ? "Deleting…" : "Yes, delete everything"}
              </Button>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
