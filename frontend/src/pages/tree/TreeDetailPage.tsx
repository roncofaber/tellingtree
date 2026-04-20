import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getTree } from "@/api/trees";
import { listPersons } from "@/api/persons";
import { listRelationships } from "@/api/relationships";
import { listStories } from "@/api/stories";
import { listTreePlaces } from "@/api/places";
import { formatFlexDate } from "@/lib/dates";
import { queryKeys } from "@/lib/queryKeys";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { GraphTab }         from "@/components/tree/GraphTab";
import { PersonsTab }       from "@/components/tree/PersonsTab";
import { RelationshipsTab } from "@/components/tree/RelationshipsTab";
import { StoriesTab }       from "@/components/tree/StoriesTab";
import { PlacesTab }        from "@/components/tree/PlacesTab";
import { MediaTab }         from "@/components/tree/MediaTab";

// ─── Dashboard tab ────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 text-center">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

function DashboardTab({ treeId }: { treeId: string }) {
  const navigate = useNavigate();

  const { data: personsData }       = useQuery({ queryKey: queryKeys.persons.stat(treeId),         queryFn: () => listPersons(treeId, 0, 1),         enabled: !!treeId });
  const { data: relsData }          = useQuery({ queryKey: queryKeys.relationships.all(treeId),    queryFn: () => listRelationships(treeId, 0, 1),   enabled: !!treeId });
  const { data: storiesData }       = useQuery({ queryKey: queryKeys.stories.stat(treeId),         queryFn: () => listStories(treeId, { limit: 1 }), enabled: !!treeId });
  const { data: places }            = useQuery({ queryKey: queryKeys.places.forTree(treeId),       queryFn: () => listTreePlaces(treeId),            enabled: !!treeId });

  // Recent people: use the full cache if available, otherwise trigger a fresh fetch
  const { data: fullPersonsData }   = useQuery({ queryKey: queryKeys.persons.full(treeId),         queryFn: () => listPersons(treeId, 0, 50000),     enabled: !!treeId });
  const { data: fullStoriesData }   = useQuery({ queryKey: queryKeys.stories.all(treeId),          queryFn: () => listStories(treeId, { limit: 20 }), enabled: !!treeId });

  const recentPersons = [...(fullPersonsData?.items ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6);

  const recentStories = [...(fullStoriesData?.items ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  return (
    <div className="space-y-6 py-2">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="People"        value={personsData?.total ?? "—"} />
        <StatCard label="Relationships" value={relsData?.total    ?? "—"} />
        <StatCard label="Stories"       value={storiesData?.total  ?? "—"} />
        <StatCard label="Places"        value={places?.length      ?? "—"} />
      </div>

      {/* View graph hero */}
      <button
        onClick={() => navigate(`?tab=graph`, { replace: true })}
        className="w-full rounded-xl border-2 border-dashed border-slate-300 hover:border-primary hover:bg-primary/5 transition-colors py-6 text-center group"
      >
        <p className="text-base font-semibold group-hover:text-primary transition-colors">Open Family Graph →</p>
        <p className="text-sm text-muted-foreground mt-1">Interactive tree of all people and relationships</p>
      </button>

      {/* Recent */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recently added people</h2>
          {recentPersons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No people yet.</p>
          ) : (
            <div className="space-y-0.5">
              {recentPersons.map((p) => {
                const name = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
                const initials = ((p.given_name?.[0] ?? "") + (p.family_name?.[0] ?? "")).toUpperCase() || "?";
                const date = formatFlexDate(p.birth_date, p.birth_date_qualifier, p.birth_date_2, p.birth_date_original);
                return (
                  <Link key={p.id} to={`/trees/${treeId}/persons/${p.id}`}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors group"
                  >
                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold shrink-0 group-hover:bg-slate-300 transition-colors">{initials}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      {date && <p className="text-xs text-muted-foreground">b. {date}</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent stories</h2>
          {recentStories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stories yet.</p>
          ) : (
            <div className="space-y-0.5">
              {recentStories.map((s) => (
                <Link key={s.id} to={`/trees/${treeId}/stories/${s.id}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors group"
                >
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs shrink-0">📖</div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.title}</p>
                    {s.event_date && <p className="text-xs text-muted-foreground">{s.event_date.slice(0, 4)}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TreeDetailPage ───────────────────────────────────────────────────────────

export function TreeDetailPage() {
  const { treeId } = useParams<{ treeId: string }>();
  const navigate = useNavigate();

  const { data: tree, isLoading, error } = useQuery({
    queryKey: queryKeys.trees.detail(treeId!),
    queryFn:  () => getTree(treeId!),
    enabled:  !!treeId,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error instanceof Error ? error.message : "Failed to load tree"} />;
  if (!tree) return null;

  return (
    <div className="space-y-3">
      {/* Compact header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground shrink-0">← Dashboard</Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-lg font-semibold truncate">{tree.name}</h1>
        </div>
        <Button variant="outline" size="sm" className="shrink-0"
          onClick={() => navigate(`/trees/${treeId}/manage`)}
        >
          Manage
        </Button>
      </div>

      {/* Tabs — scrollable so they never overflow */}
      <Tabs defaultValue="home">
        <TabsList className="overflow-x-auto flex-nowrap w-full justify-start">
          <TabsTrigger value="home"          className="shrink-0">Home</TabsTrigger>
          <TabsTrigger value="graph"         className="shrink-0">Graph</TabsTrigger>
          <TabsTrigger value="people"        className="shrink-0">People</TabsTrigger>
          <TabsTrigger value="relationships" className="shrink-0">Relationships</TabsTrigger>
          <TabsTrigger value="stories"       className="shrink-0">Stories</TabsTrigger>
          <TabsTrigger value="places"        className="shrink-0">Places</TabsTrigger>
          <TabsTrigger value="media"         className="shrink-0">Media</TabsTrigger>
        </TabsList>

        <TabsContent value="home">
          <DashboardTab treeId={treeId!} />
        </TabsContent>
        <TabsContent value="graph">
          <GraphTab treeId={treeId!} />
        </TabsContent>
        <TabsContent value="people">
          <PersonsTab treeId={treeId!} />
        </TabsContent>
        <TabsContent value="relationships">
          <RelationshipsTab treeId={treeId!} />
        </TabsContent>
        <TabsContent value="stories">
          <StoriesTab treeId={treeId!} />
        </TabsContent>
        <TabsContent value="places">
          <PlacesTab treeId={treeId!} />
        </TabsContent>
        <TabsContent value="media">
          <MediaTab treeId={treeId!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
