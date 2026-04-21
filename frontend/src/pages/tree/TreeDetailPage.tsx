import { useMemo } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { Users, Heart, BookOpen, MapPin, Network, Calendar, Globe, Briefcase } from "lucide-react";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { useQuery } from "@tanstack/react-query";
import { getTree } from "@/api/trees";
import { listPersons } from "@/api/persons";
import { listRelationships } from "@/api/relationships";
import { listStories } from "@/api/stories";
import { listTreePlaces, listTreePlaceDetails } from "@/api/places";
import { formatFlexDate } from "@/lib/dates";
import { queryKeys } from "@/lib/queryKeys";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { PlacesMap } from "@/components/tree/PlacesMap";
import { GraphTab }         from "@/components/tree/GraphTab";
import { PersonsTab }       from "@/components/tree/PersonsTab";
import { RelationshipsTab } from "@/components/tree/RelationshipsTab";
import { StoriesTab }       from "@/components/tree/StoriesTab";
import { PlacesTab }        from "@/components/tree/PlacesTab";
import { MediaTab }         from "@/components/tree/MediaTab";

// ─── Dashboard helpers ───────────────────────────────────────────────────────

function genderBadgeColor(g: string): string {
  if (g === "male"   || g === "m") return "bg-blue-500";
  if (g === "female" || g === "f") return "bg-rose-500";
  if (g === "other"  || g === "o") return "bg-amber-500";
  return "bg-slate-400";
}

function topN(items: string[], n: number): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

// ─── Dashboard tab ────────────────────────────────────────────────────────────

function DashboardTab({ treeId }: { treeId: string }) {
  const navigate = useNavigate();

  const { data: personsData }     = useQuery({ queryKey: queryKeys.persons.stat(treeId),          queryFn: () => listPersons(treeId, 0, 1),          enabled: !!treeId });
  const { data: relsData }        = useQuery({ queryKey: queryKeys.relationships.stat(treeId),    queryFn: () => listRelationships(treeId, 0, 1),    enabled: !!treeId });
  const { data: storiesData }     = useQuery({ queryKey: queryKeys.stories.stat(treeId),          queryFn: () => listStories(treeId, { limit: 1 }),  enabled: !!treeId });
  const { data: places }          = useQuery({ queryKey: queryKeys.places.forTree(treeId),        queryFn: () => listTreePlaces(treeId),             enabled: !!treeId });
  const { data: fullPersonsData } = useQuery({ queryKey: queryKeys.persons.full(treeId),          queryFn: () => listPersons(treeId, 0, 50000),      enabled: !!treeId });
  const { data: fullStoriesData } = useQuery({ queryKey: queryKeys.stories.all(treeId),           queryFn: () => listStories(treeId, { limit: 20 }), enabled: !!treeId });
  const { data: fullRelsData }    = useQuery({ queryKey: queryKeys.relationships.full(treeId),    queryFn: () => listRelationships(treeId, 0, 50000),enabled: !!treeId });
  const { data: placeDetails }    = useQuery({ queryKey: queryKeys.places.forTreeDetails(treeId), queryFn: () => listTreePlaceDetails(treeId),       enabled: !!treeId });

  const persons = fullPersonsData?.items ?? [];

  const stats = useMemo(() => {
    const genders: Record<string, number> = {};
    const allNationalities: string[] = [];
    const allOccupations: string[] = [];
    let withBirthDate = 0, withLocation = 0, living = 0, deceased = 0;
    let minYear = Infinity, maxYear = -Infinity;

    for (const p of persons) {
      const g = p.gender ?? "unknown";
      genders[g] = (genders[g] ?? 0) + 1;
      if (p.birth_date) {
        withBirthDate++;
        const y = parseInt(p.birth_date.slice(0, 4), 10);
        if (y < minYear) minYear = y;
        if (y > maxYear) maxYear = y;
      }
      if (p.birth_location || p.birth_place_id) withLocation++;
      if (p.is_living === true) living++;
      if (p.is_living === false) deceased++;
      if (p.nationalities) allNationalities.push(...p.nationalities);
      if (p.occupation) allOccupations.push(p.occupation);
    }

    const relTypes: Record<string, number> = {};
    for (const r of fullRelsData?.items ?? []) {
      if (r.relationship_type === "child") continue; // inverse of parent — skip to avoid double-count
      relTypes[r.relationship_type] = (relTypes[r.relationship_type] ?? 0) + 1;
    }

    return {
      genders, relTypes, living, deceased, withBirthDate, withLocation,
      yearRange: minYear <= maxYear ? [minYear, maxYear] as const : null,
      topNationalities: topN(allNationalities, 3),
      topOccupations:   topN(allOccupations, 3),
    };
  }, [persons, fullRelsData]);

  const recentPersons = useMemo(() =>
    [...persons].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6),
    [persons]);
  const recentStories = useMemo(() =>
    [...(fullStoriesData?.items ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
    [fullStoriesData]);

  const geocodedPlaces = (placeDetails ?? []).filter(p => p.lat !== null && p.lon !== null);
  const completeness   = persons.length > 0
    ? Math.round(((stats.withBirthDate + stats.withLocation) / (persons.length * 2)) * 100)
    : 0;

  return (
    <div className="space-y-6 py-2">

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* People */}
        <Card className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => navigate("?tab=people", { replace: true })}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground">People</span>
              <Users className="h-4 w-4 text-muted-foreground/50" />
            </div>
            <p className="text-3xl font-bold tabular-nums">{personsData?.total ?? "—"}</p>
            {persons.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                {Object.entries(stats.genders).map(([g, n]) => (
                  <span key={g} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className={`w-2 h-2 rounded-full ${genderBadgeColor(g)}`} />
                    {n}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Relationships */}
        <Card className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => navigate("?tab=relationships", { replace: true })}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground">Relationships</span>
              <Heart className="h-4 w-4 text-muted-foreground/50" />
            </div>
            <p className="text-3xl font-bold tabular-nums">{relsData?.total ?? "—"}</p>
            {Object.keys(stats.relTypes).length > 0 && (
              <p className="text-xs text-muted-foreground mt-2 leading-tight">
                {Object.entries(stats.relTypes).map(([t, n]) => `${n} ${t}`).join(" · ")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Stories */}
        <Card className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => navigate("?tab=stories", { replace: true })}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground">Stories</span>
              <BookOpen className="h-4 w-4 text-muted-foreground/50" />
            </div>
            <p className="text-3xl font-bold tabular-nums">{storiesData?.total ?? "—"}</p>
          </CardContent>
        </Card>

        {/* Places */}
        <Card className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => navigate("?tab=places", { replace: true })}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground">Places</span>
              <MapPin className="h-4 w-4 text-muted-foreground/50" />
            </div>
            <p className="text-3xl font-bold tabular-nums">{places?.length ?? "—"}</p>
            {places && places.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {geocodedPlaces.length} of {places.length} geocoded
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Map + Insights ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Map — 3/5 */}
        {geocodedPlaces.length > 0 ? (
          <Card className="lg:col-span-3 overflow-hidden">
            <div className="h-[300px]">
              <PlacesMap places={geocodedPlaces} />
            </div>
          </Card>
        ) : (
          <Card className="lg:col-span-3">
            <CardContent className="h-[300px] flex flex-col items-center justify-center gap-2 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No geocoded places yet.</p>
              <button onClick={() => navigate("?tab=places", { replace: true })} className="text-xs text-primary hover:underline">Go to Places →</button>
            </CardContent>
          </Card>
        )}

        {/* Insights — 2/5 */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 h-full flex flex-col gap-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Insights</p>
            <div className="space-y-3 text-sm flex-1">
              {stats.yearRange && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Birth years</span>
                  <span className="font-medium ml-auto">{stats.yearRange[0]} – {stats.yearRange[1]}</span>
                </div>
              )}
              {(stats.living > 0 || stats.deceased > 0) && (
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium ml-auto text-right">{stats.living > 0 ? `${stats.living} living` : ""}{stats.living > 0 && stats.deceased > 0 ? " · " : ""}{stats.deceased > 0 ? `${stats.deceased} deceased` : ""}</span>
                </div>
              )}
              {stats.topNationalities.length > 0 && (
                <div className="flex items-start gap-2">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-muted-foreground shrink-0">Nationalities</span>
                  <span className="font-medium ml-auto text-right truncate">{stats.topNationalities.map(n => n.value).join(", ")}</span>
                </div>
              )}
              {stats.topOccupations.length > 0 && (
                <div className="flex items-start gap-2">
                  <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-muted-foreground shrink-0">Occupations</span>
                  <span className="font-medium ml-auto text-right truncate">{stats.topOccupations.map(o => o.value).join(", ")}</span>
                </div>
              )}
            </div>
            {persons.length > 0 && (
              <div className="space-y-1.5 pt-3 border-t">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Data completeness</span>
                  <span className="font-semibold">{completeness}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completeness}%` }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Open Family Graph ───────────────────────────────────────────── */}
      <button
        onClick={() => navigate("?tab=graph", { replace: true })}
        className="w-full rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/40 transition-all px-5 py-4 flex items-center justify-between group"
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
            <Network className="h-5 w-5 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold group-hover:text-primary transition-colors">Open Family Graph</p>
            <p className="text-xs text-muted-foreground">Interactive tree visualization</p>
          </div>
        </div>
        <span className="text-muted-foreground group-hover:text-primary transition-colors text-lg">→</span>
      </button>

      {/* ── Recent activity ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent people */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recently added</h2>
            {persons.length > 6 && (
              <button onClick={() => navigate("?tab=people", { replace: true })} className="text-xs text-primary hover:underline">View all →</button>
            )}
          </div>
          {recentPersons.length === 0
            ? <p className="text-sm text-muted-foreground italic">No people yet.</p>
            : (
              <div className="space-y-0.5">
                {recentPersons.map((p) => {
                  const name    = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
                  const ini     = ((p.given_name?.[0] ?? "") + (p.family_name?.[0] ?? "")).toUpperCase() || "?";
                  const date    = formatFlexDate(p.birth_date, p.birth_date_qualifier, p.birth_date_2, p.birth_date_original);
                  const avatarBg = genderBadgeColor(p.gender ?? "unknown");
                  return (
                    <Link key={p.id} to={`/trees/${treeId}/persons/${p.id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted transition-colors group"
                    >
                      <div className={`${avatarBg} w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0`}>{ini}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{name}</p>
                        {date && <p className="text-xs text-muted-foreground">b. {date}</p>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )
          }
        </div>

        {/* Recent stories */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent stories</h2>
            {(fullStoriesData?.items.length ?? 0) > 5 && (
              <button onClick={() => navigate("?tab=stories", { replace: true })} className="text-xs text-primary hover:underline">View all →</button>
            )}
          </div>
          {recentStories.length === 0
            ? <p className="text-sm text-muted-foreground italic">No stories yet.</p>
            : (
              <div className="space-y-0.5">
                {recentStories.map((s) => (
                  <Link key={s.id} to={`/trees/${treeId}/stories/${s.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <BookOpen className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{s.title}</p>
                      {(s.event_date || s.event_location) && (
                        <p className="text-xs text-muted-foreground truncate">
                          {[s.event_date?.slice(0, 4), s.event_location].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}

// ─── TreeDetailPage ───────────────────────────────────────────────────────────

export function TreeDetailPage() {
  const { treeId } = useParams<{ treeId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: tree, isLoading, error } = useQuery({
    queryKey: queryKeys.trees.detail(treeId!),
    queryFn:  () => getTree(treeId!),
    enabled:  !!treeId,
  });
  const { data: pCount } = useQuery({ queryKey: queryKeys.persons.stat(treeId!),      queryFn: () => listPersons(treeId!, 0, 1),        enabled: !!treeId });
  const { data: rCount } = useQuery({ queryKey: queryKeys.relationships.stat(treeId!), queryFn: () => listRelationships(treeId!, 0, 1),  enabled: !!treeId });
  const { data: sCount } = useQuery({ queryKey: queryKeys.stories.stat(treeId!),      queryFn: () => listStories(treeId!, { limit: 1 }), enabled: !!treeId });
  const { data: plData } = useQuery({ queryKey: queryKeys.places.forTree(treeId!),    queryFn: () => listTreePlaces(treeId!),            enabled: !!treeId });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error instanceof Error ? error.message : "Failed to load tree"} />;
  if (!tree) return null;

  const badge = (n: number | undefined) => n ? ` (${n})` : "";

  const activeTab = searchParams.get("tab") || "home";
  const TAB_LABELS: Record<string, string> = {
    graph: "Graph", people: "People", relationships: "Relationships",
    stories: "Stories", places: "Places", media: "Media",
  };
  const tabLabel = TAB_LABELS[activeTab];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <Breadcrumb items={[
          { label: "Dashboard", href: "/dashboard" },
          ...(tabLabel
            ? [{ label: tree.name, href: `/trees/${treeId}` }, { label: tabLabel }]
            : [{ label: tree.name }]
          ),
        ]} />
        <Button variant="outline" size="sm" className="shrink-0"
          onClick={() => navigate(`/trees/${treeId}/manage`)}
        >
          Manage
        </Button>
      </div>

      {/* Tabs — scrollable so they never overflow */}
      <Tabs value={searchParams.get("tab") || "home"} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}>
        <TabsList className="overflow-x-auto flex-nowrap w-full justify-start">
          <TabsTrigger value="home"          className="shrink-0">Home</TabsTrigger>
          <TabsTrigger value="graph"         className="shrink-0">Graph</TabsTrigger>
          <TabsTrigger value="people"        className="shrink-0">People{badge(pCount?.total)}</TabsTrigger>
          <TabsTrigger value="relationships" className="shrink-0">Relationships{badge(rCount?.total)}</TabsTrigger>
          <TabsTrigger value="stories"       className="shrink-0">Stories{badge(sCount?.total)}</TabsTrigger>
          <TabsTrigger value="places"        className="shrink-0">Places{badge(plData?.length)}</TabsTrigger>
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
