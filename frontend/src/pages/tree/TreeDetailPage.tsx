import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { Users, BookOpen, MapPin, Calendar, Globe, Briefcase, Settings, ImageIcon, Cake, AlertTriangle, Search, UserPlus, PenLine } from "lucide-react";
import { AddPersonDialog } from "@/components/common/AddPersonDialog";
import { genderColor, getFullName } from "@/lib/person";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { useQuery } from "@tanstack/react-query";
import { getTree, searchTree, type SearchResult } from "@/api/trees";
import { listPersons } from "@/api/persons";
import { listRelationships } from "@/api/relationships";
import { listStories } from "@/api/stories";
import { listTreePlaces, listTreePlaceDetails } from "@/api/places";
import { formatFlexDate } from "@/lib/dates";
import { queryKeys } from "@/lib/queryKeys";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { PlacesMap } from "@/components/tree/PlacesMap";
import { GraphTab }         from "@/components/tree/GraphTab";
import { PersonsTab }       from "@/components/tree/PersonsTab";
import { StoriesTab }       from "@/components/tree/StoriesTab";
import { MapTab }           from "@/components/tree/MapTab";
import { MediaTab }         from "@/components/tree/MediaTab";

// ─── Dashboard helpers ───────────────────────────────────────────────────────


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

function DashboardTab({ treeId, treeSlug }: { treeId: string; treeSlug: string }) {
  const navigate = useNavigate();
  const base = `/trees/${treeSlug}`;
  const [addPersonOpen, setAddPersonOpen] = useState(false);

  const { data: personsData }     = useQuery({ queryKey: queryKeys.persons.stat(treeId),          queryFn: () => listPersons(treeId, 0, 1),          enabled: !!treeId });
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
    const allSurnames: string[] = [];
    let withBirthDate = 0, withLocation = 0, withBio = 0, living = 0, deceased = 0;
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
      if (p.bio) withBio++;
      if (p.is_living === true) living++;
      if (p.is_living === false) deceased++;
      if (p.nationalities) allNationalities.push(...p.nationalities);
      if (p.occupation) allOccupations.push(p.occupation);
      if (p.family_name) allSurnames.push(p.family_name);
    }

    const relTypes: Record<string, number> = {};
    for (const r of fullRelsData?.items ?? []) {
      if (r.relationship_type === "child") continue;
      relTypes[r.relationship_type] = (relTypes[r.relationship_type] ?? 0) + 1;
    }

    return {
      genders, relTypes, living, deceased, withBirthDate, withLocation, withBio,
      yearRange: minYear <= maxYear ? [minYear, maxYear] as const : null,
      topNationalities: topN(allNationalities, 5),
      topOccupations:   topN(allOccupations, 5),
      topSurnames:      topN(allSurnames, 5),
    };
  }, [persons, fullRelsData]);

  const recentPersons = useMemo(() =>
    [...persons].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6),
    [persons]);
  const recentStories = useMemo(() =>
    [...(fullStoriesData?.items ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
    [fullStoriesData]);

  const upcomingBirthdays = useMemo(() => {
    const today = new Date();
    const todayMD = today.getMonth() * 100 + today.getDate();
    const thisYear = today.getFullYear();

    return persons
      .filter(p => p.birth_date)
      .map(p => {
        const [y, m, d] = p.birth_date!.split("-").map(Number);
        const md = (m - 1) * 100 + d;
        let daysAway = md - todayMD;
        if (daysAway < 0) daysAway += 365;
        const turnsAge = thisYear - y + (md >= todayMD ? 0 : 1);
        const deceased = p.is_living === false;
        return { person: p, month: m, day: d, birthYear: y, daysAway, turnsAge, deceased };
      })
      .filter(b => b.daysAway <= 15)
      .sort((a, b) => a.daysAway - b.daysAway)
      .slice(0, 8);
  }, [persons]);

  const geocodedPlaces = (placeDetails ?? []).filter(p => p.lat !== null && p.lon !== null);
  const completeness   = persons.length > 0
    ? Math.round(((stats.withBirthDate + stats.withLocation) / (persons.length * 2)) * 100)
    : 0;

  const suggestions = useMemo(() => {
    const items: { type: string; label: string; count?: number }[] = [];

    // Possible duplicates (same name, birth years within 15 years)
    const nameGroups = new Map<string, typeof persons>();
    for (const p of persons) {
      const key = [p.given_name, p.family_name].filter(Boolean).join(" ").toLowerCase();
      if (!key) continue;
      if (!nameGroups.has(key)) nameGroups.set(key, []);
      nameGroups.get(key)!.push(p);
    }
    let dupeCount = 0;
    for (const [, group] of nameGroups) {
      if (group.length < 2) continue;
      const years = group.map(p => p.birth_date ? parseInt(p.birth_date.slice(0, 4), 10) : null).filter((y): y is number => y !== null);
      if (years.length >= 2 && Math.max(...years) - Math.min(...years) > 15) continue;
      dupeCount++;
    }
    if (dupeCount > 0) items.push({ type: "duplicate", label: "Possible duplicates", count: dupeCount });

    // Missing birth dates
    const noBirthDate = persons.filter(p => !p.birth_date).length;
    if (noBirthDate > 0) items.push({ type: "missing", label: "Missing birth date", count: noBirthDate });

    // Missing gender
    const noGender = persons.filter(p => !p.gender || p.gender === "unknown").length;
    if (noGender > 0) items.push({ type: "missing", label: "Missing gender", count: noGender });

    // Ungeocoded locations
    const ungeocoded = persons.filter(p => (p.birth_location && !p.birth_place_id) || (p.death_location && !p.death_place_id)).length;
    if (ungeocoded > 0) items.push({ type: "geocode", label: "Ungeocoded locations", count: ungeocoded });

    // Orphan persons (no relationships)
    const relPersonIds = new Set<string>();
    for (const r of fullRelsData?.items ?? []) { relPersonIds.add(r.person_a_id); relPersonIds.add(r.person_b_id); }
    const orphans = persons.filter(p => !relPersonIds.has(p.id)).length;
    if (orphans > 0) items.push({ type: "orphan", label: "No relationships", count: orphans });

    return items;
  }, [persons, fullRelsData]);

  return (
    <div className="space-y-5 py-2">

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "People", count: personsData?.total, icon: Users, tab: "people" },
          { label: "Places", count: places?.length, icon: MapPin, tab: "map" },
          { label: "Stories", count: storiesData?.total, icon: BookOpen, tab: "stories" },
          { label: "Media", count: null, icon: ImageIcon, tab: "media" },
        ].map(({ label, count, icon: Icon, tab }) => (
          <Card key={tab} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => navigate(`${base}/${tab}`, { replace: true })}>
            <CardContent className="px-4 py-3 flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              <span className="text-sm font-medium text-muted-foreground">{label}</span>
              {count != null && <span className="text-lg font-bold tabular-nums">{count}</span>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          onClick={() => setAddPersonOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add person
        </button>
        <button
          onClick={() => navigate(`${base}/stories`, { replace: true })}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
        >
          <PenLine className="h-3.5 w-3.5" />
          Write story
        </button>
      </div>
      <AddPersonDialog open={addPersonOpen} treeId={treeId} onClose={() => setAddPersonOpen(false)} />

      <div className="border-t" />

      {/* ── Map + Insights ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Map — 3/5 */}
        {geocodedPlaces.length > 0 ? (
          <div className="lg:col-span-3 overflow-hidden relative z-0 rounded-xl ring-1 ring-foreground/10 min-h-[300px]">
            <PlacesMap places={geocodedPlaces} />
          </div>
        ) : (
          <Card className="lg:col-span-3">
            <CardContent className="h-[300px] flex flex-col items-center justify-center gap-2 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No geocoded places yet.</p>
              <button onClick={() => navigate(`${base}/map`, { replace: true })} className="text-xs text-primary hover:underline">Go to Map →</button>
            </CardContent>
          </Card>
        )}

        {/* Insights — 2/5 */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 h-full flex flex-col gap-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Insights</p>

            {/* Key facts */}
            <div className="space-y-2.5 text-sm flex-1">
              {stats.yearRange && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Spans</span>
                  <span className="font-medium ml-auto">{stats.yearRange[0]} – {stats.yearRange[1]}</span>
                  {stats.yearRange[1] - stats.yearRange[0] > 0 && (
                    <span className="text-xs text-muted-foreground">({stats.yearRange[1] - stats.yearRange[0]} yrs)</span>
                  )}
                </div>
              )}
              {(stats.living > 0 || stats.deceased > 0) && (
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Status</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {stats.living > 0 && <span className="inline-flex items-center gap-1 text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{stats.living} living</span>}
                    {stats.deceased > 0 && <span className="inline-flex items-center gap-1 text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />{stats.deceased} deceased</span>}
                  </div>
                </div>
              )}

              {/* Surnames */}
              {stats.topSurnames.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Top surnames</p>
                  <div className="flex flex-wrap gap-1">
                    {stats.topSurnames.map(s => (
                      <span key={s.value} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {s.value}<span className="text-muted-foreground">{s.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Nationalities */}
              {stats.topNationalities.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Globe className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Nationalities</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {stats.topNationalities.map(n => (
                      <span key={n.value} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {n.value}<span className="text-muted-foreground">{n.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Occupations */}
              {stats.topOccupations.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Briefcase className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Occupations</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {stats.topOccupations.map(o => (
                      <span key={o.value} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {o.value}<span className="text-muted-foreground">{o.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Completeness breakdown */}
            {persons.length > 0 && (
              <div className="space-y-2 pt-3 border-t">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Data completeness</span>
                  <span className="font-semibold">{completeness}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completeness}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-x-2 text-[11px] text-muted-foreground">
                  <span>{stats.withBirthDate}/{persons.length} dated</span>
                  <span>{stats.withLocation}/{persons.length} located</span>
                  <span>{stats.withBio}/{persons.length} with bio</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="border-t" />

      {/* ── Upcoming birthdays ───────────────────────────────────────────── */}
      {upcomingBirthdays.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming birthdays</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {upcomingBirthdays.map(({ person: p, month, day, turnsAge, daysAway, deceased }) => {
              const name = getFullName(p);
              const ini = ((p.given_name?.[0] ?? "") + (p.family_name?.[0] ?? "")).toUpperCase() || "?";
              const avatarBg = genderColor(p.gender);
              const monthName = new Date(2000, month - 1, 1).toLocaleString(undefined, { month: "short" });
              const isToday = daysAway === 0;
              return (
                <Link key={p.id} to={`${base}/people/${p.id}`}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border px-4 py-3 min-w-[100px] text-center transition-colors hover:border-primary/40 hover:bg-muted/50 shrink-0 ${isToday ? "border-primary/30 bg-primary/5" : ""}`}
                >
                  <div className={`${avatarBg} w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white`}>{ini}</div>
                  <p className="text-xs font-medium truncate max-w-[90px]">{name}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Cake className="h-3 w-3" />
                    <span>{monthName} {day}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {isToday ? <span className="text-primary font-medium">Today!</span> : `in ${daysAway} day${daysAway !== 1 ? "s" : ""}`}
                    {turnsAge > 0 && ` · ${deceased ? "would turn" : "turns"} ${turnsAge}`}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-t" />

      {/* ── Recent activity ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent people */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recently added</h2>
          {recentPersons.length === 0
            ? <p className="text-sm text-muted-foreground italic">No people yet.</p>
            : (
              <div className="space-y-0.5">
                {recentPersons.map((p) => {
                  const name    = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
                  const ini     = ((p.given_name?.[0] ?? "") + (p.family_name?.[0] ?? "")).toUpperCase() || "?";
                  const bdate   = formatFlexDate(p.birth_date, p.birth_date_qualifier, p.birth_date_2, p.birth_date_original);
                  const added   = new Date(p.created_at).toLocaleDateString();
                  const avatarBg = genderColor(p.gender ?? "unknown");
                  return (
                    <Link key={p.id} to={`${base}/people/${p.id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted transition-colors group"
                    >
                      <div className={`${avatarBg} w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0`}>{ini}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          {bdate ? `b. ${bdate}` : ""}{bdate ? " · " : ""}Added {added}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )
          }
          {persons.length > 6 && (
            <button onClick={() => navigate(`${base}/people`, { replace: true })} className="text-xs text-primary hover:underline w-full text-center pt-1">View all people →</button>
          )}
        </div>

        {/* Recent stories */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent stories</h2>
          {recentStories.length === 0
            ? <p className="text-sm text-muted-foreground italic">No stories yet.</p>
            : (
              <div className="space-y-0.5">
                {recentStories.map((s) => {
                  const added = new Date(s.created_at).toLocaleDateString();
                  return (
                    <Link key={s.id} to={`${base}/stories/${s.id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <BookOpen className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{s.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[s.event_date?.slice(0, 4), s.event_location].filter(Boolean).join(" · ")}{(s.event_date || s.event_location) ? " · " : ""}Added {added}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )
          }
          {(fullStoriesData?.items.length ?? 0) > 5 && (
            <button onClick={() => navigate(`${base}/stories`, { replace: true })} className="text-xs text-primary hover:underline w-full text-center pt-1">View all stories →</button>
          )}
        </div>
      </div>

      {/* ── Tree health suggestions ────────────────────────────────────── */}
      {suggestions.length > 0 && (
        <>
          <div className="border-t" />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" /> Suggestions
              </h2>
              <Link to={`${base}/manage?tab=health`} className="text-xs text-primary hover:underline">View all in Settings →</Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {suggestions.slice(0, 4).map(s => (
                <div key={s.type} className="rounded-lg border px-3 py-2 text-xs">
                  <span className="font-medium">{s.count}</span>
                  <span className="text-muted-foreground ml-1">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TreeDetailPage ───────────────────────────────────────────────────────────

const VALID_TABS = ["graph", "map", "people", "stories", "media"] as const;
const TAB_LABELS: Record<string, string> = {
  graph: "Graph", map: "Map", people: "People",
  stories: "Stories", media: "Media",
};

export function TreeDetailPage() {
  const { treeSlug } = useParams<{ treeSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: tree, isLoading, error } = useQuery({
    queryKey: queryKeys.trees.detail(treeSlug!),
    queryFn:  () => getTree(treeSlug!),
    enabled:  !!treeSlug,
  });

  const treeId = tree?.id;
  const base = `/trees/${treeSlug}`;

  const { data: pCount } = useQuery({ queryKey: queryKeys.persons.stat(treeId!),      queryFn: () => listPersons(treeId!, 0, 1),        enabled: !!treeId });
  const { data: sCount } = useQuery({ queryKey: queryKeys.stories.stat(treeId!),      queryFn: () => listStories(treeId!, { limit: 1 }), enabled: !!treeId });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (val.trim().length < 2) { setSearchResults([]); setSearchOpen(false); return; }
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await searchTree(treeSlug!, val.trim());
        setSearchResults(results);
        setSearchOpen(results.length > 0);
      } catch { setSearchResults([]); }
    }, 300);
  }, [treeSlug]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error instanceof Error ? error.message : "Failed to load tree"} />;
  if (!tree || !treeId) return null;

  const badge = (n: number | undefined) => n ? ` (${n})` : "";

  const pathAfterSlug = location.pathname.slice(base.length).replace(/^\//, "");
  const activeTab = VALID_TABS.includes(pathAfterSlug as typeof VALID_TABS[number]) ? pathAfterSlug : "home";
  const tabLabel = TAB_LABELS[activeTab];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <Breadcrumb items={[
          { label: "Dashboard", href: "/dashboard" },
          ...(tabLabel
            ? [{ label: tree.name, href: base }, { label: tabLabel }]
            : [{ label: tree.name }]
          ),
        ]} />
        <div className="flex items-center gap-2">
          {/* Search */}
          <div ref={searchRef} className="relative">
            <div className="flex items-center gap-1 border rounded-md px-2 bg-background">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                placeholder="Search… (Ctrl+K)"
                className="h-8 w-32 sm:w-40 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute top-full mt-1 right-0 z-50 w-64 rounded-lg border bg-popover shadow-lg overflow-hidden">
                {searchResults.map(r => (
                  <Link
                    key={r.id}
                    to={`${base}/${r.type === "person" ? "people" : "stories"}/${r.id}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                  >
                    {r.type === "person"
                      ? <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      : <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    }
                    <span className="font-medium truncate">{r.label}</span>
                    {r.detail && <span className="text-xs text-muted-foreground ml-auto shrink-0">{r.detail}</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => navigate(`${base}/manage`)}
            title="Tree settings"
            className="shrink-0 flex items-center justify-center h-8 w-8 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs — scrollable so they never overflow */}
      <Tabs value={activeTab} onValueChange={(v) => navigate(v === "home" ? base : `${base}/${v}`, { replace: true })}>
        <TabsList className="overflow-x-auto flex-nowrap w-full justify-start">
          <TabsTrigger value="home"    className="shrink-0">Home</TabsTrigger>
          <TabsTrigger value="graph"   className="shrink-0">Graph</TabsTrigger>
          <TabsTrigger value="map"     className="shrink-0">Map</TabsTrigger>
          <TabsTrigger value="people"  className="shrink-0">People{badge(pCount?.total)}</TabsTrigger>
          <TabsTrigger value="stories" className="shrink-0">Stories{badge(sCount?.total)}</TabsTrigger>
          <TabsTrigger value="media"   className="shrink-0">Media</TabsTrigger>
        </TabsList>

        <TabsContent value="home">
          <DashboardTab treeId={treeId} treeSlug={treeSlug!} />
        </TabsContent>
        <TabsContent value="graph">
          <GraphTab treeId={treeId} />
        </TabsContent>
        <TabsContent value="map">
          <MapTab treeId={treeId} />
        </TabsContent>
        <TabsContent value="people">
          <PersonsTab treeId={treeId} />
        </TabsContent>
        <TabsContent value="stories">
          <StoriesTab treeId={treeId} />
        </TabsContent>
        <TabsContent value="media">
          <MediaTab treeId={treeId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
