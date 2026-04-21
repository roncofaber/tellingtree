import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as f3 from "family-chart";
import "family-chart/styles/family-chart.css";
import { listPersons, createPerson } from "@/api/persons";
import { listRelationships, createRelationship } from "@/api/relationships";
import { queryKeys } from "@/lib/queryKeys";
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

// ─── Types ───────────────────────────────────────────────────────────────────

type RelativeKind = "child" | "spouse" | "parent";
type AddRelativeState = { anchorId: string; anchorName: string; relation: RelativeKind };

// ─── Data transformer ────────────────────────────────────────────────────────

function toFamilyChartData(persons: Person[], relationships: Relationship[]) {
  return persons.map((p) => {
    const parentIds = relationships
      .filter((r) => r.relationship_type === "parent" && r.person_b_id === p.id)
      .map((r) => r.person_a_id);
    const childIds = relationships
      .filter((r) => r.relationship_type === "parent" && r.person_a_id === p.id)
      .map((r) => r.person_b_id);
    const spouseIds = relationships
      .filter((r) => (r.relationship_type === "spouse" || r.relationship_type === "partner")
        && (r.person_a_id === p.id || r.person_b_id === p.id))
      .map((r) => r.person_a_id === p.id ? r.person_b_id : r.person_a_id);

    const rawYear = p.birth_date?.slice(0, 4);
    const deathYear = p.death_date?.slice(0, 4);
    const q = p.birth_date_qualifier;
    const yPfx = q === "about" ? "c. " : q === "before" ? "bef. " : q === "after" ? "aft. " : "";
    const yearLabel = rawYear
      ? deathYear ? `${yPfx}${rawYear} – ${deathYear}` : `b. ${yPfx}${rawYear}`
      : deathYear ? `d. ${deathYear}` : "";

    return {
      id: p.id,
      data: {
        gender: (p.gender === "female" || p.gender === "f") ? "F" as const : "M" as const,
        originalGender: p.gender ?? "unknown",
        "first name": p.given_name ?? "",
        "last name": p.family_name ?? "",
        birthday: yearLabel,
      },
      rels: {
        parents: [...new Set(parentIds)],
        children: [...new Set(childIds)],
        spouses: [...new Set(spouseIds)],
      },
    };
  });
}

function findDefaultRoot(persons: Person[], relationships: Relationship[]): string {
  const hasParents = new Set(
    relationships.filter((r) => r.relationship_type === "parent").map((r) => r.person_b_id)
  );
  return (persons.find((p) => !hasParents.has(p.id)) ?? persons[0]).id;
}

// ─── Family chart wrapper ────────────────────────────────────────────────────

function FamilyChartView({
  data, mainId, onCardClick, onRecenter, onAddRelative,
}: {
  data: ReturnType<typeof toFamilyChartData>;
  mainId: string;
  onCardClick?: (personId: string) => void;
  onRecenter?: (personId: string) => void;
  onAddRelative?: (state: AddRelativeState) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<f3.Chart | null>(null);

  const cbRef = useRef({ onCardClick, onRecenter, onAddRelative });
  cbRef.current = { onCardClick, onRecenter, onAddRelative };

  // Create chart when data changes
  useEffect(() => {
    const cont = containerRef.current;
    if (!cont || !data.length) return;

    const timer = setTimeout(() => {
      cont.innerHTML = "";
      try {
        const chart = f3.createChart(cont, data as f3.Data);
        chart.setCardYSpacing(150);
        chart.setCardXSpacing(250);
        chart.setSingleParentEmptyCard(false);
        const card = chart.setCardHtml();
        card.setCardDisplay([
          ["first name", "last name"],
          "birthday",
        ]);
        card.setOnCardClick((e, d) => {
          if (e.ctrlKey || e.metaKey) {
            chart.updateMainId(d.data.id);
            chart.updateTree({ tree_position: "main_to_middle" });
            cbRef.current.onRecenter?.(d.data.id);
          } else {
            cbRef.current.onCardClick?.(d.data.id);
          }
        });
        card.setDefaultPersonIcon((d: f3.TreeDatum) => {
          const g = (d.data.data as Record<string, string>).originalGender ?? "unknown";
          const icon = (g === "female" || g === "f") ? "/female_icon.svg"
            : (g === "male" || g === "m") ? "/male_icon.svg"
            : (g === "other" || g === "o") ? "/other_icon.svg"
            : "/unknown_icon.svg";
          return `<img src="${icon}" alt="" style="width:100%;height:100%;object-fit:contain;" />`;
        });
        card.setOnCardUpdate(function (this: HTMLElement, d: f3.TreeDatum) {
          if (this.querySelector(".tt-add-btns")) return;
          const dd = d.data.data as Record<string, string>;
          const name = `${dd["first name"] ?? ""} ${dd["last name"] ?? ""}`.trim() || "Unnamed";
          const id = d.data.id;
          const btnRow = document.createElement("div");
          btnRow.className = "tt-add-btns";
          btnRow.style.cssText = "display:flex;gap:2px;justify-content:center;margin-top:2px;opacity:0;transition:opacity 0.15s;pointer-events:auto;";
          for (const b of [
            { label: "Parent", rel: "parent" },
            { label: "Partner", rel: "spouse" },
            { label: "Child", rel: "child" },
          ]) {
            const btn = document.createElement("button");
            btn.textContent = `+${b.label}`;
            btn.style.cssText = "font-size:9px;padding:1px 4px;border:1px solid #cbd5e1;border-radius:3px;background:#fff;cursor:pointer;color:#475569;";
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              cbRef.current.onAddRelative?.({ anchorId: id, anchorName: name, relation: b.rel as RelativeKind });
            });
            btn.addEventListener("mouseenter", () => { btn.style.background = "#f1f5f9"; });
            btn.addEventListener("mouseleave", () => { btn.style.background = "#fff"; });
            btnRow.appendChild(btn);
          }
          const cardEl = this.querySelector(".card") as HTMLElement;
          if (cardEl) {
            cardEl.appendChild(btnRow);
            cardEl.addEventListener("mouseenter", () => { btnRow.style.opacity = "1"; });
            cardEl.addEventListener("mouseleave", () => { btnRow.style.opacity = "0"; });
          }
        });
        chart.updateMainId(mainId);
        chart.updateTree({ initial: true, tree_position: "fit" });
        chartRef.current = chart;
      } catch (e) {
        console.error("[FamilyChart] init error:", e);
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      if (cont) cont.innerHTML = "";
      chartRef.current = null;
    };
  }, [data]); // eslint-disable-line -- only rebuild on data change, not mainId

  // Re-center without rebuilding when mainId changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mainId) return;
    chart.updateMainId(mainId);
    chart.updateTree({ tree_position: "main_to_middle" });
  }, [mainId]);

  return <div ref={containerRef} className="f3" style={{ width: "100%", height: "100%" }} />;
}

// ─── Date qualifier helpers ───────────────────────────────────────────────────

const DATE_QUALIFIERS = [
  { value: "exact",      label: "Exact"      },
  { value: "year-only",  label: "Year only"  },
  { value: "about",      label: "circa"      },
  { value: "before",     label: "Before"     },
  { value: "after",      label: "After"      },
  { value: "between",    label: "Between"    },
  { value: "estimated",  label: "Estimated"  },
  { value: "calculated", label: "Calculated" },
];

function QualifierSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={(v) => { if (v !== null) onChange(v); }}>
      <SelectTrigger className="w-28 shrink-0 h-8 text-xs">
        <span className="text-xs">{DATE_QUALIFIERS.find(q => q.value === value)?.label ?? "Exact"}</span>
      </SelectTrigger>
      <SelectContent>
        {DATE_QUALIFIERS.map(q => <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>)}
      </SelectContent>
    </Select>
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
  const [birthDateQ,   setBirthDateQ]   = useState("exact");
  const [birthDate2,   setBirthDate2]   = useState("");
  const [birthLoc,     setBirthLoc]     = useState("");
  const [birthPlaceId, setBirthPlaceId] = useState<string|null>(null);
  const [deathDate,    setDeathDate]    = useState("");
  const [deathDateQ,   setDeathDateQ]   = useState("exact");
  const [deathDate2,   setDeathDate2]   = useState("");
  const [deathLoc,     setDeathLoc]     = useState("");
  const [deathPlaceId, setDeathPlaceId] = useState<string|null>(null);
  const [sex,          setSex]          = useState("unknown");
  const [isLiving,     setIsLiving]     = useState("");
  const [occupation,   setOccupation]   = useState("");
  const [nationalities,setNationalities]= useState("");
  const [education,    setEducation]    = useState("");
  const [bio,          setBio]          = useState("");
  const [coupleType,   setCoupleType]   = useState<"spouse"|"partner">("spouse");
  const [relStart,     setRelStart]     = useState("");
  const [relEnd,       setRelEnd]       = useState("");

  const reset = () => {
    setGivenName(""); setFamilyName(""); setMaidenName(""); setNickname("");
    setBirthDate(""); setBirthDateQ("exact"); setBirthDate2("");
    setBirthLoc(""); setBirthPlaceId(null);
    setDeathDate(""); setDeathDateQ("exact"); setDeathDate2("");
    setDeathLoc(""); setDeathPlaceId(null);
    setSex("unknown"); setIsLiving(""); setOccupation("");
    setNationalities(""); setEducation(""); setBio("");
    setCoupleType("spouse"); setRelStart(""); setRelEnd("");
  };

  const mut = useMutation({
    mutationFn: async () => {
      if (!state) return;
      const p = await createPerson(treeId, {
        given_name: givenName||undefined, family_name: familyName||undefined,
        maiden_name: maidenName||undefined, nickname: nickname||undefined,
        birth_date: birthDate||undefined, gender: sex||undefined,
        birth_date_qualifier: birthDateQ !== "exact" ? birthDateQ : undefined,
        birth_date_2: birthDateQ === "between" ? birthDate2||undefined : undefined,
        birth_location: birthLoc||undefined, birth_place_id: birthPlaceId||undefined,
        death_date: deathDate||undefined,
        death_date_qualifier: deathDateQ !== "exact" ? deathDateQ : undefined,
        death_date_2: deathDateQ === "between" ? deathDate2||undefined : undefined,
        death_location: deathLoc||undefined, death_place_id: deathPlaceId||undefined,
        is_living: isLiving === "true" ? true : isLiving === "false" ? false : undefined,
        occupation: occupation||undefined, education: education||undefined, bio: bio||undefined,
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
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Names</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Given Name</Label><Input value={givenName} onChange={(e)=>setGivenName(e.target.value)} autoFocus/></div>
              <div className="space-y-1"><Label className="text-xs">Family Name</Label><Input value={familyName} onChange={(e)=>setFamilyName(e.target.value)}/></div>
              <div className="space-y-1"><Label className="text-xs">Maiden / Birth Name</Label><Input value={maidenName} onChange={(e)=>setMaidenName(e.target.value)} placeholder="Birth surname"/></div>
              <div className="space-y-1"><Label className="text-xs">Nickname</Label><Input value={nickname} onChange={(e)=>setNickname(e.target.value)} placeholder='"Bud"'/></div>
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dates & Places</legend>
            <div className="space-y-1">
              <Label className="text-xs">Birth Date</Label>
              <div className="flex gap-2">
                <QualifierSelect value={birthDateQ} onChange={setBirthDateQ} />
                <Input type="date" value={birthDate} onChange={(e)=>setBirthDate(e.target.value)}/>
              </div>
              {birthDateQ === "between" && <Input type="date" value={birthDate2} onChange={(e)=>setBirthDate2(e.target.value)} placeholder="End date"/>}
            </div>
            <div className="space-y-1"><Label className="text-xs">Birth Location</Label><LocationInput value={birthLoc} onChange={(v,pid)=>{ setBirthLoc(v); setBirthPlaceId(pid); }}/></div>
            <div className="space-y-1">
              <Label className="text-xs">Death Date</Label>
              <div className="flex gap-2">
                <QualifierSelect value={deathDateQ} onChange={setDeathDateQ} />
                <Input type="date" value={deathDate} onChange={(e)=>setDeathDate(e.target.value)}/>
              </div>
              {deathDateQ === "between" && <Input type="date" value={deathDate2} onChange={(e)=>setDeathDate2(e.target.value)} placeholder="End date"/>}
            </div>
            <div className="space-y-1"><Label className="text-xs">Death Location</Label><LocationInput value={deathLoc} onChange={(v,pid)=>{ setDeathLoc(v); setDeathPlaceId(pid); }}/></div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Sex</Label>
                <Select value={sex} onValueChange={(v)=>{ if(v!==null) setSex(v); }}>
                  <SelectTrigger className="w-full"><span>{sex.charAt(0).toUpperCase()+sex.slice(1)}</span></SelectTrigger>
                  <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem><SelectItem value="unknown">Unknown</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={isLiving} onValueChange={(v)=>{ if(v!==null) setIsLiving(v); }}>
                  <SelectTrigger className="w-full"><span className={isLiving?"":"text-muted-foreground"}>{isLiving === "true" ? "Living" : isLiving === "false" ? "Deceased" : "Unknown"}</span></SelectTrigger>
                  <SelectContent><SelectItem value="true">Living</SelectItem><SelectItem value="false">Deceased</SelectItem><SelectItem value="">Unknown</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Occupation</Label><Input value={occupation} onChange={e=>setOccupation(e.target.value)}/></div>
              <div className="space-y-1"><Label className="text-xs">Nationalities</Label><Input value={nationalities} onChange={e=>setNationalities(e.target.value)} placeholder="e.g. Italian, Swiss"/></div>
              <div className="space-y-1 col-span-2"><Label className="text-xs">Education</Label><Input value={education} onChange={e=>setEducation(e.target.value)}/></div>
            </div>
          </fieldset>
          <div className="space-y-1"><Label className="text-xs">Bio</Label><Textarea value={bio} onChange={e=>setBio(e.target.value)} rows={2} placeholder="Life story, notes, context…"/></div>
          {state?.relation === "spouse" && (<>
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Relationship</legend>
              <div className="space-y-2">
                <Label className="text-xs">Type</Label>
                <Select value={coupleType} onValueChange={(v)=>{ if(v!==null) setCoupleType(v as "spouse"|"partner"); }}>
                  <SelectTrigger className="w-full"><span>{coupleType==="spouse"?"Spouse (married)":"Partner"}</span></SelectTrigger>
                  <SelectContent><SelectItem value="spouse">Spouse (married)</SelectItem><SelectItem value="partner">Partner</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Start Date <span className="text-muted-foreground">(optional)</span></Label><Input type="date" value={relStart} onChange={(e)=>setRelStart(e.target.value)}/></div>
                <div className="space-y-1"><Label className="text-xs">End Date <span className="text-muted-foreground">(if ended)</span></Label><Input type="date" value={relEnd} onChange={(e)=>setRelEnd(e.target.value)}/></div>
              </div>
            </fieldset>
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
  const navigate = useNavigate();
  const settings = useMemo(() => loadGraphSettings(treeId), [treeId]);

  const [addRelative,  setAddRelative]  = useState<AddRelativeState | null>(null);
  const [rootPersonId, setRootPersonId] = useState<string | null>(settings.defaultRootPersonId);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const { data: personsData, isLoading: pLoad, isError: pErr } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn:  () => listPersons(treeId, 0, 50000),
  });
  const { data: relsData, isLoading: rLoad, isError: rErr } = useQuery({
    queryKey: queryKeys.relationships.full(treeId),
    queryFn:  () => listRelationships(treeId, 0, 50000),
  });

  const persons = personsData?.items ?? [];
  const relationships = relsData?.items ?? [];

  const rootId = useMemo(() => {
    if (!persons.length) return "";
    const wanted = rootPersonId ?? findDefaultRoot(persons, relationships);
    return persons.some((p) => p.id === wanted) ? wanted : persons[0].id;
  }, [persons, relationships, rootPersonId]);

  const chartData = useMemo(() => {
    if (!persons.length) return [];
    return toFamilyChartData(persons, relationships);
  }, [persons, relationships]);

  const handleCardClick = useCallback((personId: string) => {
    setSelectedPersonId(personId);
  }, []);

  const handleRecenter = useCallback((personId: string) => {
    setRootPersonId(personId);
    setSelectedPersonId(personId);
    saveGraphSettings(treeId, { ...loadGraphSettings(treeId), defaultRootPersonId: personId });
  }, [treeId]);

  if (pLoad || rLoad) return <LoadingSpinner />;
  if (pErr  || rErr)  return (
    <div className="flex flex-col items-center gap-2 py-16 text-destructive">
      <p className="font-medium">Failed to load graph data.</p>
      <p className="text-sm text-muted-foreground">Check your connection and try refreshing.</p>
    </div>
  );

  if (!persons.length) return (
    <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground">
      <p>No people yet. Add the first person to get started.</p>
      <Button onClick={() => setAddRelative({ anchorId: "", anchorName: "", relation: "child" })}>Add First Person</Button>
      <AddRelativeDialog state={addRelative} treeId={treeId} onClose={() => setAddRelative(null)} />
    </div>
  );

  const selectedPerson = selectedPersonId ? persons.find(p => p.id === selectedPersonId) : null;

  return (
    <>
      <div style={{ height: "calc(100vh - 220px)", minHeight: 400 }} className="relative border rounded-xl overflow-hidden family-chart-light">
        <FamilyChartView
          data={chartData}
          mainId={rootId}
          onCardClick={handleCardClick}
          onRecenter={handleRecenter}
          onAddRelative={setAddRelative}
        />
        <p className="absolute bottom-2 right-2 text-xs text-muted-foreground/50 pointer-events-none select-none">
          Click to select · Ctrl+click to re-center · Scroll to zoom
        </p>
      </div>

      {selectedPerson && (
        <div className="mt-2 border rounded-lg px-4 py-3 bg-white flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {[selectedPerson.given_name, selectedPerson.family_name].filter(Boolean).join(" ") || "Unnamed"}
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedPerson.birth_date?.slice(0, 4) && `b. ${selectedPerson.birth_date.slice(0, 4)}`}
              {selectedPerson.birth_location && ` · ${selectedPerson.birth_location}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => handleRecenter(selectedPerson.id)}>
              Center tree
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/trees/${treeId}/persons/${selectedPerson.id}?from=graph`)}>
              View profile →
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setSelectedPersonId(null)}>
              &times;
            </Button>
          </div>
        </div>
      )}

      <AddRelativeDialog state={addRelative} treeId={treeId} onClose={() => setAddRelative(null)} />
    </>
  );
}
