import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createPerson, listPersons } from "@/api/persons";
import { createRelationship, listPersonRelationships } from "@/api/relationships";
import { queryKeys } from "@/lib/queryKeys";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { LocationInput } from "@/components/common/LocationInput";
import { QualifierSelect } from "@/components/common/QualifierSelect";

export type RelativeKind = "child" | "spouse" | "parent" | "sibling";

export interface AddPersonRelationship {
  anchorId: string;
  anchorName: string;
  relation: RelativeKind;
}

interface Props {
  open: boolean;
  onClose: () => void;
  treeId: string;
  relationship?: AddPersonRelationship | null;
}

export function AddPersonDialog({ open, onClose, treeId, relationship }: Props) {
  const queryClient = useQueryClient();
  const [submitted, setSubmitted] = useState(false);
  const [mode, setMode] = useState<"create" | "link">("create");

  // Link existing person state
  const [linkPersonId, setLinkPersonId] = useState("");
  const [linkSearch, setLinkSearch] = useState("");

  // Create new person state
  const [givenName,    setGivenName]    = useState("");
  const [familyName,   setFamilyName]   = useState("");
  const [maidenName,   setMaidenName]   = useState("");
  const [nickname,     setNickname]     = useState("");
  const [birthDate,    setBirthDate]    = useState("");
  const [birthDateQ,   setBirthDateQ]   = useState("exact");
  const [birthDate2,   setBirthDate2]   = useState("");
  const [birthLoc,     setBirthLoc]     = useState("");
  const [birthPlaceId, setBirthPlaceId] = useState<string | null>(null);
  const [deathDate,    setDeathDate]    = useState("");
  const [deathDateQ,   setDeathDateQ]   = useState("exact");
  const [deathDate2,   setDeathDate2]   = useState("");
  const [deathLoc,     setDeathLoc]     = useState("");
  const [deathPlaceId, setDeathPlaceId] = useState<string | null>(null);
  const [sex,          setSex]          = useState("unknown");
  const [isDeceased,   setIsDeceased]   = useState(false);
  const [occupation,   setOccupation]   = useState("");
  const [nationalities, setNationalities] = useState("");
  const [education,    setEducation]    = useState("");
  const [bio,          setBio]          = useState("");
  const [coupleType,   setCoupleType]   = useState<"spouse" | "partner">("spouse");
  const [relStart,     setRelStart]     = useState("");
  const [relEnd,       setRelEnd]       = useState("");
  const [relEnded,     setRelEnded]     = useState(false);

  // Sibling: which parent(s) to use
  const [siblingParentIds, setSiblingParentIds] = useState<string[]>([]);

  // Fetch persons for link mode + sibling parent resolution
  const { data: personsData } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn: () => listPersons(treeId, 0, 50000),
    enabled: open,
  });

  // Fetch anchor person's relationships (for sibling parent resolution + child co-parent)
  const { data: anchorRels } = useQuery({
    queryKey: queryKeys.relationships.forPerson(treeId, relationship?.anchorId ?? ""),
    queryFn: () => listPersonRelationships(treeId, relationship?.anchorId ?? ""),
    enabled: open && (relationship?.relation === "sibling" || relationship?.relation === "child") && !!relationship?.anchorId,
  });

  const anchorParents = useMemo(() => {
    if (!anchorRels || !relationship?.anchorId) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const r of anchorRels) {
      let parentId: string | null = null;
      if (r.relationship_type === "parent" && r.person_b_id === relationship.anchorId) parentId = r.person_a_id;
      else if (r.relationship_type === "child" && r.person_a_id === relationship.anchorId) parentId = r.person_b_id;
      if (parentId && !seen.has(parentId)) { seen.add(parentId); result.push(parentId); }
    }
    return result;
  }, [anchorRels, relationship]);

  const anchorSpouses = useMemo(() => {
    if (!anchorRels || !relationship?.anchorId) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const r of anchorRels) {
      if (r.relationship_type !== "spouse" && r.relationship_type !== "partner") continue;
      const otherId = r.person_a_id === relationship.anchorId ? r.person_b_id : r.person_a_id;
      if (!seen.has(otherId)) { seen.add(otherId); result.push(otherId); }
    }
    return result;
  }, [anchorRels, relationship]);

  // Auto-select shared parents (sibling) or co-parents (child) when they load
  const [parentsInitialized, setParentsInitialized] = useState(false);
  const initList = relationship?.relation === "child" ? anchorSpouses : anchorParents;
  if (initList.length > 0 && !parentsInitialized) {
    setSiblingParentIds(initList);
    setParentsInitialized(true);
  }

  const persons = personsData?.items ?? [];

  const duplicateWarning = useMemo(() => {
    if (mode !== "create") return null;
    const gn = givenName.trim().toLowerCase();
    const fn = familyName.trim().toLowerCase();
    if (!gn && !fn) return null;
    const matches = persons.filter(p => {
      const pg = (p.given_name ?? "").toLowerCase();
      const pf = (p.family_name ?? "").toLowerCase();
      if (gn && fn) return pg === gn && pf === fn;
      if (gn) return pg === gn && pf === fn;
      return pf === fn;
    });
    if (matches.length === 0) return null;
    const names = matches.slice(0, 3).map(p => {
      const name = [p.given_name, p.family_name].filter(Boolean).join(" ");
      const year = p.birth_date?.slice(0, 4);
      return year ? `${name} (b. ${year})` : name;
    });
    return `Similar person${matches.length > 1 ? "s" : ""} already in this tree: ${names.join(", ")}${matches.length > 3 ? ` and ${matches.length - 3} more` : ""}`;
  }, [mode, givenName, familyName, persons]);

  const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const filteredPersons = useMemo(() => {
    const q = normalize(linkSearch.trim());
    if (!q) return [];
    return persons
      .filter(p => {
        const name = [p.given_name, p.family_name].filter(Boolean).join(" ");
        return normalize(name).includes(q);
      })
      .slice(0, 10);
  }, [persons, linkSearch]);

  const personName = (id: string) => {
    const p = persons.find(pp => pp.id === id);
    return p ? [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed" : id.slice(0, 8);
  };

  const reset = () => {
    setSubmitted(false); setMode("create");
    setLinkPersonId(""); setLinkSearch("");
    setGivenName(""); setFamilyName(""); setMaidenName(""); setNickname("");
    setBirthDate(""); setBirthDateQ("exact"); setBirthDate2("");
    setBirthLoc(""); setBirthPlaceId(null);
    setDeathDate(""); setDeathDateQ("exact"); setDeathDate2("");
    setDeathLoc(""); setDeathPlaceId(null);
    setSex("unknown"); setIsDeceased(false); setOccupation("");
    setNationalities(""); setEducation(""); setBio("");
    setCoupleType("spouse"); setRelStart(""); setRelEnd(""); setRelEnded(false);
    setSiblingParentIds([]); setParentsInitialized(false);
  };

  const hasName = !!(givenName.trim() || familyName.trim());
  const invalid = (field: string) => submitted && !hasName && (field === "givenName" || field === "familyName");

  const mut = useMutation({
    mutationFn: async () => {
      if (mode === "link") {
        if (!linkPersonId || !relationship?.anchorId) throw new Error("Select a person");
        const rel = relationship.relation === "child"
          ? { person_a_id: relationship.anchorId, person_b_id: linkPersonId, relationship_type: "parent" }
          : relationship.relation === "spouse"
          ? { person_a_id: relationship.anchorId, person_b_id: linkPersonId, relationship_type: coupleType, start_date: relStart || undefined, end_date: relEnd || undefined }
          : relationship.relation === "parent"
          ? { person_a_id: linkPersonId, person_b_id: relationship.anchorId, relationship_type: "parent" }
          : relationship.relation === "sibling"
          ? null // handled below
          : null;
        if (relationship.relation === "sibling") {
          for (const pid of siblingParentIds) {
            await createRelationship(treeId, { person_a_id: pid, person_b_id: linkPersonId, relationship_type: "parent" });
          }
        } else if (rel) {
          await createRelationship(treeId, rel);
          if (relationship.relation === "child") {
            for (const pid of siblingParentIds) {
              await createRelationship(treeId, { person_a_id: pid, person_b_id: linkPersonId, relationship_type: "parent" });
            }
          }
        }
        return;
      }

      const p = await createPerson(treeId, {
        given_name: givenName || undefined, family_name: familyName || undefined,
        maiden_name: maidenName || undefined, nickname: nickname || undefined,
        birth_date: birthDate || undefined, gender: sex || undefined,
        birth_date_qualifier: birthDateQ !== "exact" ? birthDateQ : undefined,
        birth_date_2: birthDateQ === "between" ? birthDate2 || undefined : undefined,
        birth_location: birthLoc || undefined, birth_place_id: birthPlaceId || undefined,
        death_date: deathDate || undefined,
        death_date_qualifier: deathDateQ !== "exact" ? deathDateQ : undefined,
        death_date_2: deathDateQ === "between" ? deathDate2 || undefined : undefined,
        death_location: deathLoc || undefined, death_place_id: deathPlaceId || undefined,
        is_living: isDeceased ? false : undefined,
        occupation: occupation || undefined, education: education || undefined, bio: bio || undefined,
        nationalities: nationalities ? nationalities.split(",").map(s => s.trim()).filter(Boolean) : undefined,
      });

      if (relationship?.anchorId) {
        if (relationship.relation === "sibling") {
          for (const pid of siblingParentIds) {
            await createRelationship(treeId, { person_a_id: pid, person_b_id: p.id, relationship_type: "parent" });
          }
        } else {
          const rel = relationship.relation === "child"
            ? { person_a_id: relationship.anchorId, person_b_id: p.id, relationship_type: "parent" }
            : relationship.relation === "spouse"
            ? { person_a_id: relationship.anchorId, person_b_id: p.id, relationship_type: coupleType, start_date: relStart || undefined, end_date: relEnd || undefined }
            : { person_a_id: p.id, person_b_id: relationship.anchorId, relationship_type: "parent" };
          await createRelationship(treeId, rel);
          if (relationship.relation === "child") {
            for (const pid of siblingParentIds) {
              await createRelationship(treeId, { person_a_id: pid, person_b_id: p.id, relationship_type: "parent" });
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.all(treeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.all(treeId) });
      toast.success(mode === "link" ? "Person linked" : "Person added");
      reset(); onClose();
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed"); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (mode === "create" && !hasName) return;
    if (mode === "link" && !linkPersonId) return;
    mut.mutate();
  };

  const LABELS: Record<RelativeKind, string> = { child: "Child", spouse: "Spouse/Partner", parent: "Parent", sibling: "Sibling" };
  const title = relationship?.anchorId
    ? `Add ${LABELS[relationship.relation]} of ${relationship.anchorName}`
    : "Add Person";

  const fieldBorder = (field: string) => invalid(field) ? "border-destructive" : "";
  const showLinkOption = !!relationship?.anchorId;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>

        {/* Mode toggle */}
        {showLinkOption && (
          <div className="flex gap-1 rounded-lg border p-0.5 bg-muted/50">
            <button
              type="button"
              onClick={() => setMode("create")}
              className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${mode === "create" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
            >
              Create new person
            </button>
            <button
              type="button"
              onClick={() => setMode("link")}
              className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${mode === "link" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
            >
              Link existing person
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "link" ? (
            /* ── Link existing person ── */
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Search person</Label>
                {linkPersonId ? (
                  <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-primary/10 text-primary">
                    <span className="text-sm font-medium flex-1 truncate">{linkSearch}</span>
                    <button
                      type="button"
                      onClick={() => { setLinkPersonId(""); setLinkSearch(""); }}
                      className="shrink-0 text-primary/60 hover:text-primary transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Input
                      value={linkSearch}
                      onChange={e => setLinkSearch(e.target.value)}
                      placeholder="Type a name…"
                      autoFocus
                    />
                    {linkSearch.trim() && (
                      <div className="rounded-lg border bg-muted/40 overflow-hidden">
                        {filteredPersons.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-3">No matches found.</p>
                        ) : filteredPersons.map(p => {
                          const name = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
                          const year = p.birth_date?.slice(0, 4);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { setLinkPersonId(p.id); setLinkSearch(name); }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                            >
                              <span className="font-medium truncate flex-1">{name}</span>
                              {year && <span className="text-xs text-muted-foreground shrink-0">b. {year}</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {submitted && !linkPersonId && <p className="text-xs text-destructive">Select a person to link.</p>}
            </div>
          ) : (
            /* ── Create new person ── */
            <>
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Names</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">First Name</Label>
                    <Input value={givenName} onChange={(e) => setGivenName(e.target.value)} autoFocus className={fieldBorder("givenName")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name</Label>
                    <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} className={fieldBorder("familyName")} />
                  </div>
                  <div className="space-y-1"><Label className="text-xs">Maiden / Birth Name</Label><Input value={maidenName} onChange={(e) => setMaidenName(e.target.value)} placeholder="Birth surname" /></div>
                  <div className="space-y-1"><Label className="text-xs">Nickname</Label><Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder='"Bud"' /></div>
                </div>
                {submitted && !hasName && <p className="text-xs text-destructive">At least a given name or family name is required.</p>}
                {duplicateWarning && <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5">{duplicateWarning}</p>}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dates & Places</legend>
                <div className="space-y-1">
                  <Label className="text-xs">Birth Date</Label>
                  <div className="flex gap-2">
                    <QualifierSelect value={birthDateQ} onChange={setBirthDateQ} />
                    <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                  </div>
                  {birthDateQ === "between" && <Input type="date" value={birthDate2} onChange={(e) => setBirthDate2(e.target.value)} placeholder="End date" />}
                </div>
                <div className="space-y-1"><Label className="text-xs">Birth Location</Label><LocationInput value={birthLoc} onChange={(v, pid) => { setBirthLoc(v); setBirthPlaceId(pid); }} /></div>
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isDeceased}
                      onChange={e => {
                        setIsDeceased(e.target.checked);
                        if (!e.target.checked) {
                          setDeathDate(""); setDeathDateQ("exact"); setDeathDate2("");
                          setDeathLoc(""); setDeathPlaceId(null);
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-xs font-medium">Deceased</span>
                  </label>
                </div>
                {isDeceased && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Death Date</Label>
                      <div className="flex gap-2">
                        <QualifierSelect value={deathDateQ} onChange={setDeathDateQ} />
                        <Input type="date" value={deathDate} onChange={(e) => setDeathDate(e.target.value)} />
                      </div>
                      {deathDateQ === "between" && <Input type="date" value={deathDate2} onChange={(e) => setDeathDate2(e.target.value)} placeholder="End date" />}
                    </div>
                    <div className="space-y-1"><Label className="text-xs">Death Location</Label><LocationInput value={deathLoc} onChange={(v, pid) => { setDeathLoc(v); setDeathPlaceId(pid); }} /></div>
                  </>
                )}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Sex</Label>
                    <Select value={sex} onValueChange={(v) => { if (v !== null) setSex(v); }}>
                      <SelectTrigger className="w-full"><span>{sex.charAt(0).toUpperCase() + sex.slice(1)}</span></SelectTrigger>
                      <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem><SelectItem value="unknown">Unknown</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">Occupation</Label><Input value={occupation} onChange={e => setOccupation(e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Nationalities</Label><Input value={nationalities} onChange={e => setNationalities(e.target.value)} placeholder="e.g. Italian, Swiss" /></div>
                  <div className="space-y-1 col-span-2"><Label className="text-xs">Education</Label><Input value={education} onChange={e => setEducation(e.target.value)} /></div>
                </div>
              </fieldset>

              <div className="space-y-1"><Label className="text-xs">Bio</Label><Textarea value={bio} onChange={e => setBio(e.target.value)} rows={2} placeholder="Life story, notes, context…" /></div>
            </>
          )}

          {/* Relationship options (spouse dates, sibling parent selection) */}
          {relationship?.relation === "spouse" && (
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Relationship</legend>
              <div className="space-y-2">
                <Label className="text-xs">Type</Label>
                <Select value={coupleType} onValueChange={(v) => { if (v !== null) setCoupleType(v as "spouse" | "partner"); }}>
                  <SelectTrigger className="w-full"><span>{coupleType === "spouse" ? "Spouse (married)" : "Partner"}</span></SelectTrigger>
                  <SelectContent><SelectItem value="spouse">Spouse (married)</SelectItem><SelectItem value="partner">Partner</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start Date <span className="text-muted-foreground">(optional)</span></Label>
                <Input type="date" value={relStart} onChange={(e) => setRelStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={relEnded}
                    onChange={e => { setRelEnded(e.target.checked); if (!e.target.checked) setRelEnd(""); }}
                    className="rounded"
                  />
                  <span className="text-xs font-medium">Ended</span>
                </label>
              </div>
              {relEnded && (
                <div className="space-y-1">
                  <Label className="text-xs">End Date</Label>
                  <Input type="date" value={relEnd} onChange={(e) => setRelEnd(e.target.value)} />
                </div>
              )}
            </fieldset>
          )}

          {relationship?.relation === "child" && anchorSpouses.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Other Parent</legend>
              <p className="text-xs text-muted-foreground">Select which partner(s) of {relationship.anchorName} are also a parent.</p>
              <div className="space-y-1">
                {anchorSpouses.map(pid => (
                  <label key={pid} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={siblingParentIds.includes(pid)}
                      onChange={e => {
                        if (e.target.checked) setSiblingParentIds(prev => [...prev, pid]);
                        else setSiblingParentIds(prev => prev.filter(id => id !== pid));
                      }}
                      className="rounded"
                    />
                    {personName(pid)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {relationship?.relation === "sibling" && anchorParents.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shared Parents</legend>
              <p className="text-xs text-muted-foreground">Select which parent(s) are shared with {relationship.anchorName}.</p>
              <div className="space-y-1">
                {anchorParents.map(pid => (
                  <label key={pid} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={siblingParentIds.includes(pid)}
                      onChange={e => {
                        if (e.target.checked) setSiblingParentIds(prev => [...prev, pid]);
                        else setSiblingParentIds(prev => prev.filter(id => id !== pid));
                      }}
                      className="rounded"
                    />
                    {personName(pid)}
                  </label>
                ))}
              </div>
              {anchorParents.length === 0 && (
                <p className="text-xs text-amber-500">No parents found for {relationship.anchorName}. Add parents first.</p>
              )}
            </fieldset>
          )}

          {mut.error && <p className="text-sm text-destructive">{mut.error instanceof Error ? mut.error.message : "Failed"}</p>}
          <Button type="submit" className="w-full" disabled={mut.isPending}>
            {mut.isPending ? "Adding…" : mode === "link" ? "Link" : "Add"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
