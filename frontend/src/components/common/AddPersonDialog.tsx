import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createPerson } from "@/api/persons";
import { createRelationship } from "@/api/relationships";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { LocationInput } from "@/components/common/LocationInput";
import { QualifierSelect } from "@/components/common/QualifierSelect";

export type RelativeKind = "child" | "spouse" | "parent";

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
  const [isLiving,     setIsLiving]     = useState("");
  const [occupation,   setOccupation]   = useState("");
  const [nationalities, setNationalities] = useState("");
  const [education,    setEducation]    = useState("");
  const [bio,          setBio]          = useState("");
  const [coupleType,   setCoupleType]   = useState<"spouse" | "partner">("spouse");
  const [relStart,     setRelStart]     = useState("");
  const [relEnd,       setRelEnd]       = useState("");

  const reset = () => {
    setSubmitted(false);
    setGivenName(""); setFamilyName(""); setMaidenName(""); setNickname("");
    setBirthDate(""); setBirthDateQ("exact"); setBirthDate2("");
    setBirthLoc(""); setBirthPlaceId(null);
    setDeathDate(""); setDeathDateQ("exact"); setDeathDate2("");
    setDeathLoc(""); setDeathPlaceId(null);
    setSex("unknown"); setIsLiving(""); setOccupation("");
    setNationalities(""); setEducation(""); setBio("");
    setCoupleType("spouse"); setRelStart(""); setRelEnd("");
  };

  const hasName = !!(givenName.trim() || familyName.trim());
  const invalid = (field: string) => submitted && !hasName && (field === "givenName" || field === "familyName");

  const mut = useMutation({
    mutationFn: async () => {
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
        is_living: isLiving === "true" ? true : isLiving === "false" ? false : undefined,
        occupation: occupation || undefined, education: education || undefined, bio: bio || undefined,
        nationalities: nationalities ? nationalities.split(",").map(s => s.trim()).filter(Boolean) : undefined,
      });
      if (relationship?.anchorId) {
        const rel = relationship.relation === "child"
          ? { person_a_id: relationship.anchorId, person_b_id: p.id, relationship_type: "parent" }
          : relationship.relation === "spouse"
          ? { person_a_id: relationship.anchorId, person_b_id: p.id, relationship_type: coupleType, start_date: relStart || undefined, end_date: relEnd || undefined }
          : { person_a_id: p.id, person_b_id: relationship.anchorId, relationship_type: "parent" };
        await createRelationship(treeId, rel);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.all(treeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.all(treeId) });
      toast.success("Person added");
      reset(); onClose();
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed to add person"); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!hasName) return;
    mut.mutate();
  };

  const LABELS: Record<RelativeKind, string> = { child: "Child", spouse: "Spouse/Partner", parent: "Parent" };
  const title = relationship?.anchorId
    ? `Add ${LABELS[relationship.relation]} of ${relationship.anchorName}`
    : "Add Person";

  const fieldBorder = (field: string) => invalid(field) ? "border-destructive" : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Names */}
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Names</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Given Name</Label>
                <Input value={givenName} onChange={(e) => setGivenName(e.target.value)} autoFocus className={fieldBorder("givenName")} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Family Name</Label>
                <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} className={fieldBorder("familyName")} />
              </div>
              <div className="space-y-1"><Label className="text-xs">Birth Name</Label><Input value={maidenName} onChange={(e) => setMaidenName(e.target.value)} placeholder="Birth surname" /></div>
              <div className="space-y-1"><Label className="text-xs">Nickname</Label><Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder='"Bud"' /></div>
            </div>
            {submitted && !hasName && <p className="text-xs text-destructive">At least a given name or family name is required.</p>}
          </fieldset>

          {/* Dates & Places */}
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
              <Label className="text-xs">Death Date</Label>
              <div className="flex gap-2">
                <QualifierSelect value={deathDateQ} onChange={setDeathDateQ} />
                <Input type="date" value={deathDate} onChange={(e) => setDeathDate(e.target.value)} />
              </div>
              {deathDateQ === "between" && <Input type="date" value={deathDate2} onChange={(e) => setDeathDate2(e.target.value)} placeholder="End date" />}
            </div>
            <div className="space-y-1"><Label className="text-xs">Death Location</Label><LocationInput value={deathLoc} onChange={(v, pid) => { setDeathLoc(v); setDeathPlaceId(pid); }} /></div>
          </fieldset>

          {/* Identity */}
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
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={isLiving} onValueChange={(v) => { if (v !== null) setIsLiving(v); }}>
                  <SelectTrigger className="w-full"><span className={isLiving ? "" : "text-muted-foreground"}>{isLiving === "true" ? "Living" : isLiving === "false" ? "Deceased" : "Unknown"}</span></SelectTrigger>
                  <SelectContent><SelectItem value="true">Living</SelectItem><SelectItem value="false">Deceased</SelectItem><SelectItem value="">Unknown</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Occupation</Label><Input value={occupation} onChange={e => setOccupation(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Nationalities</Label><Input value={nationalities} onChange={e => setNationalities(e.target.value)} placeholder="e.g. Italian, Swiss" /></div>
              <div className="space-y-1 col-span-2"><Label className="text-xs">Education</Label><Input value={education} onChange={e => setEducation(e.target.value)} /></div>
            </div>
          </fieldset>

          {/* Bio */}
          <div className="space-y-1"><Label className="text-xs">Bio</Label><Textarea value={bio} onChange={e => setBio(e.target.value)} rows={2} placeholder="Life story, notes, context…" /></div>

          {/* Relationship (if linking to existing person) */}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Start Date <span className="text-muted-foreground">(optional)</span></Label><Input type="date" value={relStart} onChange={(e) => setRelStart(e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">End Date <span className="text-muted-foreground">(if ended)</span></Label><Input type="date" value={relEnd} onChange={(e) => setRelEnd(e.target.value)} /></div>
              </div>
            </fieldset>
          )}

          {mut.error && <p className="text-sm text-destructive">{mut.error instanceof Error ? mut.error.message : "Failed"}</p>}
          <Button type="submit" className="w-full" disabled={mut.isPending}>{mut.isPending ? "Adding…" : "Add"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
