import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPerson, updatePerson, deletePerson, listPersons } from "@/api/persons";
import { getMediaDownloadUrl } from "@/api/media";
import { listPersonRelationships, updateRelationship, deleteRelationship } from "@/api/relationships";
import { listStories } from "@/api/stories";
import { formatFlexDate } from "@/lib/dates";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { LocationInput } from "@/components/common/LocationInput";
import type { Relationship } from "@/types/relationship";

// ─── Constants ────────────────────────────────────────────────────────────────

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

type FormState = {
  given_name: string; family_name: string; maiden_name: string; nickname: string;
  birth_date: string; birth_date_qualifier: string; birth_date_2: string;
  death_date: string; death_date_qualifier: string; death_date_2: string;
  birth_location: string; birth_place_id: string | null;
  death_location: string; death_place_id: string | null;
  gender: string; is_living: "" | "true" | "false";
  occupation: string; nationalities: string; education: string; bio: string;
};

const EMPTY_FORM: FormState = {
  given_name: "", family_name: "", maiden_name: "", nickname: "",
  birth_date: "", birth_date_qualifier: "exact", birth_date_2: "",
  death_date: "", death_date_qualifier: "exact", death_date_2: "",
  birth_location: "", birth_place_id: null,
  death_location: "", death_place_id: null,
  gender: "", is_living: "", occupation: "", nationalities: "", education: "", bio: "",
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function Avatar({ initials, imgUrl, size = 64 }: { initials: string; imgUrl?: string | null; size?: number }) {
  if (imgUrl) return <img src={imgUrl} alt="" className="rounded-full object-cover border shrink-0" style={{ width: size, height: size }} />;
  return (
    <div className="rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600 shrink-0" style={{ width: size, height: size, fontSize: size * 0.32 }}>
      {initials}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-5"><CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent className="px-5 pb-4">{children}</CardContent>
    </Card>
  );
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

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

// ─── PersonDetailPage ─────────────────────────────────────────────────────────

export function PersonDetailPage() {
  const { treeId, personId } = useParams<{ treeId: string; personId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const { data: person, isLoading, error } = useQuery({
    queryKey: queryKeys.persons.detail(treeId!, personId!),
    queryFn:  () => getPerson(treeId!, personId!),
    enabled:  !!treeId && !!personId,
  });

  const { data: allPersons } = useQuery({
    queryKey: queryKeys.persons.full(treeId!),
    queryFn:  () => listPersons(treeId!, 0, 50000),
    enabled:  !!treeId,
  });

  const { data: relationships } = useQuery({
    queryKey: queryKeys.relationships.forPerson(treeId!, personId!),
    queryFn:  () => listPersonRelationships(treeId!, personId!),
    enabled:  !!treeId && !!personId,
  });

  const { data: stories } = useQuery({
    queryKey: [...queryKeys.stories.all(treeId!), "person", personId],
    queryFn:  () => listStories(treeId!, { person_id: personId }),
    enabled:  !!treeId && !!personId,
  });

  const resolvePersonName = (id: string) => {
    const p = allPersons?.items.find((p) => p.id === id);
    return p ? [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed" : "Unknown";
  };
  const resolveInitials = (id: string) => {
    const p = allPersons?.items.find((p) => p.id === id);
    return ((p?.given_name?.[0] ?? "") + (p?.family_name?.[0] ?? "")).toUpperCase() || "?";
  };

  const relLabel = (rel: Relationship) => {
    if (rel.relationship_type === "spouse")  return "Spouse";
    if (rel.relationship_type === "partner") return "Partner";
    if (rel.relationship_type === "parent")
      return rel.person_a_id === personId ? "Parent of" : "Child of";
    return rel.relationship_type;
  };
  const relDateRange = (rel: Relationship) => {
    if (!rel.start_date && !rel.end_date) return null;
    return `${rel.start_date?.slice(0, 4) ?? "?"} – ${rel.end_date ? rel.end_date.slice(0, 4) : "present"}`;
  };

  const [editingRel, setEditingRel]   = useState<Relationship | null>(null);
  const [relType,    setRelType]      = useState("");
  const [relStart,   setRelStart]     = useState("");
  const [relEnd,     setRelEnd]       = useState("");

  const startRelEdit = (rel: Relationship) => {
    setEditingRel(rel); setRelType(rel.relationship_type);
    setRelStart(rel.start_date ?? ""); setRelEnd(rel.end_date ?? "");
  };

  const updateRelMut = useMutation({
    mutationFn: () => updateRelationship(treeId!, editingRel!.id, { relationship_type: relType, start_date: relStart||undefined, end_date: relEnd||undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.forPerson(treeId!, personId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.all(treeId!) });
      setEditingRel(null);
    },
  });

  const deleteRelMut = useMutation({
    mutationFn: (relId: string) => deleteRelationship(treeId!, relId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.forPerson(treeId!, personId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.all(treeId!) });
    },
  });

  const updateMut = useMutation({
    mutationFn: () => updatePerson(treeId!, personId!, {
      ...form,
      // empty strings are invalid for date fields — convert to null
      birth_date:          form.birth_date          || null,
      birth_date_2:        form.birth_date_qualifier === "between" ? form.birth_date_2 || null : null,
      death_date:          form.death_date          || null,
      death_date_2:        form.death_date_qualifier === "between" ? form.death_date_2 || null : null,
      is_living:           form.is_living === "true" ? true : form.is_living === "false" ? false : null,
      nationalities:       form.nationalities ? form.nationalities.split(",").map(s => s.trim()).filter(Boolean) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.detail(treeId!, personId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.all(treeId!) });
      setEditing(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deletePerson(treeId!, personId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.all(treeId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.all(treeId!) });
      navigate(`/trees/${treeId}`);
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Person not found" />;
  if (!person) return null;

  const startEdit = () => {
    setForm({
      given_name: person.given_name || "", family_name: person.family_name || "",
      maiden_name: person.maiden_name || "", nickname: person.nickname || "",
      birth_date: person.birth_date || "", birth_date_qualifier: person.birth_date_qualifier || "exact", birth_date_2: person.birth_date_2 || "",
      death_date: person.death_date || "", death_date_qualifier: person.death_date_qualifier || "exact", death_date_2: person.death_date_2 || "",
      birth_location: person.birth_location || "", birth_place_id: person.birth_place_id ?? null,
      death_location: person.death_location || "", death_place_id: person.death_place_id ?? null,
      gender: person.gender || "", is_living: person.is_living === true ? "true" : person.is_living === false ? "false" : "",
      occupation: person.occupation || "", nationalities: person.nationalities?.join(", ") || "",
      education: person.education || "", bio: person.bio || "",
    });
    setEditing(true);
  };

  const name     = [person.given_name, person.family_name].filter(Boolean).join(" ") || "Unnamed";
  const initials = ((person.given_name?.[0] ?? "") + (person.family_name?.[0] ?? "")).toUpperCase() || "?";
  const profilePicUrl = person.profile_picture_id ? getMediaDownloadUrl(treeId!, person.profile_picture_id) : null;

  const birthFmt = formatFlexDate(person.birth_date, person.birth_date_qualifier, person.birth_date_2, person.birth_date_original);
  const deathFmt = formatFlexDate(person.death_date, person.death_date_qualifier, person.death_date_2, person.death_date_original);

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="space-y-4 max-w-2xl">
        {/* Sticky top bar */}
        <div className="flex items-center justify-between sticky top-0 bg-background py-2 z-10 border-b">
          <p className="font-semibold">Editing {name}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" disabled={updateMut.isPending} onClick={() => updateMut.mutate()}>{updateMut.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </div>

        {/* Names */}
        <SectionCard title="Names">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1"><Label className="text-xs">Given Name</Label><Input value={form.given_name} onChange={set("given_name")} /></div>
            <div className="space-y-1"><Label className="text-xs">Family Name</Label><Input value={form.family_name} onChange={set("family_name")} /></div>
            <div className="space-y-1"><Label className="text-xs">Maiden / Birth Name</Label><Input value={form.maiden_name} onChange={set("maiden_name")} placeholder="Birth surname" /></div>
            <div className="space-y-1"><Label className="text-xs">Nickname</Label><Input value={form.nickname} onChange={set("nickname")} placeholder='e.g. "Bud"' /></div>
          </div>
        </SectionCard>

        {/* Dates & places */}
        <SectionCard title="Dates & Places">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Birth Date</Label>
              <div className="flex gap-2">
                <QualifierSelect value={form.birth_date_qualifier} onChange={(v) => setForm(f => ({ ...f, birth_date_qualifier: v }))} />
                <Input type="date" value={form.birth_date} onChange={set("birth_date")} />
              </div>
              {form.birth_date_qualifier === "between" && <Input type="date" value={form.birth_date_2} onChange={set("birth_date_2")} placeholder="End date" />}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Birth Location</Label>
              <LocationInput value={form.birth_location} onChange={(v, pid) => setForm(f => ({ ...f, birth_location: v, birth_place_id: pid }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Death Date</Label>
              <div className="flex gap-2">
                <QualifierSelect value={form.death_date_qualifier} onChange={(v) => setForm(f => ({ ...f, death_date_qualifier: v }))} />
                <Input type="date" value={form.death_date} onChange={set("death_date")} />
              </div>
              {form.death_date_qualifier === "between" && <Input type="date" value={form.death_date_2} onChange={set("death_date_2")} placeholder="End date" />}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Death Location</Label>
              <LocationInput value={form.death_location} onChange={(v, pid) => setForm(f => ({ ...f, death_location: v, death_place_id: pid }))} />
            </div>
          </div>
        </SectionCard>

        {/* Identity */}
        <SectionCard title="Identity">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Sex</Label>
              <Select value={form.gender} onValueChange={(v) => { if (v !== null) setForm(f => ({ ...f, gender: v })); }}>
                <SelectTrigger className="w-full"><span className={form.gender ? undefined : "text-muted-foreground"}>{form.gender ? form.gender.charAt(0).toUpperCase() + form.gender.slice(1) : "Select sex"}</span></SelectTrigger>
                <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem><SelectItem value="unknown">Unknown</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={form.is_living} onValueChange={(v) => { if (v !== null) setForm(f => ({ ...f, is_living: v as FormState["is_living"] })); }}>
                <SelectTrigger className="w-full"><span className={form.is_living ? undefined : "text-muted-foreground"}>{form.is_living === "true" ? "Living" : form.is_living === "false" ? "Deceased" : "Unknown"}</span></SelectTrigger>
                <SelectContent><SelectItem value="true">Living</SelectItem><SelectItem value="false">Deceased</SelectItem><SelectItem value="">Unknown</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Occupation</Label><Input value={form.occupation} onChange={set("occupation")} /></div>
            <div className="space-y-1"><Label className="text-xs">Nationalities</Label><Input value={form.nationalities} onChange={set("nationalities")} placeholder="e.g. Italian, French" /></div>
            <div className="space-y-1 col-span-2"><Label className="text-xs">Education</Label><Input value={form.education} onChange={set("education")} /></div>
          </div>
        </SectionCard>

        {/* Bio */}
        <SectionCard title="Bio">
          <Textarea value={form.bio} onChange={set("bio")} rows={5} placeholder="Life story, notes, context…" />
        </SectionCard>

        {updateMut.error && <p className="text-sm text-destructive">{updateMut.error instanceof Error ? updateMut.error.message : "Failed to save"}</p>}
      </div>
    );
  }

  // ── View mode ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link to={`/trees/${treeId}`} className="hover:text-foreground">← Tree</Link>
        <span>/</span>
        <Link to={`/trees/${treeId}?tab=graph`} className="hover:text-foreground">Graph</Link>
        <span>/</span>
        <Link to={`/trees/${treeId}?tab=people`} className="hover:text-foreground">People</Link>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4">
        <Avatar initials={initials} imgUrl={profilePicUrl} size={72} />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold leading-tight">
            {name}
            {person.maiden_name && <span className="text-lg font-normal text-muted-foreground ml-2">(née {person.maiden_name})</span>}
          </h1>
          {person.nickname && <p className="text-sm text-muted-foreground italic">"{person.nickname}"</p>}
          <p className="text-sm text-muted-foreground mt-1">
            {birthFmt && deathFmt ? `${birthFmt} – ${deathFmt}` : birthFmt ? `b. ${birthFmt}` : deathFmt ? `d. ${deathFmt}` : null}
            {birthFmt && person.birth_location && ` · ${person.birth_location}`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
          <Button variant="destructive" size="sm" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>Delete</Button>
        </div>
      </div>

      {/* About */}
      {(person.gender || person.occupation || person.nationalities?.length || person.education || person.is_living !== null) && (
        <SectionCard title="About">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {person.gender      && <InfoPair label="Sex"         value={person.gender.charAt(0).toUpperCase() + person.gender.slice(1)} />}
            {person.occupation  && <InfoPair label="Occupation"  value={person.occupation} />}
            {person.nationalities && person.nationalities.length > 0 && <InfoPair label="Nationality" value={person.nationalities.join(", ")} />}
            {person.education   && <InfoPair label="Education"   value={person.education} />}
            {(person.birth_location || person.death_location) && (
              <div className="col-span-2 grid grid-cols-2 gap-x-6">
                {person.birth_location && <InfoPair label="Born in" value={person.birth_location} />}
                {person.death_location && <InfoPair label="Died in" value={person.death_location} />}
              </div>
            )}
            {person.is_living === true  && !person.death_date && <InfoPair label="Status" value="Living" />}
            {person.is_living === false && !person.death_date && <InfoPair label="Status" value="Deceased" />}
          </div>
        </SectionCard>
      )}

      {/* Bio */}
      {person.bio && (
        <SectionCard title="Bio">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{person.bio}</p>
        </SectionCard>
      )}

      {/* Relationships */}
      {relationships && relationships.length > 0 && (
        <SectionCard title="Relationships">
          <div className="space-y-2">
            {relationships.map((rel) => {
              const otherId = rel.person_a_id === personId ? rel.person_b_id : rel.person_a_id;
              return (
                <div key={rel.id} className="flex items-center gap-2">
                  <Badge variant="secondary" className="w-20 justify-center text-xs shrink-0">{relLabel(rel)}</Badge>
                  <Link to={`/trees/${treeId}/persons/${otherId}`} className="flex items-center gap-2 group min-w-0 flex-1">
                    <Avatar initials={resolveInitials(otherId)} size={26} />
                    <span className="text-sm font-medium group-hover:text-primary group-hover:underline truncate">{resolvePersonName(otherId)}</span>
                  </Link>
                  {relDateRange(rel) && <span className="text-xs text-muted-foreground shrink-0">{relDateRange(rel)}</span>}
                  <div className="flex gap-1 shrink-0 ml-auto">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => startRelEdit(rel)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive" onClick={() => deleteRelMut.mutate(rel.id)}>Del</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Stories */}
      {stories && stories.items.length > 0 && (
        <SectionCard title="Stories">
          <div className="space-y-1">
            {stories.items.map((s) => (
              <Link key={s.id} to={`/trees/${treeId}/stories/${s.id}`}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted transition-colors group"
              >
                <span className="text-sm font-medium group-hover:text-primary">{s.title}</span>
                {s.event_date && <span className="text-xs text-muted-foreground ml-4 shrink-0">{s.event_date.slice(0, 4)}</span>}
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Relationship edit dialog */}
      <Dialog open={!!editingRel} onOpenChange={o => { if (!o) setEditingRel(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Relationship</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); updateRelMut.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Type</Label>
              <Select value={relType} onValueChange={v => { if (v !== null) setRelType(v); }}>
                <SelectTrigger className="w-full"><span>{relType || "Select type"}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="spouse">Spouse</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(relType === "spouse" || relType === "partner") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Start Date</Label><Input type="date" value={relStart} onChange={e => setRelStart(e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">End Date</Label><Input type="date" value={relEnd} onChange={e => setRelEnd(e.target.value)} /></div>
              </div>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={updateRelMut.isPending} className="flex-1">{updateRelMut.isPending ? "Saving…" : "Save"}</Button>
              <Button type="button" variant="outline" onClick={() => setEditingRel(null)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
