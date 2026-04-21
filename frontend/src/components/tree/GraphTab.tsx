import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useReactFlow, Handle, Position, MarkerType, BaseEdge,
  type Node, type Edge, type NodeProps, type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutFromMap } from "entitree-flex";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_W = 180;
const NODE_H = 90; // card body height (handles sit at top/bottom of this)

// ─── Types ───────────────────────────────────────────────────────────────────

type RelativeKind = "child" | "spouse" | "parent";
type AddRelativeState = { anchorId: string; anchorName: string; relation: RelativeKind };

interface BoundaryFlags { hasParents: boolean; hasChildren: boolean; hasPartners: boolean }

interface PersonNodeData extends Record<string, unknown> {
  person: Person;
  treeId: string;
  isSelected: boolean;
  isSecondary: boolean;
  boundary: BoundaryFlags | undefined;
  onSelect: (id: string) => void;
  onRecenter: (id: string) => void;
  onAddRelative: (state: AddRelativeState) => void;
  onExpand: (id: string) => void;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function findDefaultRoot(persons: Person[], relationships: Relationship[]): string {
  const hasParents = new Set(
    relationships.filter((r) => r.relationship_type === "parent").map((r) => r.person_b_id)
  );
  return (persons.find((p) => !hasParents.has(p.id)) ?? persons[0]).id;
}

function bfsVisible(
  allPersons: Person[], allRelationships: Relationship[],
  rootId: string, maxDepth: number, expandedIds: Set<string>,
): Set<string> {
  if (maxDepth === 0) return new Set(allPersons.map((p) => p.id));
  const visited = new Map<string, number>();
  visited.set(rootId, 0);
  let frontier = [rootId];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const r of allRelationships) {
        const other = r.person_a_id === id ? r.person_b_id : r.person_b_id === id ? r.person_a_id : null;
        if (other && !visited.has(other)) { visited.set(other, d + 1); next.push(other); }
      }
    }
    frontier = next;
  }
  for (const eid of expandedIds) {
    if (!visited.has(eid)) continue;
    for (const r of allRelationships) {
      const other = r.person_a_id === eid ? r.person_b_id : r.person_b_id === eid ? r.person_a_id : null;
      if (other && !visited.has(other)) visited.set(other, maxDepth + 1);
    }
  }
  return new Set(visited.keys());
}

function computeBoundary(
  visibleIds: Set<string>,
  allRelationships: Relationship[],
  rootId: string,
): Map<string, BoundaryFlags> {
  // BFS upward from root to identify all ancestors.
  // Ancestors should only expand upward — their visible children are the path
  // back to root (already shown), so the expand-children button is misleading.
  const ancestorIds = new Set<string>();
  {
    const queue = [rootId];
    while (queue.length) {
      const id = queue.shift()!;
      for (const r of allRelationships) {
        if (r.relationship_type !== "parent" || r.person_b_id !== id) continue;
        if (!ancestorIds.has(r.person_a_id)) {
          ancestorIds.add(r.person_a_id);
          queue.push(r.person_a_id);
        }
      }
    }
  }

  const result = new Map<string, BoundaryFlags>();
  for (const id of visibleIds) {
    let hasParents = false, hasChildren = false, hasPartners = false;
    for (const r of allRelationships) {
      const other = r.person_a_id === id ? r.person_b_id : r.person_b_id === id ? r.person_a_id : null;
      if (!other || visibleIds.has(other)) continue;
      if (r.relationship_type === "parent" && r.person_b_id === id) hasParents = true;
      if (r.relationship_type === "parent" && r.person_a_id === id) hasChildren = true;
      if (r.relationship_type === "spouse" || r.relationship_type === "partner") hasPartners = true;
    }
    if (ancestorIds.has(id)) hasChildren = false;
    if (hasParents || hasChildren || hasPartners) result.set(id, { hasParents, hasChildren, hasPartners });
  }
  return result;
}

// ─── entitree-flex data builder ───────────────────────────────────────────────
//
// Layout rules:
//   • spouses: ONE-DIRECTIONAL — only person_a lists person_b in their spouses[].
//     entitree-flex places spouses to the right at the same Y level.
//   • children: when a child has two co-parents who are a couple, list the child
//     ONLY under the primary parent (person_a of the couple relationship), so the
//     child appears once in the layout instead of twice.

interface EntitreeNode {
  id: string; width: number; height: number;
  parents: string[]; children: string[]; spouses: string[];
}

// BFS distance from rootId using only parent-child edges.
// Used to decide which partner is "primary" (closer to root lists the other as spouse).
// Persons reachable only via spouse edges get Infinity — rootId itself gets 0.
function parentChildDistances(
  rootId: string,
  relationships: Relationship[],
  visibleIds: Set<string>,
): Map<string, number> {
  const dist = new Map<string, number>();
  dist.set(rootId, 0);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    const d = dist.get(id)!;
    for (const r of relationships) {
      if (r.relationship_type !== "parent") continue;
      const neighbor = r.person_a_id === id ? r.person_b_id
                     : r.person_b_id === id ? r.person_a_id : null;
      if (neighbor && visibleIds.has(neighbor) && !dist.has(neighbor)) {
        dist.set(neighbor, d + 1);
        queue.push(neighbor);
      }
    }
  }
  return dist;
}

function toEntitreeData(
  persons: Person[],
  relationships: Relationship[],
  rootId: string,
): { map: Record<string, EntitreeNode>; secondarySet: Set<string> } {
  const visibleIds = new Set(persons.map((p) => p.id));
  const dist = parentChildDistances(rootId, relationships, visibleIds);

  // For each couple (A, B): the person closer to root is "primary".
  // Primary lists secondary as spouse (nextAfter). Children go under primary.
  // If tied, person_a wins (consistent with DB convention).
  const secondarySet = new Set<string>();       // secondaryId
  const secondaryToPrimary = new Map<string, string>(); // secondary → primary

  for (const r of relationships) {
    if (r.relationship_type !== "spouse" && r.relationship_type !== "partner") continue;
    if (!visibleIds.has(r.person_a_id) || !visibleIds.has(r.person_b_id)) continue;
    const distA = dist.get(r.person_a_id) ?? Infinity;
    const distB = dist.get(r.person_b_id) ?? Infinity;
    const [primary, secondary] = distA <= distB
      ? [r.person_a_id, r.person_b_id]
      : [r.person_b_id, r.person_a_id];
    secondarySet.add(secondary);
    secondaryToPrimary.set(secondary, primary);
  }

  // For each child: which parents are visible
  const childParentIds = new Map<string, string[]>();
  for (const r of relationships) {
    if (r.relationship_type !== "parent") continue;
    if (!visibleIds.has(r.person_a_id) || !visibleIds.has(r.person_b_id)) continue;
    const list = childParentIds.get(r.person_b_id) ?? [];
    list.push(r.person_a_id);
    childParentIds.set(r.person_b_id, list);
  }

  // Ensure at most one non-secondary parent per child.
  // entitree-flex's drillParents only handles one entry in parents[] reliably;
  // extra parents must be placed via the nextAfter (spouses) mechanism instead.
  for (const [, parents] of childParentIds) {
    const nonSecondary = parents.filter(p => !secondarySet.has(p));
    if (nonSecondary.length < 2) continue;
    nonSecondary.sort((a, b) => {
      const da = dist.get(a) ?? Infinity, db = dist.get(b) ?? Infinity;
      return da !== db ? da - db : (a < b ? -1 : 1);
    });
    const primary = nonSecondary[0];
    for (let i = 1; i < nonSecondary.length; i++) {
      secondarySet.add(nonSecondary[i]);
      secondaryToPrimary.set(nonSecondary[i], primary);
    }
  }

  // Primary parent of each child with two parents who are a couple.
  const childPrimaryParent = new Map<string, string>();
  for (const [childId, parents] of childParentIds) {
    if (parents.length < 2) continue;
    const primary = parents.find((p) => !secondarySet.has(p)) ?? parents[0];
    childPrimaryParent.set(childId, primary);
  }

  const map: Record<string, EntitreeNode> = {};
  for (const p of persons) {
    const rawParents = childParentIds.get(p.id) ?? [];

    // Exclude secondary spouses from parents[] — they will appear via their primary's spouses[].
    // Without this, drillParents places them both as independent parents AND as nextAfter,
    // resulting in two conflicting position assignments and overlapping cards.
    const parents = rawParents.filter((parentId) => {
      if (!secondarySet.has(parentId)) return true;
      const primary = secondaryToPrimary.get(parentId);
      return !primary || !rawParents.includes(primary);
    });

    // Children: only under primary parent
    const children: string[] = [];
    for (const r of relationships) {
      if (r.relationship_type !== "parent" || r.person_a_id !== p.id) continue;
      if (!visibleIds.has(r.person_b_id)) continue;
      const primary = childPrimaryParent.get(r.person_b_id);
      if (primary !== undefined && primary !== p.id) continue;
      children.push(r.person_b_id);
    }

    // Spouses: persons for whom this person is the primary (root-relative direction)
    const spouses = [...secondaryToPrimary.entries()]
      .filter(([, primary]) => primary === p.id)
      .map(([secondary]) => secondary);

    map[p.id] = {
      id: p.id,
      width: NODE_W,
      height: NODE_H,
      parents: [...new Set(parents)],
      children: [...new Set(children)],
      spouses: [...new Set(spouses)],
    };
  }
  return { map, secondarySet };
}

// ─── Layout builder ───────────────────────────────────────────────────────────

function buildLayout(
  visiblePersons: Person[],
  visibleRelationships: Relationship[],
  rootId: string,
  callbacks: {
    selectedPersonId: string | null;
    boundaryInfo: Map<string, BoundaryFlags>;
    treeId: string;
    onSelect: (id: string) => void;
    onRecenter: (id: string) => void;
    onAddRelative: (state: AddRelativeState) => void;
    onExpand: (id: string) => void;
  },
): { nodes: Node[]; edges: Edge[] } {
  const { map: entitreeMap, secondarySet } = toEntitreeData(visiblePersons, visibleRelationships, rootId);

  let layoutResult: ReturnType<typeof layoutFromMap<EntitreeNode>>;
  try {
    layoutResult = layoutFromMap(rootId, entitreeMap, {
      orientation: "vertical",
      nodeWidth: NODE_W,
      nodeHeight: NODE_H,
      sourceTargetSpacing: 80,
      firstDegreeSpacing: 40,
      nextAfterSpacing: 20,
      nextBeforeSpacing: 20,
      clone: true,
    });
  } catch {
    return { nodes: [], edges: [] };
  }

  const visibleIds = new Set(visiblePersons.map((p) => p.id));

  // Position map seeded from the main entitree-flex output
  const posMap = new Map<string, { x: number; y: number }>();
  for (const n of layoutResult.nodes) {
    posMap.set(n.id as string, { x: n.x, y: n.y });
  }

  // ── Sub-layouts for secondary spouses with unpositioned relatives ─────────────
  // entitree-flex's drillParents/drillChildren only traverse the root's own chain;
  // secondary spouses placed as nextAfter nodes have their own relatives skipped.
  // We re-run entitree-flex from each such secondary spouse as a new root, then
  // translate the result so their position matches where they already sit in the
  // main layout. Only nodes not yet in posMap are added.
  {
    const placedIds = new Set(posMap.keys());
    const layoutOpts = {
      orientation: "vertical" as const,
      nodeWidth: NODE_W, nodeHeight: NODE_H,
      sourceTargetSpacing: 80, firstDegreeSpacing: 40,
      nextAfterSpacing: 20, nextBeforeSpacing: 20,
      clone: true,
    };

    for (const secId of secondarySet) {
      if (!placedIds.has(secId)) continue; // not in main layout at all

      const hasUnplaced = visiblePersons.some(p =>
        !placedIds.has(p.id) &&
        visibleRelationships.some(r =>
          (r.person_a_id === secId && r.person_b_id === p.id) ||
          (r.person_b_id === secId && r.person_a_id === p.id)
        )
      );
      if (!hasUnplaced) continue;

      let sub: ReturnType<typeof layoutFromMap<EntitreeNode>>;
      try { sub = layoutFromMap(secId, entitreeMap, layoutOpts); }
      catch { continue; }

      // Translate: sub-layout root sits at (0,0); anchor it to the main position
      const subRoot = sub.nodes.find(n => n.id === secId);
      if (!subRoot) continue;
      const main = posMap.get(secId)!;
      const dx = main.x - subRoot.x;
      const dy = main.y - subRoot.y;

      for (const n of sub.nodes) {
        const nid = n.id as string;
        if (!visibleIds.has(nid) || placedIds.has(nid)) continue;
        posMap.set(nid, { x: n.x + dx, y: n.y + dy });
        placedIds.add(nid);
      }
    }
  }

  // ── Collision sweep ────────────────────────────────────────────────────────────
  // entitree-flex's drillParents places ancestor nodes independently per branch,
  // so secondary-branch ancestors often land at the same X as primary-branch
  // secondary nodes (e.g. E=nextAfter(D) and F=parent-of-C both land at X_C).
  // Sweep each Y level left-to-right and push any overlapping node rightward.
  {
    const byY = new Map<number, string[]>();
    for (const id of posMap.keys()) {
      const y = Math.round(posMap.get(id)!.y);
      const arr = byY.get(y) ?? [];
      arr.push(id);
      byY.set(y, arr);
    }
    for (const ids of byY.values()) {
      if (ids.length < 2) continue;
      ids.sort((a, b) => posMap.get(a)!.x - posMap.get(b)!.x);
      for (let i = 1; i < ids.length; i++) {
        const prevX = posMap.get(ids[i - 1])!.x;
        const curr  = posMap.get(ids[i])!;
        const minX  = prevX + NODE_W + 20;
        if (curr.x < minX) posMap.set(ids[i], { x: minX, y: curr.y });
      }
    }
  }

  // React Flow nodes — all visible persons that ended up with a position
  const rfNodes: Node[] = visiblePersons
    .filter(p => posMap.has(p.id))
    .map(p => {
      const pos = posMap.get(p.id)!;
      return {
        id: p.id,
        type: "personNode",
        position: pos,
        data: {
          person: p,
          treeId: callbacks.treeId,
          isSelected: callbacks.selectedPersonId === p.id,
          isSecondary: secondarySet.has(p.id),
          boundary: callbacks.boundaryInfo.get(p.id),
          onSelect: callbacks.onSelect,
          onRecenter: callbacks.onRecenter,
          onAddRelative: callbacks.onAddRelative,
          onExpand: callbacks.onExpand,
        } satisfies PersonNodeData,
      };
    });

  const rfEdges: Edge[] = [];
  const seenEdges = new Set<string>();

  // ── Couple (spouse) edges — dashed horizontal lines
  // Determine left/right from actual layout positions, not from person_a/person_b convention.
  for (const r of visibleRelationships) {
    if (r.relationship_type !== "spouse" && r.relationship_type !== "partner") continue;
    if (!visibleIds.has(r.person_a_id) || !visibleIds.has(r.person_b_id)) continue;
    const [idA, idB] = [r.person_a_id, r.person_b_id].sort();
    const eid = `couple-${idA}-${idB}`;
    if (seenEdges.has(eid)) continue;
    seenEdges.add(eid);
    const posA = posMap.get(r.person_a_id);
    const posB = posMap.get(r.person_b_id);
    const leftId  = (posA && posB && posA.x <= posB.x) ? r.person_a_id : r.person_b_id;
    const rightId = leftId === r.person_a_id ? r.person_b_id : r.person_a_id;
    rfEdges.push({
      id: eid,
      source: leftId,
      sourceHandle: "right",
      target: rightId,
      targetHandle: "left",
      type: "straight",
      style: {
        stroke: r.relationship_type === "partner" ? "#8b5cf6" : "#f43f5e",
        strokeDasharray: "5 3",
        strokeWidth: 1.5,
      },
    });
  }

  // ── Descent edges — one per child, routed from couple midpoint when applicable
  // Build: childId -> [parentId, ...] from visible relationships
  const childParentIds = new Map<string, string[]>();
  for (const r of visibleRelationships) {
    if (r.relationship_type !== "parent") continue;
    const list = childParentIds.get(r.person_b_id) ?? [];
    list.push(r.person_a_id);
    childParentIds.set(r.person_b_id, list);
  }

  // Which parent is the entitree "primary" for each child (the one who owns the child in the layout)
  const entitreeChildren = entitreeMap; // has filtered children per primary parent
  const primaryParentOf = new Map<string, string>(); // childId -> primaryParentId
  for (const [pid, node] of Object.entries(entitreeChildren)) {
    for (const childId of node.children) {
      primaryParentOf.set(childId, pid);
    }
  }

  const drawnChildren = new Set<string>();
  for (const [childId, parentIds] of childParentIds) {
    if (drawnChildren.has(childId)) continue;
    drawnChildren.add(childId);
    if (!visibleIds.has(childId)) continue;

    // Primary parent = the one the layout was built around
    const primaryId = primaryParentOf.get(childId) ?? parentIds[0];
    if (!visibleIds.has(primaryId)) continue;

    // Is there a secondary parent (co-parent) also visible?
    const secondary = parentIds.find((pid) => pid !== primaryId && visibleIds.has(pid));
    const secondaryPos = secondary ? posMap.get(secondary) : undefined;
    const primaryPos = posMap.get(primaryId);

    const edgeId = `descent-${primaryId}-${childId}`;
    rfEdges.push({
      id: edgeId,
      source: primaryId,
      sourceHandle: "bottom",
      target: childId,
      targetHandle: "top",
      type: "descentEdge",
      data: secondaryPos && primaryPos
        ? { partnerCX: secondaryPos.x + NODE_W / 2 }
        : {},
      markerEnd: { type: MarkerType.ArrowClosed, color: "#6b7280", width: 14, height: 14 },
      style: { stroke: "#6b7280", strokeWidth: 1.5 },
    });
  }

  return { nodes: rfNodes, edges: rfEdges };
}

// ─── DescentEdge ──────────────────────────────────────────────────────────────
// Draws a parent→child line. When both parents are known, routes from the
// horizontal midpoint between them rather than from a single parent.

function DescentEdge({ sourceX, sourceY, targetX, targetY, markerEnd, style, data }: EdgeProps) {
  const partnerCX = (data as { partnerCX?: number } | undefined)?.partnerCX;
  const startX = partnerCX != null ? (sourceX + partnerCX) / 2 : sourceX;
  const midY = sourceY + (targetY - sourceY) * 0.5;
  const d = `M ${startX},${sourceY} L ${startX},${midY} L ${targetX},${midY} L ${targetX},${targetY}`;
  return <BaseEdge path={d} markerEnd={markerEnd} style={style} />;
}

// ─── PersonNode ───────────────────────────────────────────────────────────────

function genderIcon(gender: string | null | undefined): string {
  if (gender === "female" || gender === "f") return "/female_icon.svg";
  if (gender === "male"   || gender === "m") return "/male_icon.svg";
  if (gender === "other"  || gender === "o") return "/other_icon.svg";
  return "/unknown_icon.svg";
}

function genderAccent(gender: string | null | undefined): { color: string; bg: string; shadow: string } {
  if (gender === "female" || gender === "f") return { color: "#e11d48", bg: "#fff5f7", shadow: "rgba(225,29,72,0.18)" };
  if (gender === "male"   || gender === "m") return { color: "#2563eb", bg: "#f0f6ff", shadow: "rgba(37,99,235,0.18)" };
  return { color: "#64748b", bg: "#f8fafc", shadow: "rgba(100,116,135,0.14)" };
}

function PersonNode({ data }: NodeProps) {
  const d = data as PersonNodeData;
  const { person, isSelected, boundary, onSelect, onRecenter, onAddRelative, onExpand } = d;
  const [hovered, setHovered] = useState(false);

  const givenName  = person.given_name  || (!person.family_name ? "Unnamed" : "");
  const familyName = person.family_name ? person.family_name.toUpperCase() : "";
  const name = [person.given_name, person.family_name].filter(Boolean).join(" ") || "Unnamed";
  const birthYear = person.birth_date?.slice(0, 4);
  const deathYear = person.death_date?.slice(0, 4);
  const yearLabel = birthYear
    ? deathYear ? `${birthYear}–${deathYear}` : `b. ${birthYear}`
    : deathYear ? `d. ${deathYear}` : "";

  const { color: accent, bg: cardBg, shadow: accentShadow } = genderAccent(person.gender);

  const expandBtn = (pos: "top" | "bottom", title: string) => (
    <button
      className="nopan nodrag"
      onClick={(e) => { e.stopPropagation(); onExpand(person.id); }}
      title={title}
      style={{
        position: "absolute",
        left: "50%", [pos]: -11,
        transform: "translateX(-50%)",
        width: 22, height: 22, borderRadius: "50%",
        background: accent, color: "#fff",
        border: "2.5px solid #f8fafc",
        boxShadow: `0 2px 8px ${accentShadow}`,
        cursor: "pointer", zIndex: 20,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 15, lineHeight: 1,
      }}
    >+</button>
  );

  return (
    <div style={{ width: NODE_W, height: NODE_H, position: "relative", overflow: "visible" }}>

      <Handle type="target" position={Position.Top}    id="top"    style={{ opacity: 0, pointerEvents: "none", top: 0 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0, pointerEvents: "none", bottom: 0 }} />
      <Handle type="source" position={Position.Right}  id="right"  style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="target" position={Position.Left}   id="left"   style={{ opacity: 0, pointerEvents: "none" }} />

      {boundary?.hasParents   && expandBtn("top",    "Expand ancestors")}
      {boundary?.hasChildren  && expandBtn("bottom", "Expand descendants")}

      {/* Card */}
      <div
        onClick={(e) => { e.stopPropagation(); if (e.ctrlKey || e.metaKey) onRecenter(person.id); else onSelect(person.id); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: NODE_W, height: NODE_H,
          boxSizing: "border-box", overflow: "hidden",
          cursor: "pointer", userSelect: "none",
          borderRadius: 10,
          background: cardBg,
          border: `1px solid ${isSelected ? accent : "rgba(0,0,0,0.09)"}`,
          borderLeft: `4px solid ${accent}`,
          boxShadow: isSelected
            ? `0 0 0 3px ${accentShadow}, 0 4px 16px ${accentShadow}`
            : hovered
            ? `0 6px 18px rgba(0,0,0,0.11), 0 2px 5px rgba(0,0,0,0.06)`
            : `0 2px 6px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)`,
          transition: "box-shadow 0.18s ease, border-color 0.18s ease",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "9px 10px 8px 10px",
        }}
      >
        {/* Name block */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <img src={genderIcon(person.gender)} alt=""
              style={{ width: 15, height: 15, flexShrink: 0, opacity: 0.65, objectFit: "contain" }} />
            {givenName && (
              <p style={{
                margin: 0, fontSize: 12, fontWeight: 500, color: "#0f172a", lineHeight: 1.25,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1,
              }}>{givenName}</p>
            )}
          </div>
          {familyName && (
            <p style={{
              margin: "3px 0 0 20px",
              fontSize: 11, fontWeight: 800, color: accent,
              letterSpacing: "0.07em", lineHeight: 1.2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{familyName}</p>
          )}
        </div>

        {/* Bottom row: year or action buttons */}
        <div className="nopan nodrag">
          {hovered ? (
            <div style={{ display: "flex", gap: 4 }}>
              {(["Parent", "Partner", "Child"] as const).map((label) => {
                const rel: RelativeKind = label === "Parent" ? "parent" : label === "Partner" ? "spouse" : "child";
                return (
                  <button
                    key={label}
                    className="nopan nodrag"
                    onClick={(e) => { e.stopPropagation(); onAddRelative({ anchorId: person.id, anchorName: name, relation: rel }); }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${accent}22`; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = `${accent}10`; }}
                    style={{
                      fontSize: 9, fontWeight: 700, padding: "2px 6px",
                      borderRadius: 4, border: `1px solid ${accent}40`,
                      background: `${accent}10`, color: accent, cursor: "pointer",
                    }}
                  >+{label}</button>
                );
              })}
            </div>
          ) : yearLabel ? (
            <p style={{
              margin: 0, fontSize: 9, color: "#94a3b8",
              fontVariantNumeric: "tabular-nums", letterSpacing: "0.03em",
            }}>{yearLabel}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { personNode: PersonNode };
const edgeTypes = { descentEdge: DescentEdge };

// ─── FlowController ───────────────────────────────────────────────────────────

function FlowController({
  centreNodeId, nodes, onReady,
}: {
  centreNodeId: string | null; nodes: Node[]; onReady: () => void;
}) {
  const { setCenter, fitView } = useReactFlow();
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      if (nodes.length) {
        setTimeout(() => {
          fitView({ padding: 0.2, duration: 400 });
          // Enable transitions after the initial fitView settles
          setTimeout(onReady, 450);
        }, 60);
      }
    }
  }, [nodes.length, fitView, onReady]);

  useEffect(() => {
    if (!centreNodeId) return;
    const node = nodes.find((n) => n.id === centreNodeId);
    if (!node) return;
    setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2, { zoom: 1.2, duration: 500 });
  }, [centreNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

// ─── FlowView ─────────────────────────────────────────────────────────────────

function FlowView({
  nodes, edges, centreNodeId, onPaneClick, animate, onReady,
}: {
  nodes: Node[]; edges: Edge[];
  centreNodeId: string | null;
  onPaneClick: () => void;
  animate: boolean;
  onReady: () => void;
}) {
  return (
    <ReactFlowProvider>
      <ReactFlow
        className={animate ? "rf-animated" : ""}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.05}
        maxZoom={2}
        onPaneClick={onPaneClick}
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: "#f8fafc" }}
      >
        <Background gap={24} color="#e2e8f0" />
        <Controls showInteractive={false} />
        <MiniMap
          zoomable pannable
          nodeColor={(n) => {
            const g = (n.data as PersonNodeData).person?.gender;
            if (g === "female" || g === "f") return "#fda4af";
            if (g === "male"   || g === "m") return "#93c5fd";
            return "#cbd5e1";
          }}
        />
        <FlowController centreNodeId={centreNodeId} nodes={nodes} onReady={onReady} />
      </ReactFlow>
    </ReactFlowProvider>
  );
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

function AddRelativeDialog({ state, treeId, onClose }: {
  state: AddRelativeState | null; treeId: string; onClose: () => void;
}) {
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
                  <SelectTrigger className="w-full"><span className={isLiving?"":"text-muted-foreground"}>{isLiving==="true"?"Living":isLiving==="false"?"Deceased":"Unknown"}</span></SelectTrigger>
                  <SelectContent><SelectItem value="true">Living</SelectItem><SelectItem value="false">Deceased</SelectItem><SelectItem value="">Unknown</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Occupation</Label><Input value={occupation} onChange={e=>setOccupation(e.target.value)}/></div>
              <div className="space-y-1"><Label className="text-xs">Nationalities</Label><Input value={nationalities} onChange={e=>setNationalities(e.target.value)} placeholder="e.g. Italian, Swiss"/></div>
              <div className="space-y-1 col-span-2"><Label className="text-xs">Education</Label><Input value={education} onChange={e=>setEducation(e.target.value)}/></div>
            </div>
          </fieldset>
          <div className="space-y-1"><Label className="text-xs">Bio</Label><Textarea value={bio} onChange={e=>setBio(e.target.value)} rows={2} placeholder="Life story, notes, context…"/></div>
          {state?.relation === "spouse" && (
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
          )}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const settings = useMemo(() => loadGraphSettings(treeId), [treeId]);

  const [addRelative,      setAddRelative]      = useState<AddRelativeState | null>(null);
  const [rootPersonId,     setRootPersonId]     = useState<string | null>(
    searchParams.get("root") ?? settings.defaultRootPersonId
  );
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [centreNodeId,     setCentreNodeId]     = useState<string | null>(null);
  const [animate,          setAnimate]          = useState(false);
  const [maxDepth,         setMaxDepth]         = useState<number>(settings.maxDepth ?? 4);
  const [expandedIds,      setExpandedIds]      = useState<Set<string>>(new Set());

  // Sync root from URL param — allows linking to the graph centered on a person.
  // Clear the param after applying so it doesn't persist in the address bar.
  useEffect(() => {
    const rootParam = searchParams.get("root");
    if (rootParam) {
      setRootPersonId(rootParam);
      setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete("root"); return next; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: personsData, isLoading: pLoad, isError: pErr } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn:  () => listPersons(treeId, 0, 50000),
  });
  const { data: relsData, isLoading: rLoad, isError: rErr } = useQuery({
    queryKey: queryKeys.relationships.full(treeId),
    queryFn:  () => listRelationships(treeId, 0, 50000),
  });

  const persons       = personsData?.items ?? [];
  const relationships = relsData?.items   ?? [];

  const rootId = useMemo(() => {
    if (!persons.length) return "";
    const wanted = rootPersonId ?? findDefaultRoot(persons, relationships);
    return persons.some((p) => p.id === wanted) ? wanted : persons[0].id;
  }, [persons, relationships, rootPersonId]);

  const { visiblePersons, visibleRelationships, boundaryInfo } = useMemo(() => {
    if (!persons.length || !rootId)
      return { visiblePersons: [], visibleRelationships: [], boundaryInfo: new Map<string, BoundaryFlags>() };
    const visibleIds = bfsVisible(persons, relationships, rootId, maxDepth, expandedIds);
    return {
      visiblePersons:       persons.filter((p) => visibleIds.has(p.id)),
      visibleRelationships: relationships.filter((r) => visibleIds.has(r.person_a_id) && visibleIds.has(r.person_b_id)),
      boundaryInfo:         computeBoundary(visibleIds, relationships, rootId),
    };
  }, [persons, relationships, rootId, maxDepth, expandedIds]);

  const handleSelect = useCallback((id: string) => setSelectedPersonId(id), []);

  const handleRecenter = useCallback((id: string) => {
    setAnimate(false);
    setRootPersonId(id);
    setSelectedPersonId(id);
    setCentreNodeId(id);
    setExpandedIds(new Set());
    saveGraphSettings(treeId, { ...loadGraphSettings(treeId), defaultRootPersonId: id });
    setTimeout(() => setAnimate(true), 400);
  }, [treeId]);

  const handleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => new Set([...prev, id]));
  }, []);

  const handleDepthChange = useCallback((d: number) => {
    setAnimate(false);
    setMaxDepth(d);
    setExpandedIds(new Set());
    saveGraphSettings(treeId, { ...loadGraphSettings(treeId), maxDepth: d });
    setTimeout(() => setAnimate(true), 400);
  }, [treeId]);

  const { nodes, edges } = useMemo(() => {
    if (!visiblePersons.length || !rootId) return { nodes: [], edges: [] };
    return buildLayout(visiblePersons, visibleRelationships, rootId, {
      selectedPersonId, boundaryInfo, treeId,
      onSelect: handleSelect, onRecenter: handleRecenter,
      onAddRelative: setAddRelative, onExpand: handleExpand,
    });
  }, [visiblePersons, visibleRelationships, rootId, selectedPersonId, boundaryInfo,
      treeId, handleSelect, handleRecenter, handleExpand]);

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
      <AddRelativeDialog state={addRelative} treeId={treeId} onClose={() => setAddRelative(null)} />
    </div>
  );

  const selectedPerson = selectedPersonId ? persons.find(p => p.id === selectedPersonId) : null;

  return (
    <>
      <div style={{ height: "calc(100vh - 220px)", minHeight: 400 }}
        className="relative border rounded-xl overflow-hidden">

        <FlowView
          nodes={nodes} edges={edges}
          centreNodeId={centreNodeId}
          onPaneClick={() => setSelectedPersonId(null)}
          animate={animate}
          onReady={() => setAnimate(true)}
        />

        {/* Depth controls */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
          <span className="text-xs text-slate-500 font-medium mr-1">Depth</span>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button key={d} onClick={() => handleDepthChange(d)}
              className={`w-6 h-6 rounded text-xs font-semibold transition-colors ${
                maxDepth === d ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}>
              {d === 0 ? "∞" : d}
            </button>
          ))}
          {expandedIds.size > 0 && (
            <button onClick={() => setExpandedIds(new Set())}
              className="ml-1 text-xs text-indigo-600 hover:text-indigo-800 underline"
              title="Collapse expanded branches">reset</button>
          )}
        </div>

        {/* Stats badge */}
        <div className="absolute bottom-8 left-2 z-10 text-xs text-slate-400 bg-white/70 rounded px-2 py-0.5 pointer-events-none select-none">
          {visiblePersons.length} / {persons.length} shown
          {expandedIds.size > 0 && ` · ${expandedIds.size} expanded`}
        </div>

        <p className="absolute bottom-8 right-2 text-xs text-muted-foreground/50 pointer-events-none select-none z-10">
          Click · Ctrl+click to re-center · Scroll to zoom
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
            <Button size="sm" variant="outline"
              onClick={() => navigate(`/trees/${treeId}/persons/${selectedPerson.id}?from=graph`)}>
              View profile →
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground"
              onClick={() => setSelectedPersonId(null)}>&times;</Button>
          </div>
        </div>
      )}

      <AddRelativeDialog state={addRelative} treeId={treeId} onClose={() => setAddRelative(null)} />
    </>
  );
}
