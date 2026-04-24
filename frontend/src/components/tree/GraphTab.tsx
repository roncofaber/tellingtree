import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as f3 from "family-chart";
import "family-chart/styles/family-chart.css";
import { listPersons } from "@/api/persons";
import { listRelationships } from "@/api/relationships";
import { listStories } from "@/api/stories";
import { listTreePlaces } from "@/api/places";
import { queryKeys } from "@/lib/queryKeys";
import type { Person } from "@/types/person";
import type { Relationship } from "@/types/relationship";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { AddPersonDialog, type AddPersonRelationship, type RelativeKind } from "@/components/common/AddPersonDialog";
import { AuthImage } from "@/components/common/AuthImage";
import { Button } from "@/components/ui/button";
import { X, Search, UserPlus, Calendar, MapPin, Briefcase, BookOpen, TreePine } from "lucide-react";
import { getFullName, getInitials, genderColor } from "@/lib/person";
import { formatFlexDate } from "@/lib/dates";
import { loadGraphSettings, saveGraphSettings, getResolvedStyle, getResolvedLayout, applyGraphStyle, accentForGender, buildCardHtml } from "@/lib/graphSettings";

// ─── Data transformer ────────────────────────────────────────────────────────

function indexRelationships(relationships: Relationship[]) {
  const parentOf = new Map<string, Set<string>>();
  const childOf = new Map<string, Set<string>>();
  const spouseOf = new Map<string, Set<string>>();

  for (const r of relationships) {
    if (r.relationship_type === "parent") {
      // A is parent of B
      if (!parentOf.has(r.person_b_id)) parentOf.set(r.person_b_id, new Set());
      parentOf.get(r.person_b_id)!.add(r.person_a_id);
      if (!childOf.has(r.person_a_id)) childOf.set(r.person_a_id, new Set());
      childOf.get(r.person_a_id)!.add(r.person_b_id);
    } else if (r.relationship_type === "child") {
      // A is child of B (inverse of parent)
      if (!parentOf.has(r.person_a_id)) parentOf.set(r.person_a_id, new Set());
      parentOf.get(r.person_a_id)!.add(r.person_b_id);
      if (!childOf.has(r.person_b_id)) childOf.set(r.person_b_id, new Set());
      childOf.get(r.person_b_id)!.add(r.person_a_id);
    } else if (r.relationship_type === "spouse" || r.relationship_type === "partner") {
      if (!spouseOf.has(r.person_a_id)) spouseOf.set(r.person_a_id, new Set());
      spouseOf.get(r.person_a_id)!.add(r.person_b_id);
      if (!spouseOf.has(r.person_b_id)) spouseOf.set(r.person_b_id, new Set());
      spouseOf.get(r.person_b_id)!.add(r.person_a_id);
    }
  }

  return { parentOf, childOf, spouseOf };
}

function toFamilyChartData(persons: Person[], relationships: Relationship[]) {
  const { parentOf, childOf, spouseOf } = indexRelationships(relationships);
  const personIds = new Set(persons.map(p => p.id));

  return persons.map((p) => {
    const rawYear = p.birth_date?.slice(0, 4);
    const deathYear = p.death_date?.slice(0, 4);
    const yearLabel = rawYear
      ? deathYear ? `${rawYear}–${deathYear}` : `b. ${rawYear}`
      : deathYear ? `d. ${deathYear}` : "";

    return {
      id: p.id,
      data: {
        gender: (p.gender === "female" || p.gender === "f") ? "F" as const : "M" as const,
        "first name": p.given_name ?? "",
        "last name": p.family_name ?? "",
        nickname: p.nickname ?? "",
        birthday: yearLabel,
        _gender: p.gender ?? "unknown",
      },
      rels: {
        parents:  [...new Set(parentOf.get(p.id) ?? [])].filter(id => personIds.has(id)),
        children: [...new Set(childOf.get(p.id) ?? [])].filter(id => personIds.has(id)),
        spouses:  [...(spouseOf.get(p.id) ?? [])].filter(id => personIds.has(id)),
      },
    };
  });
}

function buildPedigreeData(
  persons: Person[],
  relationships: Relationship[],
  rootId: string,
  maxDepth?: number,
): { persons: Person[]; relationships: Relationship[] } {
  const { parentOf } = indexRelationships(relationships);

  const included = new Set<string>();
  const queue: { id: string; d: number }[] = [{ id: rootId, d: 0 }];
  while (queue.length > 0) {
    const { id, d } = queue.shift()!;
    if (included.has(id)) continue;
    included.add(id);
    if (maxDepth !== undefined && maxDepth > 0 && d >= maxDepth) continue;
    for (const pid of parentOf.get(id) ?? []) queue.push({ id: pid, d: d + 1 });
  }

  const personMap = new Map(persons.map(p => [p.id, p]));
  return {
    persons: [...included].map(id => personMap.get(id)).filter(Boolean) as Person[],
    relationships: relationships.filter(r =>
      included.has(r.person_a_id) && included.has(r.person_b_id)
    ),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type RelGroup = "parents" | "spouses" | "partners" | "children" | "other";

function groupSidebarRels(rels: Relationship[], personId: string): Record<RelGroup, Relationship[]> {
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

function findDefaultRoot(persons: Person[], relationships: Relationship[]): string {
  const hasParents = new Set(
    relationships.filter((r) => r.relationship_type === "parent").map((r) => r.person_b_id)
  );
  return (persons.find((p) => !hasParents.has(p.id)) ?? persons[0]).id;
}


// ─── Family chart wrapper ────────────────────────────────────────────────────

function FamilyChartView({
  data, mainId, onSelect, onRecenter, onAddRelative, chartRefOut,
  initialDepth, treeId, myPersonId, horizontal,
}: {
  data: ReturnType<typeof toFamilyChartData>;
  mainId: string;
  onSelect?: (personId: string) => void;
  onRecenter?: (personId: string) => void;
  onAddRelative?: (state: AddPersonRelationship) => void;
  chartRefOut?: React.MutableRefObject<f3.Chart | null>;
  initialDepth?: number;
  treeId: string;
  myPersonId?: string | null;
  horizontal?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const chartRef = useRef<f3.Chart | null>(null);

  const cbRef = useRef({ onSelect, onRecenter, onAddRelative });
  cbRef.current = { onSelect, onRecenter, onAddRelative };

  useEffect(() => {
    const cont = containerRef.current;
    if (!cont || !data.length) return;

    const timer = setTimeout(() => {
      cont.innerHTML = "";
      try {
        const settings = loadGraphSettings(treeId);
        const style = getResolvedStyle(settings);
        const layout = getResolvedLayout(settings);
        applyGraphStyle(cont, style);
        const chart = f3.createChart(cont, data as f3.Data);
        chart.setCardYSpacing(layout.cardYSpacing);
        chart.setCardXSpacing(layout.cardXSpacing);
        chart.setTransitionTime(layout.transitionTime);
        chart.setSingleParentEmptyCard(false);
        chart.setShowSiblingsOfMain(layout.showSiblings);
        chart.setSortChildrenFunction((a, b) => {
          const ya = (a.data.birthday || "").replace(/\D/g, "").slice(0, 4);
          const yb = (b.data.birthday || "").replace(/\D/g, "").slice(0, 4);
          return (ya || "9999").localeCompare(yb || "9999");
        });
        if (horizontal) chart.setOrientationHorizontal();
        if (initialDepth) { chart.setAncestryDepth(initialDepth); chart.setProgenyDepth(initialDepth); }

        chart.setAfterUpdate(() => {
          cont.querySelectorAll<SVGPathElement>(".link").forEach(link => {
            link.style.stroke = style.linkColor;
            link.style.strokeWidth = `${style.linkWidth}px`;
          });
          if (observerRef.current) observerRef.current.disconnect();
          const linksView = cont.querySelector(".links_view");
          if (linksView) {
            const observer = new MutationObserver(() => {
              const highlighted = linksView.querySelectorAll<SVGPathElement>(".f3-path-to-main");
              highlighted.forEach(el => linksView.appendChild(el));
            });
            observer.observe(linksView, { attributes: true, attributeFilter: ["class"], subtree: true });
            observerRef.current = observer;
          }
        });

        const card = chart.setCardHtml();
        card.setMiniTree(layout.showMiniTree);
        if (layout.showPathToMain) card.setOnHoverPathToMain();
        card.setCardDim({ w: 180, h: 90, img_w: 0, img_h: 0, img_x: 0, img_y: 0, text_x: 0, text_y: 0 });
        card.setStyle("rect");

        const myId = myPersonId;
        card.setCardInnerHtmlCreator((d: f3.TreeDatum) => {
          const dd = d.data.data as Record<string, string>;
          const isMain = !!(d.data as { main?: boolean }).main;
          return buildCardHtml(dd, style, { isMain, isMe: d.data.id === myId });
        });

        card.setOnCardClick((e: MouseEvent, d: f3.TreeDatum) => {
          if (e.ctrlKey || e.metaKey || e.detail === 2) {
            card.onCardClickDefault(e, d);
            cbRef.current.onRecenter?.(d.data.id);
            return;
          }
          cbRef.current.onSelect?.(d.data.id);
        });

        card.setOnCardUpdate(function(this: HTMLElement, d: f3.TreeDatum) {
          if (d.data.to_add || d.data.unknown) return;
          if (this.querySelector(".tt-add-btn")) return;

          const dd = d.data.data as Record<string, string>;
          const personName = `${dd["first name"] ?? ""} ${dd["last name"] ?? ""}`.trim() || "Unnamed";
          const id = d.data.id;
          const accent = accentForGender(dd._gender ?? "unknown", style);

          const cardEl = this.querySelector(".card") as HTMLElement;
          if (!cardEl) return;
          cardEl.style.position = "relative";
          cardEl.style.overflow = "visible";

          const buttons = [
            { rel: "parent",  title: "Add parent",  css: "top:-12px;left:50%;transform:translateX(-50%);" },
            { rel: "child",   title: "Add child",   css: "bottom:-12px;left:50%;transform:translateX(-50%);" },
            { rel: "sibling", title: "Add sibling",  css: "top:50%;left:-12px;transform:translateY(-50%);" },
            { rel: "spouse",  title: "Add partner",  css: "top:50%;right:-12px;transform:translateY(-50%);" },
          ];

          for (const { rel, title, css } of buttons) {
            const btn = document.createElement("button");
            btn.className = "tt-add-btn";
            btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10"><line x1="5" y1="1" x2="5" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
            btn.title = title;
            btn.style.cssText = `position:absolute;${css}width:20px;height:20px;border-radius:50%;border:1.5px solid #d1d5db;background:#fff;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:all 0.15s;pointer-events:auto;z-index:10;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:0;`;
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              cbRef.current.onAddRelative?.({ anchorId: id, anchorName: personName, relation: rel as RelativeKind });
            });
            btn.addEventListener("mouseenter", () => { btn.style.background = accent; btn.style.color = "#fff"; btn.style.borderColor = accent; btn.style.transform += " scale(1.15)"; });
            btn.addEventListener("mouseleave", () => { btn.style.background = "#fff"; btn.style.color = "#9ca3af"; btn.style.borderColor = "#d1d5db"; btn.style.transform = btn.style.transform.replace(/ scale\(1\.15\)/, ""); });
            cardEl.appendChild(btn);
          }

          cardEl.addEventListener("mouseenter", () => {
            cardEl.querySelectorAll<HTMLElement>(".tt-add-btn").forEach(b => { b.style.opacity = "1"; });
          });
          cardEl.addEventListener("mouseleave", () => {
            cardEl.querySelectorAll<HTMLElement>(".tt-add-btn").forEach(b => { b.style.opacity = "0"; });
          });
        });

        chart.updateMainId(mainId);
        chart.updateTree({ initial: true, tree_position: "fit" });
        chartRef.current = chart;
        if (chartRefOut) chartRefOut.current = chart;
      } catch (e) {
        console.error("[FamilyChart] init error:", e);
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; }
      if (cont) cont.innerHTML = "";
      chartRef.current = null;
    };
  }, [data, horizontal]); // eslint-disable-line

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mainId) return;
    chart.updateMainId(mainId);
    chart.updateTree({ tree_position: "main_to_middle" });
  }, [mainId]);

  return <div ref={containerRef} className="f3" style={{ width: "100%", height: "100%" }} />;
}


// ─── Side Panel ──────────────────────────────────────────────────────────────

function SidePanel({
  person, persons, relationships, placeById, treeId, treeSlug,
  onSelect, onRecenter, onAddRelative, onClose,
}: {
  person: Person;
  persons: Person[];
  relationships: Relationship[];
  placeById: Map<string, string>;
  treeId: string;
  treeSlug: string;
  onSelect: (id: string) => void;
  onRecenter: (id: string) => void;
  onAddRelative: (state: AddPersonRelationship) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [bioExpanded, setBioExpanded] = useState(false);

  const p = person;
  const name = getFullName(p);
  const initials = getInitials(p);
  const accent = genderColor(p.gender ?? "unknown");
  const birthFmt = formatFlexDate(p.birth_date, p.birth_date_qualifier, p.birth_date_2, p.birth_date_original);
  const deathFmt = formatFlexDate(p.death_date, p.death_date_qualifier, p.death_date_2, p.death_date_original);
  const birthLoc = (p.birth_place_id && placeById.get(p.birth_place_id)) || p.birth_location;
  const deathLoc = (p.death_place_id && placeById.get(p.death_place_id)) || p.death_location;

  const personIds = new Set(persons.map(pp => pp.id));
  const personRels = relationships.filter(r => {
    if (r.person_a_id !== p.id && r.person_b_id !== p.id) return false;
    const otherId = r.person_a_id === p.id ? r.person_b_id : r.person_a_id;
    return personIds.has(otherId);
  });
  const groups = groupSidebarRels(personRels, p.id);

  const { data: storiesData } = useQuery({
    queryKey: [...queryKeys.stories.all(treeId), "person", p.id],
    queryFn: () => listStories(treeId, { person_id: p.id, limit: 100 }),
  });

  const stories = storiesData?.items ?? [];

  const relSections = [
    { key: "parents" as const,  label: "Parents" },
    { key: "spouses" as const,  label: "Spouses" },
    { key: "partners" as const, label: "Partners" },
    { key: "children" as const, label: "Children" },
    { key: "other" as const,    label: "Other" },
  ];

  return (
    <div className="absolute top-0 right-0 z-20 h-full w-[380px] max-w-[90vw] bg-background border-l shadow-xl overflow-y-auto">
      {/* Close button */}
      <button onClick={onClose} className="absolute top-3 right-3 z-10 p-1 rounded-md hover:bg-muted transition-colors">
        <X className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          {p.profile_picture_id ? (
            <AuthImage treeId={treeId} mediaId={p.profile_picture_id} alt={name} className="w-12 h-12 rounded-full object-cover shrink-0" />
          ) : (
            <div className={`${accent} w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0`}>
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-tight truncate">{name}</h2>
            {p.maiden_name && <p className="text-sm text-muted-foreground">(née {p.maiden_name})</p>}
            {p.nickname && <p className="text-sm text-muted-foreground italic">"{p.nickname}"</p>}
          </div>
        </div>

        {/* Life Events */}
        {(birthFmt || birthLoc || deathFmt || deathLoc) && (
          <div className="space-y-2">
            {(birthFmt || birthLoc) && (
              <div className="flex items-start gap-2 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Born</span>
                  {birthFmt && <p>{birthFmt}</p>}
                  {birthLoc && <p className="text-muted-foreground text-xs">{birthLoc}</p>}
                </div>
              </div>
            )}
            {(deathFmt || deathLoc) && (
              <div className="flex items-start gap-2 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Died</span>
                  {deathFmt && <p>{deathFmt}</p>}
                  {deathLoc && <p className="text-muted-foreground text-xs">{deathLoc}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* About */}
        {(p.gender || p.occupation || p.nationalities?.length || p.education) && (
          <div className="space-y-1.5 text-sm">
            {p.occupation && (
              <div className="flex items-center gap-2">
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{p.occupation}</span>
              </div>
            )}
            {p.nationalities?.length ? (
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{p.nationalities.join(", ")}</span>
              </div>
            ) : null}
            {p.education && (
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs">{p.education}</span>
              </div>
            )}
          </div>
        )}

        {/* Bio */}
        {p.bio && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Bio</p>
            <p className={`text-sm whitespace-pre-wrap ${bioExpanded ? "" : "line-clamp-4"}`}>{p.bio}</p>
            {p.bio.length > 200 && (
              <button className="text-xs text-primary hover:underline mt-1" onClick={() => setBioExpanded(e => !e)}>
                {bioExpanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}

        {/* Relationships */}
        {personRels.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Relationships</p>
            {relSections.map(({ key, label }) => {
              const rels = groups[key];
              if (!rels.length) return null;
              return (
                <div key={key}>
                  <p className="text-[11px] font-medium text-muted-foreground mb-1">{label}</p>
                  <div className="space-y-0.5">
                    {rels.map(r => {
                      const otherId = r.person_a_id === p.id ? r.person_b_id : r.person_a_id;
                      const other = persons.find(pp => pp.id === otherId);
                      const otherName = other ? getFullName(other) : "Unknown";
                      return (
                        <button key={r.id} className="flex items-center gap-2 text-sm text-primary hover:underline truncate text-left w-full py-0.5" onClick={() => onSelect(otherId)}>
                          {otherName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stories */}
        {stories.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Stories</p>
            <div className="space-y-1">
              {stories.map(s => (
                <button
                  key={s.id}
                  className="flex items-center justify-between w-full text-left text-sm hover:bg-muted rounded-md px-2 py-1 transition-colors"
                  onClick={() => navigate(`/trees/${treeSlug}/stories/${s.id}`)}
                >
                  <span className="truncate font-medium">{s.title}</span>
                  {s.event_date && <span className="text-xs text-muted-foreground ml-2 shrink-0">{s.event_date.slice(0, 4)}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Add relative shortcuts */}
        <div className="border-t pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Add relative</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(["parent", "child", "sibling", "spouse"] as RelativeKind[]).map(rel => (
              <button
                key={rel}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border hover:bg-muted transition-colors"
                onClick={() => onAddRelative({ anchorId: p.id, anchorName: name, relation: rel })}
              >
                <UserPlus className="h-3 w-3 text-muted-foreground" />
                {rel.charAt(0).toUpperCase() + rel.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t pt-3">
          <Button size="sm" onClick={() => navigate(`/trees/${treeSlug}/people/${p.id}`)}>
            Open full profile
          </Button>
          <Button size="sm" variant="outline" onClick={() => onRecenter(p.id)}>
            Center tree on this person
          </Button>
        </div>
      </div>
    </div>
  );
}


// ─── Person Search ───────────────────────────────────────────────────────────

function PersonSearch({ persons, onSelect }: { persons: Person[]; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return persons
      .filter(p => [p.given_name, p.family_name].filter(Boolean).join(" ").toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, persons]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1 bg-background/80 rounded-md border px-2">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query.trim() && setOpen(true)}
          placeholder="Find person…"
          className="h-6 w-28 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute top-full mt-1 right-0 z-50 w-56 rounded-lg border bg-popover shadow-lg overflow-hidden">
          {filtered.map(p => {
            const name = getFullName(p);
            const year = p.birth_date?.slice(0, 4);
            return (
              <button
                key={p.id}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted transition-colors"
                onClick={() => { onSelect(p.id); setQuery(""); setOpen(false); }}
              >
                <span className="font-medium truncate">{name}</span>
                {year && <span className="text-xs text-muted-foreground ml-auto">b. {year}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── GraphTab ─────────────────────────────────────────────────────────────────

export function GraphTab({ treeId }: { treeId: string }) {
  const [searchParams] = useSearchParams();
  const { treeSlug } = useParams<{ treeSlug: string }>();
  const settings = useMemo(() => loadGraphSettings(treeId), [treeId]);

  const urlRoot = searchParams.get("root");
  const [addRelative,      setAddRelative]      = useState<AddPersonRelationship | null>(null);
  const [rootPersonId,     setRootPersonId]     = useState<string | null>(urlRoot ?? settings.defaultRootPersonId);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [depth, setDepth] = useState(settings.maxDepth || 3);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedPersonId(null);
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, []);
  const [viewMode, setViewMode] = useState<"tree" | "pedigree">("tree");
  const chartRef = useRef<f3.Chart | null>(null);

  useEffect(() => {
    if (urlRoot && urlRoot !== rootPersonId) setRootPersonId(urlRoot);
  }, [urlRoot]);

  const { data: personsData, isLoading: pLoad, isError: pErr } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn:  () => listPersons(treeId, 0, 50000),
  });
  const { data: relsData, isLoading: rLoad, isError: rErr } = useQuery({
    queryKey: queryKeys.relationships.full(treeId),
    queryFn:  () => listRelationships(treeId, 0, 50000),
  });
  const { data: placesData } = useQuery({
    queryKey: queryKeys.places.forTree(treeId),
    queryFn: () => listTreePlaces(treeId),
  });

  const persons = personsData?.items ?? [];
  const relationships = relsData?.items ?? [];
  const placeById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of placesData ?? []) map.set(p.id, p.display_name);
    return map;
  }, [placesData]);

  const rootId = useMemo(() => {
    if (!persons.length) return "";
    const wanted = rootPersonId ?? findDefaultRoot(persons, relationships);
    return persons.some((p) => p.id === wanted) ? wanted : persons[0].id;
  }, [persons, relationships, rootPersonId]);

  const chartData = useMemo(() => {
    if (!persons.length) return [];
    if (viewMode === "pedigree" && rootId) {
      const ped = buildPedigreeData(persons, relationships, rootId, depth > 0 ? depth : undefined);
      return toFamilyChartData(ped.persons, ped.relationships);
    }
    return toFamilyChartData(persons, relationships);
  }, [persons, relationships, viewMode, rootId, depth]);

  const handleSelect = useCallback((personId: string) => {
    setSelectedPersonId(personId);
  }, []);

  const handleRecenter = useCallback((personId: string) => {
    setRootPersonId(personId);
    saveGraphSettings(treeId, { ...loadGraphSettings(treeId), defaultRootPersonId: personId });
  }, [treeId]);

  const handleDepthChange = useCallback((d: number) => {
    setDepth(d);
    const chart = chartRef.current;
    if (chart) {
      chart.setAncestryDepth(d || 999);
      chart.setProgenyDepth(d || 999);
      try { chart.updateTree({ tree_position: "fit" }); } catch { /* */ }
    }
    saveGraphSettings(treeId, { ...loadGraphSettings(treeId), maxDepth: d });
  }, [treeId]);

  if (pLoad || rLoad) return <LoadingSpinner />;
  if (pErr  || rErr)  return (
    <div className="flex flex-col items-center gap-2 py-16 text-destructive">
      <p className="font-medium">Failed to load graph data.</p>
      <p className="text-sm text-muted-foreground">Check your connection and try refreshing.</p>
    </div>
  );

  // Empty tree state
  if (!persons.length) return (
    <div className="flex flex-col items-center gap-6 py-20">
      <div className="rounded-2xl border-2 border-dashed border-muted-foreground/20 p-8 text-center max-w-sm">
        <TreePine className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-1">Start your family tree</h3>
        <p className="text-sm text-muted-foreground mb-4">Add the first person to begin building your family tree.</p>
        <Button onClick={() => setAddRelative({ anchorId: "", anchorName: "", relation: "child" })}>
          <UserPlus className="h-4 w-4 mr-2" />
          Add First Person
        </Button>
      </div>
      <AddPersonDialog open={!!addRelative} treeId={treeId} relationship={addRelative} onClose={() => setAddRelative(null)} />
    </div>
  );

  const selectedPerson = selectedPersonId ? persons.find(p => p.id === selectedPersonId) : null;

  return (
    <>
      <div style={{ height: "calc(100vh - 220px)", minHeight: 400 }}
        className="relative border rounded-xl overflow-hidden family-chart-light">
        <FamilyChartView
          data={chartData}
          mainId={rootId}
          treeId={treeId}
          myPersonId={settings.myPersonId}
          onSelect={handleSelect}
          onRecenter={handleRecenter}
          onAddRelative={setAddRelative}
          chartRefOut={chartRef}
          initialDepth={viewMode === "pedigree" ? undefined : (depth || undefined)}
          horizontal={viewMode === "pedigree"}
        />

        {/* Controls */}
        <div className="absolute top-2 right-2 z-10 bg-background/90 backdrop-blur-sm border border-border rounded-lg px-2.5 py-1.5 shadow-sm flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground font-medium">Depth</span>
            {[1, 2, 3, 4, 5, 0].map(d => (
              <button key={d} onClick={() => handleDepthChange(d)}
                className={`w-5 h-5 rounded text-[10px] font-semibold transition-colors ${
                  depth === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}>
                {d === 0 ? "∞" : d}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-border" />
          <button
            onClick={() => { const c = chartRef.current; if (c) c.updateTree({ tree_position: "fit" }); }}
            title="Fit tree to view"
            className="w-5 h-5 rounded text-[10px] font-semibold bg-muted text-muted-foreground hover:bg-muted/80 transition-colors flex items-center justify-center"
          >
            ⊞
          </button>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1">
            {(["tree", "pedigree"] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-1.5 h-5 rounded text-[10px] font-medium transition-colors ${
                  viewMode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}>
                {m === "tree" ? "Full" : "Pedigree"}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-border" />
          <PersonSearch persons={persons} onSelect={handleRecenter} />
        </div>

        <p className="absolute bottom-2 right-2 text-xs text-muted-foreground/50 pointer-events-none select-none z-10">
          Click to inspect · Dbl-click or Ctrl+click to re-center · Scroll to zoom · Drag to pan
        </p>

        {/* Side panel (non-modal, graph stays interactive) */}
        {selectedPerson && (
          <SidePanel
            person={selectedPerson}
            persons={persons}
            relationships={relationships}
            placeById={placeById}
            treeId={treeId}
            treeSlug={treeSlug!}
            onSelect={handleSelect}
            onRecenter={handleRecenter}
            onAddRelative={setAddRelative}
            onClose={() => setSelectedPersonId(null)}
          />
        )}
      </div>

      <AddPersonDialog open={!!addRelative} treeId={treeId} relationship={addRelative} onClose={() => setAddRelative(null)} />
    </>
  );
}
