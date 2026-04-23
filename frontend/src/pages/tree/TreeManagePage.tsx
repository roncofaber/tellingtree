import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getTree, updateTree, deleteTree } from "@/api/trees";
import { resetTreeGeocoding } from "@/api/places";
import { listPersons } from "@/api/persons";
import { importGedcomStreaming, type ImportResult, type ImportProgress } from "@/api/imports";
import { queryKeys } from "@/lib/queryKeys";
import { loadGraphSettings, saveGraphSettings, getResolvedStyle, getResolvedLayout, applyGraphStyle, buildCardHtml, type GraphStyle, type GraphLayout } from "@/lib/graphSettings";
import * as f3 from "family-chart";
import "family-chart/styles/family-chart.css";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { MembersTab } from "@/components/tree/MembersTab";
import { TrashTab } from "@/components/tree/TrashTab";
import { PlacesManageTab } from "@/components/tree/PlacesManageTab";
import { RelationshipsTab } from "@/components/tree/RelationshipsTab";
import { TreeHealthTab } from "@/components/tree/TreeHealthTab";

const PREVIEW_DATA: f3.Data = [
  { id: "gf", data: { gender: "M", _gender: "male", "first name": "James", "last name": "Smith", nickname: "", birthday: "1935–2010" }, rels: { spouses: ["gm"], children: ["dad", "aunt"], parents: [] } },
  { id: "gm", data: { gender: "F", _gender: "female", "first name": "Mary", "last name": "Smith", nickname: "Mamie", birthday: "1938–2015" }, rels: { spouses: ["gf"], children: ["dad", "aunt"], parents: [] } },
  { id: "dad", data: { gender: "M", _gender: "male", "first name": "Robert", "last name": "Smith", nickname: "", birthday: "b. 1960" }, rels: { spouses: ["mom"], children: ["kid"], parents: ["gf", "gm"] } },
  { id: "mom", data: { gender: "F", _gender: "female", "first name": "Sarah", "last name": "Jones", nickname: "", birthday: "b. 1962" }, rels: { spouses: ["dad"], children: ["kid"], parents: [] } },
  { id: "aunt", data: { gender: "F", _gender: "female", "first name": "Linda", "last name": "Smith", nickname: "", birthday: "b. 1965" }, rels: { spouses: [], children: [], parents: ["gf", "gm"] } },
  { id: "kid", data: { gender: "M", _gender: "male", "first name": "You", "last name": "Smith", nickname: "Buddy", birthday: "b. 1990" }, rels: { spouses: [], children: [], parents: ["dad", "mom"] } },
];

function GraphPreview({ style, layout }: { style: GraphStyle; layout: GraphLayout }) {
  const ref = useRef<HTMLDivElement>(null);
  const keyRef = useRef(0);

  const styleKey = JSON.stringify(style);
  const layoutKey = JSON.stringify(layout);

  useEffect(() => {
    const cont = ref.current;
    if (!cont) return;

    keyRef.current++;
    const myKey = keyRef.current;

    const timer = setTimeout(() => {
      if (keyRef.current !== myKey) return;
      cont.innerHTML = "";
      try {
        applyGraphStyle(cont, style);
        const chart = f3.createChart(cont, PREVIEW_DATA);
        chart.setCardYSpacing(layout.cardYSpacing);
        chart.setCardXSpacing(layout.cardXSpacing);
        chart.setTransitionTime(Math.min(layout.transitionTime, 400));
        chart.setSingleParentEmptyCard(false);
        chart.setShowSiblingsOfMain(layout.showSiblings);
        chart.setAncestryDepth(2);
        chart.setProgenyDepth(2);

        chart.setAfterUpdate(() => {
          cont.querySelectorAll<SVGPathElement>(".link").forEach(link => {
            link.style.stroke = style.linkColor;
            link.style.strokeWidth = `${style.linkWidth}px`;
          });
        });

        const card = chart.setCardHtml();
        card.setMiniTree(layout.showMiniTree);
        if (layout.showPathToMain) card.setOnHoverPathToMain();
        card.setCardDim({ w: 180, h: 90, img_w: 0, img_h: 0, img_x: 0, img_y: 0, text_x: 0, text_y: 0 });
        card.setStyle("rect");
        card.setCardInnerHtmlCreator((d: f3.TreeDatum) => {
          const dd = d.data.data as Record<string, string>;
          const isMain = !!(d.data as { main?: boolean }).main;
          return buildCardHtml(dd, style, { isMain });
        });
        chart.updateMainId("dad");
        chart.updateTree({ initial: true, tree_position: "fit" });
      } catch (e) {
        console.error("[GraphPreview] error:", e);
      }
    }, 100);

    return () => { clearTimeout(timer); };
  }, [styleKey, layoutKey]); // eslint-disable-line

  return (
    <div ref={ref} className="f3 family-chart-light rounded-lg overflow-hidden border" style={{ width: "100%", height: 280 }} />
  );
}

function rgbToHex(color: string): string {
  if (color.startsWith("#")) return color.length === 4
    ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}` : color;
  const m = color.match(/(\d+)/g);
  if (!m || m.length < 3) return "#888888";
  return "#" + m.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, "0")).join("");
}

export function TreeManagePage() {
  const { treeSlug }  = useParams<{ treeSlug: string }>();
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

  // Geocoding reset
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting,    setResetting]    = useState(false);
  const [resetResult,  setResetResult]  = useState<number | null>(null);

  const { data: tree, isLoading } = useQuery({
    queryKey: queryKeys.trees.detail(treeSlug!),
    queryFn:  () => getTree(treeSlug!),
    enabled:  !!treeSlug,
  });

  const treeId = tree?.id;
  const base = `/trees/${treeSlug}`;

  // Graph settings (localStorage, keyed by UUID)
  const [graphSettings, setGraphSettings] = useState(() => loadGraphSettings(treeId ?? ""));
  const [rootSearch, setRootSearch] = useState("");

  useEffect(() => {
    if (treeId) setGraphSettings(loadGraphSettings(treeId));
  }, [treeId]);

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
      toast.success("Tree updated");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to update tree");
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteTree(treeId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trees.all() });
      toast.success("Tree deleted");
      navigate("/dashboard");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to delete tree");
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

  const handleResetGeocoding = async () => {
    setResetting(true);
    try {
      const { cleared } = await resetTreeGeocoding(treeId!);
      setResetResult(cleared);
      queryClient.invalidateQueries({ queryKey: queryKeys.places.forTree(treeId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.places.forTreeDetails(treeId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.full(treeId!) });
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  };

  const resetImport = () => {
    setImportResult(null); setImportError(null); setImportProgress(null); setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="flex flex-col h-full min-h-0 max-w-6xl mx-auto w-full gap-3">
      {/* Header */}
      <div className="space-y-1 shrink-0">
        <PageHeader items={[
          { label: "Dashboard",          href: "/dashboard" },
          { label: tree?.name ?? "Tree", href: base },
          { label: "Settings" },
        ]} />
        <h1 className="text-xl font-bold">{tree?.name} — Settings</h1>
      </div>

      <Tabs defaultValue={new URLSearchParams(window.location.search).get("tab") || "general"} className="flex-1 flex flex-col min-h-0">
        <TabsList className="overflow-x-auto flex-nowrap w-full justify-start shrink-0">
          <TabsTrigger value="general" className="shrink-0">General</TabsTrigger>
          <TabsTrigger value="health" className="shrink-0">Health</TabsTrigger>
          <TabsTrigger value="graph" className="shrink-0">Graph</TabsTrigger>
          <TabsTrigger value="places" className="shrink-0">Places</TabsTrigger>
          <TabsTrigger value="relationships" className="shrink-0">Relationships</TabsTrigger>
          <TabsTrigger value="data" className="shrink-0">Data</TabsTrigger>
          <TabsTrigger value="trash" className="shrink-0">Trash</TabsTrigger>
          <TabsTrigger value="advanced" className="shrink-0">Advanced</TabsTrigger>
        </TabsList>

        {/* ── General ── */}
        <TabsContent value="general" className="space-y-4 mt-4 overflow-auto min-h-0">
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
                  <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Description</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} /></div>
                  {updateMut.error && <p className="text-sm text-destructive">{updateMut.error instanceof Error ? updateMut.error.message : "Failed to save"}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" disabled={updateMut.isPending} onClick={() => updateMut.mutate()}>{updateMut.isPending ? "Saving…" : "Save"}</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Name:</span> {tree?.name}</p>
                  {tree?.description && <p><span className="text-muted-foreground">Description:</span> {tree.description}</p>}
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-muted-foreground">Visibility:</span>
                    <span className={`text-xs px-2.5 py-1 rounded-md border ${tree?.is_public ? "bg-emerald-500/10 text-emerald-600 border-emerald-200" : "bg-muted text-muted-foreground border-border"}`}>
                      {tree?.is_public ? "Public" : "Private"}
                    </span>
                    <span className="text-xs text-muted-foreground">{tree?.is_public ? "Anyone can view this tree" : "Only members can view"}</span>
                  </div>
                  <div className="rounded-lg border bg-muted/50 p-3 mt-2">
                    <p className="text-xs text-muted-foreground mb-2">
                      {tree?.is_public
                        ? "Making this tree private will prevent anyone without a membership from viewing it."
                        : "Making this tree public will allow anyone with the link to view it (read-only)."}
                    </p>
                    <Button
                      size="sm"
                      variant={tree?.is_public ? "outline" : "default"}
                      onClick={async () => {
                        await updateTree(treeId!, { is_public: !tree?.is_public });
                        queryClient.invalidateQueries({ queryKey: queryKeys.trees.detail(treeSlug!) });
                        toast.success(tree?.is_public ? "Tree is now private" : "Tree is now public");
                      }}
                    >
                      {tree?.is_public ? "Make private" : "Make public"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* You in this tree */}
          <Card>
            <CardHeader><CardTitle className="text-base">You in this tree</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">Select which person represents you. This will be used as the default center in the graph.</p>
              <div className="space-y-2">
                <Input
                  placeholder="Search by name…"
                  value={rootSearch}
                  onChange={e => setRootSearch(e.target.value)}
                  className="h-8"
                />
                {rootSearch && (
                  <div className="border rounded-md max-h-40 overflow-y-auto">
                    {(personsData?.items ?? [])
                      .filter(p => [p.given_name, p.family_name].join(" ").toLowerCase().includes(rootSearch.toLowerCase()))
                      .slice(0, 8)
                      .map(p => {
                        const pName = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
                        const year = p.birth_date?.slice(0, 4);
                        const isSelected = graphSettings.myPersonId === p.id;
                        return (
                          <button key={p.id}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                            onClick={() => {
                              const u = { ...graphSettings, myPersonId: p.id, defaultRootPersonId: p.id };
                              setGraphSettings(u); saveGraphSettings(treeId!, u);
                              setRootSearch("");
                              toast.success(`You are now ${pName}`);
                            }}>
                            <span className="font-medium truncate">{pName}</span>
                            {year && <span className="text-xs text-muted-foreground ml-auto">b. {year}</span>}
                          </button>
                        );
                      })}
                  </div>
                )}
                {graphSettings.myPersonId && (() => {
                  const me = personsData?.items.find(p => p.id === graphSettings.myPersonId);
                  const meName = me ? [me.given_name, me.family_name].filter(Boolean).join(" ") : "—";
                  return (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Currently set to:</span>
                      <span className="font-medium">{meName}</span>
                      <button className="text-xs text-primary hover:underline" onClick={() => {
                        const u = { ...graphSettings, myPersonId: null };
                        setGraphSettings(u); saveGraphSettings(treeId!, u);
                      }}>Clear</button>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Members</CardTitle></CardHeader>
            <CardContent><MembersTab treeId={treeId!} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="mt-4 overflow-auto min-h-0">
          <TreeHealthTab treeId={treeId!} />
        </TabsContent>

        {/* ── Graph ── */}
        <TabsContent value="graph" className="space-y-4 mt-4 overflow-auto min-h-0">
          <Card>
            <CardContent className="pt-5 space-y-5">
              {(() => {
                const layout = getResolvedLayout(graphSettings);
                const style = getResolvedStyle(graphSettings);
                const updateLayout = (patch: Partial<GraphLayout>) => {
                  const u = { ...graphSettings, layout: { ...graphSettings.layout, ...patch } };
                  setGraphSettings(u); saveGraphSettings(treeId!, u);
                };
                const updateStyle = (patch: Partial<GraphStyle>) => {
                  const u = { ...graphSettings, style: { ...graphSettings.style, ...patch } };
                  setGraphSettings(u); saveGraphSettings(treeId!, u);
                };
                return (<>
                  {/* Navigation */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Navigation</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Center person</Label>
                        <Input placeholder="Search…" value={rootSearch} onChange={e => setRootSearch(e.target.value)} className="h-7 text-xs" />
                        {rootSearch && (
                          <ul className="border rounded-md max-h-32 overflow-y-auto text-xs">
                            {(personsData?.items ?? [])
                              .filter(p => [p.given_name, p.family_name].join(" ").toLowerCase().includes(rootSearch.toLowerCase()))
                              .slice(0, 6)
                              .map(p => {
                                const pName = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
                                return (
                                  <li key={p.id} className={`px-2 py-1.5 cursor-pointer hover:bg-muted ${graphSettings.defaultRootPersonId === p.id ? "bg-primary/10 font-medium" : ""}`}
                                    onClick={() => { const u = { ...graphSettings, defaultRootPersonId: p.id }; setGraphSettings(u); saveGraphSettings(treeId!, u); setRootSearch(""); }}>
                                    {pName}
                                  </li>
                                );
                              })}
                          </ul>
                        )}
                        {graphSettings.defaultRootPersonId && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground truncate">
                              {(() => { const p = personsData?.items.find(p => p.id === graphSettings.defaultRootPersonId); return p ? [p.given_name, p.family_name].filter(Boolean).join(" ") : "—"; })()}
                            </span>
                            <button className="text-xs text-primary hover:underline" onClick={() => { const u = { ...graphSettings, defaultRootPersonId: null }; setGraphSettings(u); saveGraphSettings(treeId!, u); }}>clear</button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Default depth</Label>
                        <div className="flex items-center gap-1">
                          {[1,2,3,4,5,6,0].map(d => (
                            <button key={d} className={`w-6 h-6 rounded text-xs font-medium transition-colors ${graphSettings.maxDepth===d?"bg-primary text-primary-foreground":"bg-muted hover:bg-muted/80"}`}
                              onClick={() => { const u = { ...graphSettings, maxDepth: d }; setGraphSettings(u); saveGraphSettings(treeId!, u); }}>
                              {d===0?"∞":d}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <hr className="border-border" />

                  {/* Layout & animation */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layout</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-0.5">
                        <Label className="text-xs">Speed</Label>
                        <input type="range" min="200" max="1500" step="100" value={layout.transitionTime}
                          onChange={e => updateLayout({ transitionTime: parseInt(e.target.value) })} className="w-full" />
                        <span className="text-xs text-muted-foreground">{layout.transitionTime}ms</span>
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-xs">H-spacing</Label>
                        <input type="range" min="140" max="500" step="20" value={layout.cardXSpacing}
                          onChange={e => updateLayout({ cardXSpacing: parseInt(e.target.value) })} className="w-full" />
                        <span className="text-xs text-muted-foreground">{layout.cardXSpacing < 180 ? `overlap ${180 - layout.cardXSpacing}px` : `${layout.cardXSpacing - 180}px gap`}</span>
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-xs">V-spacing</Label>
                        <input type="range" min="100" max="300" step="25" value={layout.cardYSpacing}
                          onChange={e => updateLayout({ cardYSpacing: parseInt(e.target.value) })} className="w-full" />
                        <span className="text-xs text-muted-foreground">{layout.cardYSpacing}px</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={layout.showMiniTree} onChange={e => updateLayout({ showMiniTree: e.target.checked })} />
                        Expand icons
                      </label>
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={layout.showPathToMain} onChange={e => updateLayout({ showPathToMain: e.target.checked })} />
                        Path highlight
                      </label>
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={layout.showSiblings} onChange={e => updateLayout({ showSiblings: e.target.checked })} />
                        Siblings
                      </label>
                    </div>
                  </div>

                  <hr className="border-border" />

                  {/* Colors */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Colors</h3>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-3">
                        <span className="text-xs text-muted-foreground w-full">Card fill colors</span>
                        {([
                          ["Male", "maleColor"], ["Female", "femaleColor"], ["Other", "otherColor"], ["Unknown", "unknownColor"],
                        ] as [string, keyof GraphStyle][]).map(([label, key]) => (
                          <div key={key} className="flex items-center gap-1.5">
                            <input type="color" value={rgbToHex(style[key] as string)} onChange={e => updateStyle({ [key]: e.target.value })} className="w-6 h-6 rounded border cursor-pointer" />
                            <span className="text-xs text-muted-foreground">{label}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <span className="text-xs text-muted-foreground w-full">Accent colors (last name, stripe)</span>
                        {([
                          ["Male", "maleAccent"], ["Female", "femaleAccent"], ["Other", "otherAccent"], ["Unknown", "unknownAccent"],
                        ] as [string, keyof GraphStyle][]).map(([label, key]) => (
                          <div key={key} className="flex items-center gap-1.5">
                            <input type="color" value={rgbToHex(style[key] as string)} onChange={e => updateStyle({ [key]: e.target.value })} className="w-6 h-6 rounded border cursor-pointer" />
                            <span className="text-xs text-muted-foreground">{label}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <span className="text-xs text-muted-foreground w-full">Graph</span>
                        {([
                          ["Lines", "linkColor"], ["Path highlight", "pathAccent"], ["Background", "bgColor"], ["Card bg", "cardBg"], ["Text", "textColor"], ["Muted", "mutedColor"],
                        ] as [string, keyof GraphStyle][]).map(([label, key]) => (
                          <div key={key} className="flex items-center gap-1.5">
                            <input type="color" value={rgbToHex(style[key] as string)} onChange={e => updateStyle({ [key]: e.target.value })} className="w-6 h-6 rounded border cursor-pointer" />
                            <span className="text-xs text-muted-foreground">{label}</span>
                          </div>
                        ))}
                        <div className="flex items-center gap-1.5">
                          <input type="range" min="0.5" max="4" step="0.5" value={style.linkWidth}
                            onChange={e => updateStyle({ linkWidth: parseFloat(e.target.value) })} className="w-16" />
                          <span className="text-xs text-muted-foreground">Lines {style.linkWidth}px</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Reset */}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { const u = { ...graphSettings, layout: undefined, style: undefined }; setGraphSettings(u); saveGraphSettings(treeId!, u); }}>
                      Reset all to defaults
                    </Button>
                  </div>
                </>);
              })()}
            </CardContent>
          </Card>

          {/* Live preview */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Live preview</CardTitle></CardHeader>
            <CardContent>
              <GraphPreview style={getResolvedStyle(graphSettings)} layout={getResolvedLayout(graphSettings)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Data ── */}
        <TabsContent value="places" className="mt-4 space-y-4 overflow-auto min-h-0">
          <Card>
            <CardHeader><CardTitle className="text-base">Reset geocoding</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Clear all place links from persons so you can re-geocode everything from scratch.
              </p>
              {resetResult !== null && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                  Cleared {resetResult} place link{resetResult !== 1 ? "s" : ""}.
                </p>
              )}
              {confirmReset ? (
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" disabled={resetting} onClick={handleResetGeocoding}>{resetting ? "Resetting…" : "Confirm reset"}</Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmReset(false)}>Cancel</Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => { setResetResult(null); setConfirmReset(true); }}>Reset all geocoding…</Button>
              )}
            </CardContent>
          </Card>
          <PlacesManageTab treeId={treeId!} />
        </TabsContent>

        <TabsContent value="relationships" className="mt-4 overflow-hidden min-h-0 flex flex-col">
          <RelationshipsTab treeId={treeId!} />
        </TabsContent>

        <TabsContent value="data" className="space-y-4 mt-4 overflow-auto min-h-0">
          <Card>
            <CardHeader><CardTitle className="text-base">GEDCOM</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Import or export GEDCOM 5.5.1 files compatible with Gramps, Ancestry, Heredis, and other genealogy software.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { resetImport(); setImportOpen(true); }}>Import…</Button>
                <Button variant="outline" onClick={async () => {
                  try {
                    const { getAccessToken } = await import("@/api/client");
                    const { API_PREFIX } = await import("@/lib/constants");
                    const headers: Record<string, string> = {};
                    const token = getAccessToken();
                    if (token) headers["Authorization"] = `Bearer ${token}`;
                    const resp = await fetch(`${API_PREFIX}/trees/${treeId}/export/gedcom`, { headers, credentials: "include" });
                    if (!resp.ok) throw new Error("Export failed");
                    const blob = await resp.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = `tree-${treeId}.ged`;
                    a.click(); URL.revokeObjectURL(url);
                    toast.success("GEDCOM exported");
                  } catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); }
                }}>Export .ged</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Trash ── */}
        <TabsContent value="trash" className="mt-4 overflow-auto min-h-0">
          <TrashTab treeId={treeId!} />
        </TabsContent>

        {/* ── Advanced ── */}
        <TabsContent value="advanced" className="space-y-4 mt-4 overflow-auto min-h-0">
          <Card className="border-destructive/40">
            <CardHeader><CardTitle className="text-base text-destructive">Danger zone</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Permanently delete this tree and all its data.
              </p>
              <Button variant="destructive" size="sm" className="shrink-0 ml-4" onClick={() => setDeleteOpen(true)}>Delete tree</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
