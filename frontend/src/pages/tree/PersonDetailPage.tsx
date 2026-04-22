import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { toast } from "sonner";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Network } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPerson, updatePerson, deletePerson, listPersons } from "@/api/persons";
import { getTree } from "@/api/trees";
import { getPlace } from "@/api/places";
import { fetchMediaBlob, uploadMedia, listMedia } from "@/api/media";
import { AuthImage } from "@/components/common/AuthImage";
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
import { Breadcrumb } from "@/components/common/Breadcrumb";
import type { Relationship } from "@/types/relationship";

import { QualifierSelect } from "@/components/common/QualifierSelect";

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

// ─── Relationship grouping ────────────────────────────────────────────────────

type RelGroup = "parents" | "spouses" | "partners" | "children" | "other";

function groupRelationships(rels: Relationship[], personId: string): Record<RelGroup, Relationship[]> {
  const g: Record<RelGroup, Relationship[]> = { parents: [], spouses: [], partners: [], children: [], other: [] };
  const seen = new Set<string>();

  for (const rel of rels) {
    const otherId = rel.person_a_id === personId ? rel.person_b_id : rel.person_a_id;

    if (rel.relationship_type === "parent" || rel.relationship_type === "child") {
      const key = `parent:${[personId, otherId].sort().join(":")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const personIsParent =
        (rel.relationship_type === "parent" && rel.person_a_id === personId) ||
        (rel.relationship_type === "child"  && rel.person_b_id === personId);
      (personIsParent ? g.children : g.parents).push(rel);
    } else if (rel.relationship_type === "spouse") {
      const key = `spouse:${[personId, otherId].sort().join(":")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      g.spouses.push(rel);
    } else if (rel.relationship_type === "partner") {
      const key = `partner:${[personId, otherId].sort().join(":")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      g.partners.push(rel);
    } else {
      const key = `${rel.relationship_type}:${[personId, otherId].sort().join(":")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      g.other.push(rel);
    }
  }
  return g;
}

const REL_GROUP_ORDER: Array<{ key: RelGroup; label: string }> = [
  { key: "parents",  label: "Parents"  },
  { key: "spouses",  label: "Spouses"  },
  { key: "partners", label: "Partners" },
  { key: "children", label: "Children" },
  { key: "other",    label: "Other"    },
];

// ─── PersonDetailPage ─────────────────────────────────────────────────────────

export function PersonDetailPage() {
  const { treeSlug, personId } = useParams<{ treeSlug: string; personId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const { data: tree } = useQuery({
    queryKey: queryKeys.trees.detail(treeSlug!),
    queryFn:  () => getTree(treeSlug!),
    enabled:  !!treeSlug,
  });

  const treeId = tree?.id;
  const base = `/trees/${treeSlug}`;

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

  const { data: allMedia } = useQuery({
    queryKey: queryKeys.media.all(treeId!),
    queryFn: () => listMedia(treeId!),
    enabled: !!treeId,
  });

  const { data: birthPlace } = useQuery({
    queryKey: queryKeys.places.detail(person?.birth_place_id ?? "_"),
    queryFn:  () => getPlace(person!.birth_place_id!),
    enabled:  !!person?.birth_place_id,
  });

  const { data: deathPlace } = useQuery({
    queryKey: queryKeys.places.detail(person?.death_place_id ?? "_"),
    queryFn:  () => getPlace(person!.death_place_id!),
    enabled:  !!person?.death_place_id,
  });

  const resolvePersonName = (id: string) => {
    const p = allPersons?.items.find((p) => p.id === id);
    return p ? [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed" : "Unknown";
  };
  const resolveInitials = (id: string) => {
    const p = allPersons?.items.find((p) => p.id === id);
    return ((p?.given_name?.[0] ?? "") + (p?.family_name?.[0] ?? "")).toUpperCase() || "?";
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
      toast.success("Relationship updated");
      setEditingRel(null);
    },
  });

  const deleteRelMut = useMutation({
    mutationFn: (relId: string) => deleteRelationship(treeId!, relId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.forPerson(treeId!, personId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.all(treeId!) });
      toast.success("Relationship deleted");
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
      toast.success("Changes saved");
      setEditing(false);
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed to save"); },
  });

  const deleteMut = useMutation({
    mutationFn: () => deletePerson(treeId!, personId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.all(treeId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.all(treeId!) });
      toast.success("Person deleted");
      navigate(base);
    },
  });

  const picRef = useRef<HTMLInputElement>(null);
  const picMut = useMutation({
    mutationFn: async (file: File) => {
      const media = await uploadMedia(treeId!, file, { person_id: personId! });
      await updatePerson(treeId!, personId!, { profile_picture_id: media.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.detail(treeId!, personId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.media.all(treeId!) });
      toast.success("Profile picture updated");
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed to upload picture"); },
  });

  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!person?.profile_picture_id || !treeId) { setProfilePicUrl(null); return; }
    let revoke: string | null = null;
    fetchMediaBlob(treeId, person.profile_picture_id).then(url => {
      revoke = url;
      setProfilePicUrl(url);
    }).catch(() => setProfilePicUrl(null));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [person?.profile_picture_id, treeId]);

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
      <Breadcrumb items={[
        { label: "Dashboard",           href: "/dashboard" },
        { label: tree?.name ?? "Tree",  href: base },
        { label: "People",              href: `${base}/people` },
        { label: name },
      ]} />

      {/* Header */}
      <input ref={picRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) picMut.mutate(f); }} />
      <div className="flex items-start gap-4">
        <button onClick={() => picRef.current?.click()} className="relative group shrink-0" title="Change photo" disabled={picMut.isPending}>
          <Avatar initials={initials} imgUrl={profilePicUrl} size={72} />
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-white text-xs font-medium">{picMut.isPending ? "…" : "Edit"}</span>
          </div>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold leading-tight">
            {name}
            {person.maiden_name && <span className="text-lg font-normal text-muted-foreground ml-2">(née {person.maiden_name})</span>}
          </h1>
          {person.nickname && <p className="text-sm text-muted-foreground italic">"{person.nickname}"</p>}
          <p className="text-sm text-muted-foreground mt-1">
            {birthFmt && deathFmt ? `${birthFmt} – ${deathFmt}` : birthFmt ? `b. ${birthFmt}` : deathFmt ? `d. ${deathFmt}` : null}
            {(birthPlace?.display_name || person.birth_location) && (
              <span> · {birthPlace?.display_name ?? person.birth_location}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => navigate(`${base}/graph?root=${personId}`)}>
            <Network className="h-3.5 w-3.5 mr-1.5" />
            Graph
          </Button>
          <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={deleteMut.isPending}>Delete</Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMut.mutate()}
        title={`Delete ${name}?`}
        message="This person will be moved to the trash. You can restore them from the tree settings."
        confirmLabel="Move to trash"
        isPending={deleteMut.isPending}
      />

      {/* Timeline */}
      {(() => {
        type TimelineItem = { date: string | null; sortKey: string; type: "birth" | "death" | "story"; label: string; sublabel?: string; storyId?: string };
        const items: TimelineItem[] = [];

        if (person.birth_date || person.birth_location || person.birth_place_id) {
          const loc = birthPlace?.display_name ?? person.birth_location;
          items.push({ date: birthFmt, sortKey: person.birth_date ?? "0000", type: "birth", label: "Born", sublabel: loc ?? undefined });
        }

        for (const s of stories?.items ?? []) {
          items.push({
            date: s.event_date ? formatFlexDate(s.event_date, null, null, null) : null,
            sortKey: s.event_date ?? "5000",
            type: "story",
            label: s.title,
            sublabel: s.event_location ?? undefined,
            storyId: s.id,
          });
        }

        if (person.death_date || person.death_location || person.death_place_id) {
          const loc = deathPlace?.display_name ?? person.death_location;
          items.push({ date: deathFmt, sortKey: person.death_date ?? "9999", type: "death", label: "Died", sublabel: loc ?? undefined });
        }

        if (items.length === 0) return null;
        items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

        const dotColor = (type: string) =>
          type === "birth" ? "bg-emerald-500" : type === "death" ? "bg-muted-foreground" : "bg-primary";

        return (
          <SectionCard title="Timeline">
            <div className="relative pl-6">
              {/* Vertical line */}
              <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />

              <div className="space-y-4">
                {items.map((item, i) => (
                  <div key={i} className="relative flex gap-3 items-start">
                    {/* Dot */}
                    <div className={`absolute -left-6 top-1.5 w-[9px] h-[9px] rounded-full border-2 border-background ${dotColor(item.type)}`} />

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      {item.storyId ? (
                        <Link to={`${base}/stories/${item.storyId}`} className="text-sm font-medium hover:text-primary hover:underline">
                          {item.label}
                        </Link>
                      ) : (
                        <p className="text-sm font-medium">{item.label}</p>
                      )}
                      <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        {item.date && <span>{item.date}</span>}
                        {item.sublabel && <span>{item.date ? "·" : ""} {item.sublabel}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        );
      })()}

      {/* About */}
      <SectionCard title="About">
        {(person.gender || person.occupation || person.nationalities?.length || person.education || person.is_living !== null) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {person.gender     && <InfoPair label="Sex"         value={person.gender.charAt(0).toUpperCase() + person.gender.slice(1)} />}
            {person.occupation && <InfoPair label="Occupation"  value={person.occupation} />}
            {person.nationalities && person.nationalities.length > 0 && <InfoPair label="Nationality" value={person.nationalities.join(", ")} />}
            {person.education  && <InfoPair label="Education"   value={person.education} />}
            {person.is_living === true  && !person.death_date && <InfoPair label="Status" value="Living" />}
            {person.is_living === false && !person.death_date && <InfoPair label="Status" value="Deceased" />}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No details recorded yet.</p>
        )}
      </SectionCard>

      {/* Bio */}
      <SectionCard title="Biography">
        {person.bio
          ? <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{person.bio}</p>
          : <p className="text-sm text-muted-foreground italic">No biography recorded yet.</p>
        }
      </SectionCard>

      {/* Relationships */}
      {relationships && relationships.length > 0 && (() => {
        const groups = groupRelationships(relationships, personId!);
        const sections = REL_GROUP_ORDER.filter(({ key }) => groups[key].length > 0);
        return (
          <SectionCard title="Relationships">
            <div className="space-y-5">
              {sections.map(({ key, label }) => (
                <div key={key}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{label}</p>
                  <div className="space-y-1.5">
                    {groups[key].map((rel) => {
                      const otherId = rel.person_a_id === personId ? rel.person_b_id : rel.person_a_id;
                      return (
                        <div key={rel.id} className="flex items-center gap-2">
                          {key === "other" && (
                            <Badge variant="secondary" className="text-xs shrink-0">{rel.relationship_type}</Badge>
                          )}
                          <Link to={`${base}/people/${otherId}`} className="flex items-center gap-2 group min-w-0 flex-1">
                            <Avatar initials={resolveInitials(otherId)} size={28} />
                            <span className="text-sm font-medium group-hover:text-primary group-hover:underline truncate">{resolvePersonName(otherId)}</span>
                          </Link>
                          {relDateRange(rel) && <span className="text-xs text-muted-foreground shrink-0">{relDateRange(rel)}</span>}
                          <div className="flex gap-1 shrink-0 ml-auto">
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => startRelEdit(rel)}>Edit</Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive" onClick={() => deleteRelMut.mutate(rel.id)}>Delete</Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        );
      })()}


      {/* Photos */}
      {(() => {
        const photos = (allMedia ?? []).filter(m => m.person_id === personId && m.mime_type?.startsWith("image/"));
        if (photos.length === 0) return null;
        return (
          <SectionCard title="Photos">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photos.map(m => (
                <div key={m.id} className="aspect-square rounded-lg overflow-hidden border">
                  <AuthImage treeId={treeId!} mediaId={m.id} alt={m.original_filename} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </SectionCard>
        );
      })()}

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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
