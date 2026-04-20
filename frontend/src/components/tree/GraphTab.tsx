import { useState, useCallback, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow, Background, Controls, MiniMap,
  Handle, Position, MarkerType, NodeToolbar, useReactFlow,
  type Node, type Edge, type NodeTypes, type NodeProps,
} from "@xyflow/react";
import calcTree from "relatives-tree";
import type { Node as RelNode } from "relatives-tree/lib/types";
import { listPersons, createPerson } from "@/api/persons";
import { listRelationships, createRelationship } from "@/api/relationships";
import { queryKeys } from "@/lib/queryKeys";
import { formatFlexDate } from "@/lib/dates";
import type { Person } from "@/types/person";
import type { Relationship } from "@/types/relationship";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { LocationInput } from "@/components/common/LocationInput";
import { loadGraphSettings, saveGraphSettings } from "@/lib/graphSettings";

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_W = 180;
const NODE_H = 100;
const HGAP   = 40;
const VGAP   = 80;

type RelativeKind = "child" | "spouse" | "parent";
type AddRelativeState = { anchorId: string; anchorName: string; relation: RelativeKind };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genderColors(gender: string | null) {
  if (gender === "male"   || gender === "m") return { card: "bg-blue-50 border-blue-300",  avatar: "bg-blue-500"  };
  if (gender === "female" || gender === "f") return { card: "bg-rose-50 border-rose-300",  avatar: "bg-rose-500"  };
  return                                            { card: "bg-slate-50 border-slate-300", avatar: "bg-slate-400" };
}
function initials(p: Person) {
  return ((p.given_name?.[0] ?? "") + (p.family_name?.[0] ?? "")).toUpperCase() || "?";
}

// ─── PersonNode ───────────────────────────────────────────────────────────────

type PersonNodeData = {
  person: Person;
  treeId: string;
  onAddRelative: (s: AddRelativeState) => void;
  onSetRoot: (id: string) => void;
};
type PersonFlowNode = Node<PersonNodeData, "personNode">;

function PersonNode({ data, selected }: NodeProps<PersonFlowNode>) {
  const [hovered, setHovered] = useState(false);
  const { person, treeId, onAddRelative, onSetRoot } = data;

  const name = [person.given_name, person.family_name].filter(Boolean).join(" ") || "Unnamed";
  const rawYear   = person.birth_date?.slice(0, 4);
  const deathYear = person.death_date?.slice(0, 4);
  const q = person.birth_date_qualifier;
  const yPfx = q === "about" ? "c. " : q === "before" ? "bef. " : q === "after" ? "aft. " : "";
  const yearLabel = rawYear
    ? deathYear ? `${yPfx}${rawYear} – ${deathYear}` : `b. ${yPfx}${rawYear}`
    : deathYear ? `d. ${deathYear}` : null;

  const colors = genderColors(person.gender);

  const tooltipDate = formatFlexDate(
    person.birth_date, person.birth_date_qualifier,
    person.birth_date_2, person.birth_date_original,
  );
  const tooltipDeath = formatFlexDate(
    person.death_date, person.death_date_qualifier,
    person.death_date_2, person.death_date_original,
  );
  const dateRange = tooltipDate && tooltipDeath
    ? `${tooltipDate} – ${tooltipDeath}`
    : tooltipDate ? `b. ${tooltipDate}`
    : tooltipDeath ? `d. ${tooltipDeath}` : null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position={Position.Top}    style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      {/* ── Tooltip card ── */}
      <NodeToolbar isVisible={!!selected} position={Position.Bottom} offset={8}>
        <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-56 space-y-1.5 nodrag nopan">
          <p className="font-semibold text-sm leading-tight">{name}</p>
          {dateRange  && <p className="text-xs text-muted-foreground">{dateRange}</p>}
          {person.occupation && <p className="text-xs text-muted-foreground">{person.occupation}</p>}
          <div className="flex gap-2 pt-1 border-t border-slate-100">
            <Link
              to={`/trees/${treeId}/persons/${person.id}`}
              className="flex-1 text-xs text-primary hover:underline font-medium"
            >
              View profile →
            </Link>
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onSetRoot(person.id); }}
            >
              Set root
            </button>
          </div>
        </div>
      </NodeToolbar>

      {/* ── Node card ── */}
      <div
        className={`${colors.card} border-2 rounded-xl shadow-sm transition-shadow hover:shadow-md ${selected ? "ring-2 ring-primary ring-offset-1" : ""}`}
        style={{ width: NODE_W, height: NODE_H }}
      >
        <div className="nodrag flex items-center gap-2 px-3 pt-3 pb-2 cursor-pointer h-[60px]">
          <div
            className={`${colors.avatar} text-white text-xs font-bold rounded-full flex items-center justify-center shrink-0`}
            style={{ width: 30, height: 30 }}
          >
            {initials(person)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight truncate">{name}</div>
            {yearLabel && <div className="text-xs text-muted-foreground leading-tight">{yearLabel}</div>}
          </div>
        </div>

        <div className={`nodrag flex gap-1 px-2 pb-2 transition-opacity ${hovered ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          {(["parent", "spouse", "child"] as RelativeKind[]).map((rel) => (
            <button key={rel}
              className="flex-1 text-xs bg-white/80 hover:bg-white border border-slate-200 rounded px-1 py-0.5 transition-colors capitalize"
              onClick={(e) => { e.stopPropagation(); onAddRelative({ anchorId: person.id, anchorName: name, relation: rel }); }}
            >
              + {rel === "spouse" ? "Partner" : rel}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { personNode: PersonNode };

// ─── Graph controller (must live inside ReactFlow) ────────────────────────────

function GraphController({ centreNodeId, nodes }: { centreNodeId: string | null; nodes: PersonFlowNode[] }) {
  const { setCenter, fitView } = useReactFlow();

  // Re-fit when the node set changes (e.g. depth changed)
  const nodeCount = nodes.length;
  useEffect(() => {
    if (nodeCount > 0) setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
  }, [nodeCount]); // eslint-disable-line

  useEffect(() => {
    if (!centreNodeId) return;
    const n = nodes.find((n) => n.id === centreNodeId);
    if (n) setCenter(n.position.x + NODE_W / 2, n.position.y + NODE_H / 2, { zoom: 1.2, duration: 500 });
  }, [centreNodeId]); // eslint-disable-line
  return null;
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function toRelNodes(persons: Person[], relationships: Relationship[]): RelNode[] {
  return persons.map((p) => {
    const mine   = relationships.filter((r) => r.person_a_id === p.id || r.person_b_id === p.id);
    const other  = (r: Relationship) => r.person_a_id === p.id ? r.person_b_id : r.person_a_id;
    return {
      id:       p.id,
      gender:   p.gender === "female" ? ("female" as const) : ("male" as const),
      parents:  mine.filter((r) => r.relationship_type === "parent" && r.person_b_id === p.id)
                    .map((r) => ({ id: r.person_a_id, type: "blood" as const })),
      children: mine.filter((r) => r.relationship_type === "parent" && r.person_a_id === p.id)
                    .map((r) => ({ id: r.person_b_id, type: "blood" as const })),
      spouses:  mine.filter((r) => r.relationship_type === "spouse" || r.relationship_type === "partner")
                    .map((r) => ({ id: other(r), type: "married" as const })),
      siblings: [],
    };
  }) as unknown as RelNode[];
}

function findDefaultRoot(persons: Person[], relationships: Relationship[]): string {
  const hasParents = new Set(
    relationships.filter((r) => r.relationship_type === "parent").map((r) => r.person_b_id)
  );
  return (persons.find((p) => !hasParents.has(p.id)) ?? persons[0]).id;
}

/** BFS from rootId up to maxDepth hops. maxDepth=0 means unlimited. */
function getNodesWithinDepth(
  persons: Person[],
  relationships: Relationship[],
  rootId: string,
  maxDepth: number,
): { persons: Person[]; relationships: Relationship[] } {
  if (maxDepth === 0) return { persons, relationships };

  const personById = new Map(persons.map((p) => [p.id, p]));
  const visited = new Set<string>([rootId]);
  let frontier = [rootId];

  for (let d = 0; d < maxDepth && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const rel of relationships) {
        if (rel.person_a_id !== id && rel.person_b_id !== id) continue;
        const other = rel.person_a_id === id ? rel.person_b_id : rel.person_a_id;
        if (!visited.has(other)) { visited.add(other); next.push(other); }
      }
    }
    frontier = next;
  }

  const filteredPersons = [...visited].map((id) => personById.get(id)!).filter(Boolean);
  const filteredRels = relationships.filter(
    (r) => visited.has(r.person_a_id) && visited.has(r.person_b_id)
  );
  return { persons: filteredPersons, relationships: filteredRels };
}

function buildLayout(
  allPersons: Person[], allRelationships: Relationship[], treeId: string,
  onAddRelative: PersonNodeData["onAddRelative"],
  onSetRoot: PersonNodeData["onSetRoot"],
  rootId: string,
  maxDepth: number,
) {
  // Apply depth limiting before passing to relatives-tree
  const { persons, relationships } = getNodesWithinDepth(allPersons, allRelationships, rootId, maxDepth);
  const personById = new Map(persons.map((p) => [p.id, p]));

  // Find a valid root that exists in the persons array
  const validRoot = persons.some((p) => p.id === rootId) ? rootId : persons[0]?.id;
  if (!validRoot) return { nodes: [], edges: [] };

  let treeData;
  try { treeData = calcTree(toRelNodes(persons, relationships), { rootId: validRoot, placeholders: false }); }
  catch { treeData = null; }

  const extNodes = treeData?.nodes ?? [];
  const renderedIds = new Set(extNodes.map((n) => n.id));

  // relatives-tree: positive top = ancestor (above), negative top = descendant (below).
  // React Flow: y increases downward. So negate top to get the correct visual order.
  const mainNodes: PersonFlowNode[] = extNodes.map((n) => ({
    id: n.id, type: "personNode",
    position: { x: n.left * (NODE_W + HGAP), y: -n.top * (NODE_H + VGAP) },
    data: { person: personById.get(n.id)!, treeId, onAddRelative, onSetRoot },
  }));

  // Snap romantic partners to the same y level so the connecting line is horizontal
  const nodeYById = new Map(mainNodes.map((n) => [n.id, n.position.y]));
  for (const r of relationships) {
    if (r.relationship_type !== "spouse" && r.relationship_type !== "partner") continue;
    const ya = nodeYById.get(r.person_a_id);
    const yb = nodeYById.get(r.person_b_id);
    if (ya === undefined || yb === undefined || ya === yb) continue;
    const avgY = Math.round((ya + yb) / 2 / (NODE_H + VGAP)) * (NODE_H + VGAP);
    nodeYById.set(r.person_a_id, avgY);
    nodeYById.set(r.person_b_id, avgY);
  }
  for (const n of mainNodes) n.position.y = nodeYById.get(n.id) ?? n.position.y;

  // Place disconnected persons in a grid below the main tree
  const GRID_COLS = 10;
  const disconnected = persons.filter((p) => !renderedIds.has(p.id));
  const mainBottom = mainNodes.length
    ? Math.max(...mainNodes.map((n) => n.position.y)) + NODE_H + VGAP * 2
    : 0;

  if (disconnected.length > 0 && extNodes.length <= 1 && relationships.length > 0) {
    console.warn(
      `[GraphTab] relatives-tree returned only ${extNodes.length} node(s) but tree has ${persons.length} persons and ${relationships.length} relationships. ` +
      `Root: ${validRoot}. Check that relationship data is loading correctly.`
    );
  }

  const disconnectedNodes: PersonFlowNode[] = disconnected.map((p, i) => ({
    id: p.id, type: "personNode",
    position: {
      x: (i % GRID_COLS) * (NODE_W + HGAP),
      y: mainBottom + Math.floor(i / GRID_COLS) * (NODE_H + VGAP),
    },
    data: { person: p, treeId, onAddRelative, onSetRoot },
  }));

  const nodes = [...mainNodes, ...disconnectedNodes];
  renderedIds.clear();
  nodes.forEach((n) => renderedIds.add(n.id));

  const edges: Edge[] = relationships
    .filter((r) => ["parent", "spouse", "partner"].includes(r.relationship_type)
      && renderedIds.has(r.person_a_id) && renderedIds.has(r.person_b_id))
    .map((r) => {
      const isRomantic = r.relationship_type === "spouse" || r.relationship_type === "partner";
      const isEnded    = !!r.end_date;
      const stroke = isEnded ? "#9ca3af" : r.relationship_type === "partner" ? "#8b5cf6" : isRomantic ? "#f43f5e" : "#6b7280";
      return {
        id: r.id, source: r.person_a_id, target: r.person_b_id,
        type: isRomantic ? "straight" : "smoothstep",
        markerEnd: isRomantic ? undefined : { type: MarkerType.ArrowClosed, color: "#6b7280" },
        style: isRomantic
          ? { stroke, strokeDasharray: isEnded ? "4 4" : "6 3", strokeWidth: isEnded ? 1.5 : 2 }
          : { stroke, strokeWidth: 1.5 },
      };
    });

  return { nodes, edges };
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function GraphLegend() {
  return (
    <div className="absolute top-2 left-2 z-10 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-2 text-xs shadow-sm space-y-1.5 pointer-events-none">
      <p className="font-semibold text-slate-600">Legend</p>
      {[["bg-blue-500","Male"],["bg-rose-500","Female"],["bg-slate-400","Unknown"]].map(([c,l])=>(
        <div key={l} className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${c} shrink-0`}/><span className="text-slate-600">{l}</span>
        </div>
      ))}
      <div className="border-t border-slate-200 my-1"/>
      {([
        ["#6b7280","","1.5",true,"Parent → Child"],
        ["#f43f5e","4 2","2",false,"Spouse"],
        ["#8b5cf6","4 2","2",false,"Partner"],
        ["#9ca3af","3 3","1.5",false,"Ended"],
      ] as [string,string,string,boolean,string][]).map(([s,d,w,arrow,label])=>(
        <div key={label} className="flex items-center gap-2">
          <svg width="26" height="8" className="shrink-0">
            <line x1="0" y1="4" x2={arrow?18:26} y2="4" stroke={s} strokeWidth={w} strokeDasharray={d||undefined}/>
            {arrow&&<polygon points="18,1 26,4 18,7" fill={s}/>}
          </svg>
          <span className="text-slate-600">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Add-relative dialog ──────────────────────────────────────────────────────

function AddRelativeDialog({ state, treeId, onClose }: { state: AddRelativeState | null; treeId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [givenName,    setGivenName]    = useState("");
  const [familyName,   setFamilyName]   = useState("");
  const [maidenName,   setMaidenName]   = useState("");
  const [nickname,     setNickname]     = useState("");
  const [birthDate,    setBirthDate]    = useState("");
  const [birthLoc,     setBirthLoc]     = useState("");
  const [birthPlaceId, setBirthPlaceId] = useState<string|null>(null);
  const [sex,          setSex]          = useState("");
  const [occupation,   setOccupation]   = useState("");
  const [nationalities,setNationalities]= useState("");
  const [bio,          setBio]          = useState("");
  const [coupleType,   setCoupleType]   = useState<"spouse"|"partner">("spouse");
  const [relStart,     setRelStart]     = useState("");
  const [relEnd,       setRelEnd]       = useState("");

  const reset = () => {
    setGivenName(""); setFamilyName(""); setMaidenName(""); setNickname("");
    setBirthDate(""); setBirthLoc(""); setBirthPlaceId(null);
    setSex(""); setOccupation(""); setNationalities(""); setBio("");
    setCoupleType("spouse"); setRelStart(""); setRelEnd("");
  };

  const mut = useMutation({
    mutationFn: async () => {
      if (!state) return;
      const p = await createPerson(treeId, {
        given_name: givenName||undefined, family_name: familyName||undefined,
        maiden_name: maidenName||undefined, nickname: nickname||undefined,
        birth_date: birthDate||undefined, gender: sex||undefined,
        birth_location: birthLoc||undefined, birth_place_id: birthPlaceId||undefined,
        occupation: occupation||undefined, bio: bio||undefined,
        nationalities: nationalities ? nationalities.split(",").map(s=>s.trim()).filter(Boolean) : undefined,
      });
      if (!state.anchorId) return;
      const rel = state.relation === "child"
        ? { person_a_id: state.anchorId, person_b_id: p.id, relationship_type: "parent" }
        : state.relation === "spouse"
        ? { person_a_id: state.anchorId, person_b_id: p.id, relationship_type: coupleType, start_date: relStart||undefined, end_date: relEnd||undefined }
        : { person_a_id: p.id, person_b_id: state.anchorId, relationship_type: "parent" };
      await createRelationship(treeId, rel);
    },
    onSuccess: () => {
      // Invalidate `all` — prefix matching also covers `.full` and `.stat` sub-keys
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.all(treeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.all(treeId) });
      reset(); onClose();
    },
  });

  const LABELS: Record<RelativeKind, string> = { child: "Child", spouse: "Spouse/Partner", parent: "Parent" };
  const title = state ? (state.anchorId ? `Add ${LABELS[state.relation]} of ${state.anchorName}` : "Add First Person") : "";

  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Given Name</Label><Input value={givenName} onChange={(e)=>setGivenName(e.target.value)} autoFocus/></div>
            <div className="space-y-1"><Label className="text-xs">Family Name</Label><Input value={familyName} onChange={(e)=>setFamilyName(e.target.value)}/></div>
            <div className="space-y-1"><Label className="text-xs">Maiden / Birth Name</Label><Input value={maidenName} onChange={(e)=>setMaidenName(e.target.value)} placeholder="Birth surname"/></div>
            <div className="space-y-1"><Label className="text-xs">Nickname</Label><Input value={nickname} onChange={(e)=>setNickname(e.target.value)} placeholder='"Bud"'/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Birth Date</Label><Input type="date" value={birthDate} onChange={(e)=>setBirthDate(e.target.value)}/></div>
            <div className="space-y-1">
              <Label className="text-xs">Sex</Label>
              <Select value={sex} onValueChange={(v)=>{ if(v!==null) setSex(v); }}>
                <SelectTrigger className="w-full"><span className={sex?"":"text-muted-foreground"}>{sex?sex.charAt(0).toUpperCase()+sex.slice(1):"Select sex"}</span></SelectTrigger>
                <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="unknown">Unknown</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Birth Location</Label><LocationInput value={birthLoc} onChange={(v,pid)=>{ setBirthLoc(v); setBirthPlaceId(pid); }}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Occupation</Label><Input value={occupation} onChange={e=>setOccupation(e.target.value)}/></div>
            <div className="space-y-1"><Label className="text-xs">Nationalities</Label><Input value={nationalities} onChange={e=>setNationalities(e.target.value)} placeholder="e.g. Italian, Swiss"/></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Bio</Label><Textarea value={bio} onChange={e=>setBio(e.target.value)} rows={2} placeholder="Brief description…"/></div>
          {state?.relation === "spouse" && (<>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={coupleType} onValueChange={(v)=>{ if(v!==null) setCoupleType(v as "spouse"|"partner"); }}>
                <SelectTrigger className="w-full"><span>{coupleType==="spouse"?"Spouse (married)":"Partner"}</span></SelectTrigger>
                <SelectContent><SelectItem value="spouse">Spouse (married)</SelectItem><SelectItem value="partner">Partner</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Start Date <span className="text-xs text-muted-foreground">(optional)</span></Label><Input type="date" value={relStart} onChange={(e)=>setRelStart(e.target.value)}/></div>
              <div className="space-y-2"><Label>End Date <span className="text-xs text-muted-foreground">(if ended)</span></Label><Input type="date" value={relEnd} onChange={(e)=>setRelEnd(e.target.value)}/></div>
            </div>
          </>)}
          {mut.error && <p className="text-sm text-destructive">{mut.error instanceof Error ? mut.error.message : "Failed"}</p>}
          <Button type="submit" className="w-full" disabled={mut.isPending}>{mut.isPending?"Adding…":"Add"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── GraphTab ─────────────────────────────────────────────────────────────────

export function GraphTab({ treeId }: { treeId: string }) {
  const settings = useMemo(() => loadGraphSettings(treeId), [treeId]);

  const [addRelative,  setAddRelative]  = useState<AddRelativeState | null>(null);
  const [rootPersonId, setRootPersonId] = useState<string | null>(settings.defaultRootPersonId);
  const [centreNodeId, setCentreNodeId] = useState<string | null>(null);
  const [maxDepth,     setMaxDepth]     = useState<number>(settings.maxDepth);

  const handleAddRelative = useCallback((s: AddRelativeState) => setAddRelative(s), []);
  const handleSetRoot     = useCallback((id: string) => { setRootPersonId(id); setCentreNodeId(id); }, []);
  const handleSetDepth    = useCallback((d: number) => {
    setMaxDepth(d);
    saveGraphSettings(treeId, { ...loadGraphSettings(treeId), maxDepth: d });
  }, [treeId]);

  const { data: personsData, isLoading: pLoad, isError: pErr } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn:  () => listPersons(treeId, 0, 50000),
  });
  const { data: relsData, isLoading: rLoad, isError: rErr } = useQuery({
    queryKey: queryKeys.relationships.full(treeId),
    queryFn:  () => listRelationships(treeId, 0, 50000),
  });

  const rootId = useMemo(() => {
    const ps = personsData?.items ?? [], rs = relsData?.items ?? [];
    if (!ps.length) return "";
    const wanted = rootPersonId ?? findDefaultRoot(ps, rs);
    return ps.some((p) => p.id === wanted) ? wanted : ps[0].id;
  }, [personsData, relsData, rootPersonId]);

  const { nodes, edges } = useMemo(() => {
    const ps = personsData?.items ?? [], rs = relsData?.items ?? [];
    if (!ps.length || !rootId) return { nodes: [], edges: [] };
    return buildLayout(ps, rs, treeId, handleAddRelative, handleSetRoot, rootId, maxDepth);
  }, [personsData, relsData, treeId, handleAddRelative, handleSetRoot, rootId, maxDepth]);

  if (pLoad || rLoad) return <LoadingSpinner />;
  if (pErr  || rErr)  return (
    <div className="flex flex-col items-center gap-2 py-16 text-destructive">
      <p className="font-medium">Failed to load graph data.</p>
      <p className="text-sm text-muted-foreground">Check your connection and try refreshing.</p>
    </div>
  );

  if (!nodes.length && !personsData?.items.length) return (
    <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground">
      <p>No people yet. Add the first person to get started.</p>
      <Button onClick={() => setAddRelative({ anchorId: "", anchorName: "", relation: "child" })}>Add First Person</Button>
      <AddRelativeDialog state={addRelative} treeId={treeId} onClose={() => setAddRelative(null)} />
    </div>
  );

  return (
    <>
      <div style={{ height: "calc(100vh - 220px)", minHeight: 400 }} className="relative border rounded-xl overflow-hidden">
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.15 }}
          nodesConnectable={false} nodesDraggable elementsSelectable
          minZoom={0.05} maxZoom={2}
          onNodeClick={(_, node) => setCentreNodeId(node.id)}
          onPaneClick={() => setCentreNodeId(null)}
        >
          <Background gap={20} color="#e5e7eb" />
          <Controls showInteractive={false} />
          <MiniMap nodeStrokeWidth={3} zoomable pannable nodeColor={(n) => {
            const g = (n.data as PersonNodeData).person.gender;
            return g==="male"||g==="m" ? "#93c5fd" : g==="female"||g==="f" ? "#fda4af" : "#cbd5e1";
          }} />
          <GraphLegend />
          <GraphController centreNodeId={centreNodeId} nodes={nodes} />
          {/* Depth control */}
          <div className="absolute top-2 right-2 z-10 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-2 text-xs shadow-sm flex items-center gap-2">
            <span className="text-slate-600 font-medium">Depth</span>
            {[1,2,3,4,5,0].map(d => (
              <button key={d}
                className={`w-6 h-6 rounded text-xs font-medium transition-colors ${maxDepth===d?"bg-primary text-primary-foreground":"bg-slate-100 hover:bg-slate-200 text-slate-700"}`}
                onClick={() => handleSetDepth(d)}
              >
                {d===0?"∞":d}
              </button>
            ))}
          </div>
        </ReactFlow>
        <p className="absolute bottom-2 right-2 text-xs text-muted-foreground/60 pointer-events-none select-none">
          Scroll to zoom · Drag to pan · Click a person to view details
        </p>
      </div>
      <AddRelativeDialog state={addRelative} treeId={treeId} onClose={() => setAddRelative(null)} />
    </>
  );
}
