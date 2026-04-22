import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as f3 from "family-chart";
import "family-chart/styles/family-chart.css";
import { listPersons } from "@/api/persons";
import { listRelationships } from "@/api/relationships";
import { listTreePlaces } from "@/api/places";
import { queryKeys } from "@/lib/queryKeys";
import type { Person } from "@/types/person";
import type { Relationship } from "@/types/relationship";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { AddPersonDialog, type AddPersonRelationship, type RelativeKind } from "@/components/common/AddPersonDialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatFlexDate } from "@/lib/dates";
import { loadGraphSettings, saveGraphSettings, getResolvedStyle, getResolvedLayout, applyGraphStyle, accentForGender } from "@/lib/graphSettings";

// ─── Data transformer ────────────────────────────────────────────────────────

function toFamilyChartData(persons: Person[], relationships: Relationship[]) {
  // Pre-index relationships for O(1) lookup per person instead of O(n) scan
  const parentOf = new Map<string, string[]>();   // child_id → parent_ids
  const childOf = new Map<string, string[]>();    // parent_id → child_ids
  const spouseOf = new Map<string, Set<string>>(); // person_id → spouse_ids

  for (const r of relationships) {
    if (r.relationship_type === "parent") {
      const parents = parentOf.get(r.person_b_id) ?? [];
      parents.push(r.person_a_id);
      parentOf.set(r.person_b_id, parents);
      const children = childOf.get(r.person_a_id) ?? [];
      children.push(r.person_b_id);
      childOf.set(r.person_a_id, children);
    } else if (r.relationship_type === "spouse" || r.relationship_type === "partner") {
      const sa = spouseOf.get(r.person_a_id) ?? new Set();
      sa.add(r.person_b_id);
      spouseOf.set(r.person_a_id, sa);
      const sb = spouseOf.get(r.person_b_id) ?? new Set();
      sb.add(r.person_a_id);
      spouseOf.set(r.person_b_id, sb);
    }
  }

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

function genderIcon(g: string): string {
  if (g === "female" || g === "f") return "/female_icon.svg";
  if (g === "male"   || g === "m") return "/male_icon.svg";
  if (g === "other"  || g === "o") return "/other_icon.svg";
  return "/unknown_icon.svg";
}


// ─── Family chart wrapper ────────────────────────────────────────────────────

function FamilyChartView({
  data, mainId, onSelect, onRecenter, onAddRelative, chartRefOut,
  initialDepth, treeId,
}: {
  data: ReturnType<typeof toFamilyChartData>;
  mainId: string;
  onSelect?: (personId: string) => void;
  onRecenter?: (personId: string) => void;
  onAddRelative?: (state: AddPersonRelationship) => void;
  chartRefOut?: React.MutableRefObject<f3.Chart | null>;
  initialDepth?: number;
  treeId: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const chartRef = useRef<f3.Chart | null>(null);

  const cbRef = useRef({ onSelect, onRecenter, onAddRelative });
  cbRef.current = { onSelect, onRecenter, onAddRelative };

  // Create chart once when data changes
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

        card.setCardInnerHtmlCreator((d: f3.TreeDatum) => {
          const dd = d.data.data as Record<string, string>;
          const firstName = dd["first name"] || "";
          const lastName = dd["last name"] || "";
          const nickname = dd.nickname || "";
          const birthday = dd.birthday || "";
          const g = dd._gender ?? "unknown";
          const accent = accentForGender(g, style);
          const icon = genderIcon(g);
          const isMain = !!(d.data as { main?: boolean }).main;

          if (!firstName && !lastName) {
            return `<div class="tt-card" style="background:${style.cardBg};border-left:4px solid ${accent};${isMain ? `box-shadow:0 0 0 2px ${accent}40;` : ""}">
              <div style="display:flex;align-items:center;gap:6px;padding:8px 10px;">
                <img src="${icon}" style="width:16px;height:16px;opacity:0.5;object-fit:contain;" />
                <span style="font-size:12px;color:${style.mutedColor};font-style:italic;">Unnamed</span>
              </div>
            </div>`;
          }

          return `<div class="tt-card" style="background:${style.cardBg};border-left:4px solid ${accent};${isMain ? `box-shadow:0 0 0 2px ${accent}40;` : ""}">
            <div style="padding:7px 10px 6px 10px;display:flex;gap:7px;min-width:0;">
              <img src="${icon}" style="width:18px;height:18px;opacity:0.45;object-fit:contain;flex-shrink:0;margin-top:1px;" />
              <div style="min-width:0;overflow:hidden;max-width:130px;">
                ${firstName ? `<div style="font-size:12px;font-weight:500;color:${style.textColor};line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${firstName}</div>` : ""}
                ${lastName ? `<div style="font-size:10.5px;font-weight:800;color:${accent};letter-spacing:0.06em;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${lastName.toUpperCase()}</div>` : ""}
                ${nickname ? `<div style="font-size:9.5px;font-style:italic;color:${style.mutedColor};line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">"${nickname}"</div>` : ""}
                ${birthday ? `<div style="font-size:9px;color:${style.mutedColor};font-variant-numeric:tabular-nums;letter-spacing:0.02em;line-height:1.4;margin-top:1px;">${birthday}</div>` : ""}
              </div>
            </div>
          </div>`;
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
            { rel: "parent", title: "Add parent",  css: "top:-12px;left:50%;transform:translateX(-50%);" },
            { rel: "child",  title: "Add child",   css: "bottom:-12px;left:50%;transform:translateX(-50%);" },
            { rel: "spouse", title: "Add partner",  css: "top:50%;right:-12px;transform:translateY(-50%);" },
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
  }, [data]); // eslint-disable-line -- only rebuild when data changes

  // Re-center without rebuilding when mainId changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mainId) return;
    chart.updateMainId(mainId);
    chart.updateTree({ tree_position: "main_to_middle" });
  }, [mainId]);

  return <div ref={containerRef} className="f3" style={{ width: "100%", height: "100%" }} />;
}


// ─── GraphTab ─────────────────────────────────────────────────────────────────

export function GraphTab({ treeId }: { treeId: string }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { treeSlug } = useParams<{ treeSlug: string }>();
  const settings = useMemo(() => loadGraphSettings(treeId), [treeId]);

  const urlRoot = searchParams.get("root");
  const [addRelative,      setAddRelative]      = useState<AddPersonRelationship | null>(null);
  const [rootPersonId,     setRootPersonId]     = useState<string | null>(urlRoot ?? settings.defaultRootPersonId);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [depth, setDepth] = useState(settings.maxDepth || 3);
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
    return toFamilyChartData(persons, relationships);
  }, [persons, relationships]);

  const handleSelect = useCallback((personId: string) => {
    setSelectedPersonId(personId);
  }, []);

  const handleRecenter = useCallback((personId: string) => {
    setRootPersonId(personId);
    saveGraphSettings(treeId, { ...loadGraphSettings(treeId), defaultRootPersonId: personId });
  }, [treeId]);

  const handleDepthChange = useCallback((d: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    setDepth(d);
    chart.setAncestryDepth(d);
    chart.setProgenyDepth(d);
    try {
      chart.updateTree({ tree_position: "fit" });
    } catch {
      // family-chart can throw on certain data shapes (e.g. orphan references)
    }
    saveGraphSettings(treeId, { ...loadGraphSettings(treeId), maxDepth: d });
  }, []);

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
      <Button onClick={() => setAddRelative({ anchorId: "", anchorName: "", relation: "child" })}>
        Add First Person
      </Button>
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
          onSelect={handleSelect}
          onRecenter={handleRecenter}
          onAddRelative={setAddRelative}
          chartRefOut={chartRef}
          initialDepth={depth}
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
        </div>

        <p className="absolute bottom-2 right-2 text-xs text-muted-foreground/50 pointer-events-none select-none z-10">
          Click to inspect · Dbl-click or Ctrl+click to re-center · Scroll to zoom · Drag to pan
        </p>
      </div>

      <Sheet open={!!selectedPerson} onOpenChange={(o) => { if (!o) setSelectedPersonId(null); }}>
        <SheetContent side="right" className="w-[85vw] sm:w-[420px] overflow-y-auto px-5 py-6">
          {selectedPerson && (() => {
            const p = selectedPerson;
            const name = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
            const birthFmt = formatFlexDate(p.birth_date, p.birth_date_qualifier, p.birth_date_2, p.birth_date_original);
            const deathFmt = formatFlexDate(p.death_date, p.death_date_qualifier, p.death_date_2, p.death_date_original);

            const personRels = relationships.filter(r =>
              r.person_a_id === p.id || r.person_b_id === p.id
            );

            return (
              <div className="space-y-6 pt-1">
                {/* Header */}
                <div>
                  <h2 className="text-lg font-bold leading-tight">{name}</h2>
                  {p.maiden_name && <p className="text-sm text-muted-foreground">(née {p.maiden_name})</p>}
                  {p.nickname && <p className="text-sm text-muted-foreground italic">"{p.nickname}"</p>}
                </div>

                {/* Dates */}
                {(birthFmt || deathFmt) && (() => {
                  const birthLoc = (p.birth_place_id && placeById.get(p.birth_place_id)) || p.birth_location;
                  const deathLoc = (p.death_place_id && placeById.get(p.death_place_id)) || p.death_location;
                  return (
                    <div className="space-y-2">
                      {(birthFmt || birthLoc) && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Born</p>
                          {birthFmt && <p className="text-sm">{birthFmt}</p>}
                          {birthLoc && <p className="text-sm text-muted-foreground">{birthLoc}</p>}
                        </div>
                      )}
                      {(deathFmt || deathLoc) && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Died</p>
                          {deathFmt && <p className="text-sm">{deathFmt}</p>}
                          {deathLoc && <p className="text-sm text-muted-foreground">{deathLoc}</p>}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Details */}
                <div className="space-y-1 text-sm">
                  {p.gender && <p><span className="text-muted-foreground">Sex:</span> {p.gender.charAt(0).toUpperCase() + p.gender.slice(1)}</p>}
                  {p.occupation && <p><span className="text-muted-foreground">Occupation:</span> {p.occupation}</p>}
                  {p.education && <p><span className="text-muted-foreground">Education:</span> {p.education}</p>}
                  {p.nationalities?.length ? <p><span className="text-muted-foreground">Nationalities:</span> {p.nationalities.join(", ")}</p> : null}
                </div>

                {/* Bio */}
                {p.bio && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Bio</p>
                    <p className="text-sm whitespace-pre-wrap line-clamp-6">{p.bio}</p>
                  </div>
                )}

                {/* Relationships */}
                {personRels.length > 0 && (() => {
                  const groups = groupSidebarRels(personRels, p.id);
                  const sections: { key: string; label: string }[] = [
                    { key: "parents",  label: "Parents"  },
                    { key: "spouses",  label: "Spouses"  },
                    { key: "partners", label: "Partners" },
                    { key: "children", label: "Children" },
                    { key: "other",    label: "Other"    },
                  ];
                  return (
                    <div className="space-y-3">
                      {sections.map(({ key, label }) => {
                        const rels = groups[key as keyof typeof groups];
                        if (!rels.length) return null;
                        return (
                          <div key={key}>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
                            <div className="space-y-1">
                              {rels.map(r => {
                                const otherId = r.person_a_id === p.id ? r.person_b_id : r.person_a_id;
                                const other = persons.find(pp => pp.id === otherId);
                                const otherName = other ? [other.given_name, other.family_name].filter(Boolean).join(" ") || "Unnamed" : "Unknown";
                                return (
                                  <button key={r.id} className="flex items-center gap-2 text-sm text-primary hover:underline truncate text-left w-full" onClick={() => setSelectedPersonId(otherId)}>
                                    {otherName}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-2 border-t">
                  <Button size="sm" onClick={() => navigate(`/trees/${treeSlug}/people/${p.id}?from=graph`)}>
                    Open full profile
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleRecenter(p.id)}>
                    Center tree on this person
                  </Button>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      <AddPersonDialog open={!!addRelative} treeId={treeId} relationship={addRelative} onClose={() => setAddRelative(null)} />
    </>
  );
}
