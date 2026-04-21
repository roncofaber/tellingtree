import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as f3 from "family-chart";
import "family-chart/styles/family-chart.css";
import { listPersons } from "@/api/persons";
import { listRelationships } from "@/api/relationships";
import { queryKeys } from "@/lib/queryKeys";
import type { Person } from "@/types/person";
import type { Relationship } from "@/types/relationship";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { AddPersonDialog, type AddPersonRelationship, type RelativeKind } from "@/components/common/AddPersonDialog";
import { Button } from "@/components/ui/button";
import { loadGraphSettings, saveGraphSettings, getResolvedStyle, getResolvedLayout, applyGraphStyle, accentForGender, type GraphStyle } from "@/lib/graphSettings";

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

function genderIcon(g: string): string {
  if (g === "female" || g === "f") return "/female_icon.svg";
  if (g === "male"   || g === "m") return "/male_icon.svg";
  if (g === "other"  || g === "o") return "/other_icon.svg";
  return "/unknown_icon.svg";
}


// ─── Family chart wrapper ────────────────────────────────────────────────────

function FamilyChartView({
  data, mainId, onSelect, onAddRelative, chartRefOut,
  initialAncestryDepth, initialProgenyDepth, treeId,
}: {
  data: ReturnType<typeof toFamilyChartData>;
  mainId: string;
  onSelect?: (personId: string) => void;
  onAddRelative?: (state: AddPersonRelationship) => void;
  chartRefOut?: React.MutableRefObject<f3.Chart | null>;
  initialAncestryDepth?: number;
  initialProgenyDepth?: number;
  treeId: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const chartRef = useRef<f3.Chart | null>(null);

  const cbRef = useRef({ onSelect, onAddRelative });
  cbRef.current = { onSelect, onAddRelative };

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
        if (initialAncestryDepth) chart.setAncestryDepth(initialAncestryDepth);
        if (initialProgenyDepth) chart.setProgenyDepth(initialProgenyDepth);

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

        card.setOnCardClick((e, d) => {
          card.onCardClickDefault(e, d);
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
  const settings = useMemo(() => loadGraphSettings(treeId), [treeId]);

  const [addRelative,      setAddRelative]      = useState<AddPersonRelationship | null>(null);
  const [rootPersonId,     setRootPersonId]     = useState<string | null>(settings.defaultRootPersonId);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [ancestryDepth,    setAncestryDepth]    = useState(settings.maxDepth || 3);
  const [progenyDepth,     setProgenyDepth]     = useState(settings.maxDepth || 3);
  const chartRef = useRef<f3.Chart | null>(null);

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

  const handleSelect = useCallback((personId: string) => {
    setSelectedPersonId(personId);
  }, []);

  const handleRecenter = useCallback((personId: string) => {
    setRootPersonId(personId);
    setSelectedPersonId(personId);
    saveGraphSettings(treeId, { ...loadGraphSettings(treeId), defaultRootPersonId: personId });
  }, [treeId]);

  const handleDepthChange = useCallback((type: "ancestry" | "progeny", depth: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    if (type === "ancestry") {
      setAncestryDepth(depth);
      chart.setAncestryDepth(depth);
    } else {
      setProgenyDepth(depth);
      chart.setProgenyDepth(depth);
    }
    chart.updateTree({ tree_position: "fit" });
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
          onAddRelative={setAddRelative}
          chartRefOut={chartRef}
          initialAncestryDepth={ancestryDepth}
          initialProgenyDepth={progenyDepth}
        />

        {/* Depth controls */}
        <div className="absolute top-2 right-2 z-10 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-2 shadow-sm space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 font-medium w-14">Ancestors</span>
            {[1, 2, 3, 4, 5, 0].map(d => (
              <button key={`a${d}`} onClick={() => handleDepthChange("ancestry", d)}
                className={`w-5 h-5 rounded text-[10px] font-semibold transition-colors ${
                  ancestryDepth === d ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}>
                {d === 0 ? "∞" : d}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 font-medium w-14">Children</span>
            {[1, 2, 3, 4, 5, 0].map(d => (
              <button key={`p${d}`} onClick={() => handleDepthChange("progeny", d)}
                className={`w-5 h-5 rounded text-[10px] font-semibold transition-colors ${
                  progenyDepth === d ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}>
                {d === 0 ? "∞" : d}
              </button>
            ))}
          </div>
        </div>

        <p className="absolute bottom-2 right-2 text-xs text-muted-foreground/50 pointer-events-none select-none z-10">
          Click to re-center · Scroll to zoom · Drag to pan
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
              Set as default
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => navigate(`/trees/${treeId}/persons/${selectedPerson.id}?from=graph`)}>
              View profile →
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground"
              onClick={() => setSelectedPersonId(null)}>&times;</Button>
          </div>
        </div>
      )}

      <AddPersonDialog open={!!addRelative} treeId={treeId} relationship={addRelative} onClose={() => setAddRelative(null)} />
    </>
  );
}
