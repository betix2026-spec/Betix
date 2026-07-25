"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, LayoutGrid, List, ChevronDown, Search, Swords } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

import { MatchCard } from "@/components/dashboard/MatchCard";
import { MatchTable } from "@/components/dashboard/MatchTable";
import { cn } from "@/lib/utils";
import { Match } from "@/types/match";
import { useI18n } from "@/lib/use-i18n";

export default function DashboardPage() {
    const { copy } = useI18n();
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [visibleCount, setVisibleCount] = useState(6);
    const [searchTeamA, setSearchTeamA] = useState("");
    const [searchTeamB, setSearchTeamB] = useState("");
    const [matches, setMatches] = useState<Match[]>([]);
    const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const searchParams = useSearchParams();
    const currentSport = searchParams.get("sport") || "all";

    const supabase = createClient();

    // Transform a single DB row into the UI Match type
    const transformMatch = useCallback((m: any): Match => {
        const dateObj = new Date(m.date_time);
        return {
            id: m.id,
            sport: m.sport,
            league: {
                name: m.league_name,
                country: "International"
            },
            homeTeam: {
                name: m.home_team.name,
                short: m.home_team.code || m.home_team.name.substring(0, 3).toUpperCase(),
                logo: m.home_team.logo
            },
            awayTeam: {
                name: m.away_team.name,
                short: m.away_team.code || m.away_team.name.substring(0, 3).toUpperCase(),
                logo: m.away_team.logo
            },
            // Fix: always compute local date string instead of UTC to avoid midnight offset issues
            date: [
                dateObj.getFullYear(),
                String(dateObj.getMonth() + 1).padStart(2, '0'),
                String(dateObj.getDate()).padStart(2, '0')
            ].join('-'),
            time: dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            status: m.status,
            statusShort: m.status_short,
            homeScore: m.score?.home,
            awayScore: m.score?.away,
            scoreDisplay: m.score?.display,
            scoreDetails: m.score?.details,
            venue: m.venue || "Stadium",
            predictions: []
        };
    }, []);

    // Initial fetch — only shows loading skeleton on first load
    const fetchMatches = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('matches')
                .select('*')
                .order('date_time', { ascending: true });

            if (error) {
                console.error("Error fetching matches:", error.message || error.code || JSON.stringify(error));
                return;
            }

            if (data) {
                setMatches(data.map(transformMatch));
            }
        } finally {
            setLoading(false);
        }
    }, [transformMatch]);

    // Handle realtime events by surgically updating state
    const handleRealtimeChange = useCallback((payload: any) => {
        const { eventType, new: newRow, old: oldRow } = payload;

        if (eventType === 'INSERT' && newRow) {
            const match = transformMatch(newRow);
            setMatches(prev => [...prev, match]);
        } else if (eventType === 'UPDATE' && newRow) {
            const match = transformMatch(newRow);
            setMatches(prev => prev.map(m => m.id === match.id ? match : m));
        } else if (eventType === 'DELETE' && oldRow) {
            setMatches(prev => prev.filter(m => m.id !== oldRow.id));
        }
    }, [transformMatch]);

    useEffect(() => {
        fetchMatches();

        const channel = supabase
            .channel('realtime_matches')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'matches'
                },
                handleRealtimeChange
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentSport]);



    // Reset pagination, search and league when sport changes
    useEffect(() => {
        setVisibleCount(6);
        setSearchTeamA("");
        setSearchTeamB("");
        setSelectedLeague(null);
    }, [currentSport]);

    const today = new Date().toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    // Extract unique leagues for the current sport
    const availableLeagues = Array.from(
        new Set(
            matches
                .filter(m => m.sport === currentSport || currentSport === "all")
                .map(m => m.league?.name)
                .filter(Boolean)
        )
    ).sort();

    // 1. Filter by Sport
    let filtered: Match[] = currentSport === "all"
        ? matches
        : matches.filter(m => m.sport === currentSport);

    // 2. Filter by League
    if (selectedLeague) {
        filtered = filtered.filter(m => m.league?.name === selectedLeague);
    }

    // 3. Filter by Status - Include imminent
    filtered = filtered.filter(m => m.status === "live" || m.status === "upcoming" || m.status === "imminent");

    // Sort: Live first, then Imminent, then by date/time
    filtered.sort((a, b) => {
        if (a.status === "live" && b.status !== "live") return -1;
        if (b.status === "live" && a.status !== "live") return 1;
        if (a.status === "imminent" && b.status !== "imminent" && b.status !== "live") return -1;
        if (b.status === "imminent" && a.status !== "imminent" && a.status !== "live") return 1;
        return new Date(a.date + "T" + a.time).getTime() - new Date(b.date + "T" + b.time).getTime();
    });

    const isSearching = searchTeamA.trim() !== "" || searchTeamB.trim() !== "";

    // 4. Filter by Search (VS Logic + Short Name + Acronym)
    if (isSearching) {
        // Generate acronym from a team name: "Paris Saint Germain" → "psg"
        const acronym = (name: string) => name.split(/\s+/).map(w => w[0]).join("").toLowerCase();

        // Check if a search term matches a team (name, stored code, or acronym)
        const teamMatches = (searchTerm: string, teamName: string, teamShort: string) => {
            const name = teamName.toLowerCase();
            const short = teamShort.toLowerCase();
            const acr = acronym(teamName);
            return name.includes(searchTerm) || short.includes(searchTerm) || acr.includes(searchTerm);
        };

        filtered = filtered.filter(m => {
            const teamAInput = searchTeamA.trim().toLowerCase();
            const teamBInput = searchTeamB.trim().toLowerCase();

            const homeName = m.homeTeam?.name || "";
            const homeShort = m.homeTeam?.short || "";
            const awayName = m.awayTeam?.name || "";
            const awayShort = m.awayTeam?.short || "";

            // Single search field used
            if (teamAInput && !teamBInput) {
                return teamMatches(teamAInput, homeName, homeShort) || teamMatches(teamAInput, awayName, awayShort);
            }
            if (!teamAInput && teamBInput) {
                return teamMatches(teamBInput, homeName, homeShort) || teamMatches(teamBInput, awayName, awayShort);
            }

            // VS scenario: one term must match Home, the other Away
            if (teamAInput && teamBInput) {
                const aHome = teamMatches(teamAInput, homeName, homeShort);
                const aAway = teamMatches(teamAInput, awayName, awayShort);
                const bHome = teamMatches(teamBInput, homeName, homeShort);
                const bAway = teamMatches(teamBInput, awayName, awayShort);
                return (aHome && bAway) || (aAway && bHome);
            }
            return true;
        });
    }

    const visibleMatches = filtered.slice(0, visibleCount);
    const hasMore = visibleCount < filtered.length;

    return (
        <div className="animate-fade-in relative pb-8 sm:pb-12">
            {/* Aurora Background for Header area */}
            <div className="absolute top-[-100px] left-[-100px] right-[-100px] h-[300px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none opacity-50 mix-blend-screen" />

            {/* Sticky Header & Controls Segment */}
            <div className="sticky top-14 z-40 bg-[#050505]/85 backdrop-blur-2xl pt-2 pb-1.5 sm:pt-6 sm:pb-4 border-b border-white/5 -mx-4 px-4 sm:-mx-8 sm:px-8 flex flex-col gap-1.5 sm:gap-5 -mt-6 supports-[backdrop-filter]:bg-[#050505]/80">

                {/* Top Row: Title & Stats vs View Toggles */}
                <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
                    <div className="flex items-center flex-wrap gap-2 sm:flex-col sm:items-start sm:gap-0 sm:space-y-1">
                        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-white capitalize leading-none">
                            {currentSport === "all" ? "Dashboard" : currentSport}
                        </h1>

                        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-sm text-neutral-400 bg-white/5 sm:bg-transparent px-2 sm:px-0 py-0.5 sm:py-0 rounded-full sm:rounded-none">
                            <Calendar className="size-3 hidden sm:block text-primary" />
                            <span className="capitalize hidden sm:block">{today}</span>
                            <span className="hidden sm:block text-white/10">&middot;</span>
                            <span className="text-emerald-400 font-medium whitespace-nowrap">
                                {loading ? "..." : `${filtered.length} matchs`}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-0.5 sm:gap-2 bg-black/40 p-0.5 sm:p-1 rounded-lg border border-white/10 backdrop-blur-md">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMode("grid")}
                            className={cn(
                                "h-6 sm:h-8 px-2 sm:px-3 gap-1 sm:gap-2 text-[10px] sm:text-xs transition-all",
                                viewMode === "grid" ? "bg-white/10 text-white shadow-sm" : "text-neutral-500 hover:text-white"
                            )}
                        >
                            <LayoutGrid className="size-3 sm:size-3.5" /> <span className="hidden sm:inline">{copy("Grille")}</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMode("list")}
                            className={cn(
                                "h-6 sm:h-8 px-2 sm:px-3 gap-1 sm:gap-2 text-[10px] sm:text-xs transition-all",
                                viewMode === "list" ? "bg-white/10 text-white shadow-sm" : "text-neutral-500 hover:text-white"
                            )}
                        >
                            <List className="size-3 sm:size-3.5" /> <span className="hidden sm:inline">{copy("Liste")}</span>
                        </Button>
                    </div>
                </div>

                {/* League Filter */}
                <div className="flex items-center justify-between gap-4 mt-0 sm:mt-2">
                    <div className="flex-1 overflow-hidden">
                        {currentSport !== "all" && availableLeagues.length > 0 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-1 scrollbar-none animate-in fade-in slide-in-from-left-4 duration-500 mask-linear-fade pr-8">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedLeague(null)}
                                    className={cn(
                                        "h-6 sm:h-7 px-2.5 sm:px-3 text-[10px] sm:text-[11px] rounded-full border transition-all whitespace-nowrap shrink-0",
                                        !selectedLeague
                                            ? "bg-primary/20 text-primary border-primary/30 shadow-[0_0_10px_-2px_rgba(var(--primary),0.3)]"
                                            : "bg-white/5 text-neutral-400 border-white/5 hover:bg-white/10 hover:text-white"
                                    )}
                                >
                                    {copy("Toutes les ligues")}
                                </Button>
                                {availableLeagues.map((league) => (
                                    <Button
                                        key={league}
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSelectedLeague(league)}
                                        className={cn(
                                            "h-6 sm:h-7 px-2.5 sm:px-3 text-[10px] sm:text-[11px] rounded-full border transition-all whitespace-nowrap shrink-0",
                                            selectedLeague === league
                                                ? "bg-primary/20 text-primary border-primary/30 shadow-[0_0_10px_-2px_rgba(var(--primary),0.3)]"
                                                : "bg-white/5 text-neutral-400 border-white/5 hover:bg-white/10 hover:text-white"
                                        )}
                                    >
                                        {league}
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* VS Search Bar - Prominent Glow Design (Ultra Compact Mobile) */}
                {currentSport !== "all" && (
                    <div className="w-full max-w-5xl mx-auto mt-0 mb-0 sm:mt-2 sm:mb-2">
                        <div className="flex flex-row items-center gap-1.5 sm:gap-4 relative group">
                            {/* Team 1 Input */}
                            <div className="relative flex-1 w-full flex items-center bg-[#050505]/95 backdrop-blur-xl border border-white/10 rounded-lg sm:rounded-2xl p-1 sm:p-2 transition-all duration-300 hover:border-white/20 focus-within:border-blue-500/50 focus-within:bg-[#0a0a0a] focus-within:shadow-[0_0_30px_-5px_rgba(37,99,235,0.2)]">
                                <div className="pl-1 sm:pl-3 pr-1 sm:pr-2 hidden sm:block">
                                    <Search className="size-4 sm:size-5 text-neutral-500 group-focus-within:text-blue-400 transition-colors" />
                                </div>
                                <Input
                                    placeholder={copy("Équipe 1")}
                                    className="flex-1 h-7 sm:h-12 text-[11px] sm:text-base font-medium px-2 sm:px-0 bg-transparent border-0 focus-visible:ring-0 shadow-none text-white placeholder:text-neutral-600"
                                    value={searchTeamA}
                                    onChange={(e) => setSearchTeamA(e.target.value)}
                                />
                            </div>

                            {/* Prominent Glowing VS Badge */}
                            <div className="flex items-center justify-center size-5 sm:size-12 rounded-full relative z-10 shrink-0 transform-gpu transition-all duration-500 hover:scale-110 hover:rotate-3 shadow-lg group-hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]">
                                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-600 animate-gradient bg-[length:200%_200%]" />
                                <div className="absolute inset-[1px] sm:inset-[2px] rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                                    <span className="text-[7px] sm:text-sm font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-white/70 italic tracking-widest leading-none">VS</span>
                                </div>
                            </div>

                            {/* Team 2 Input */}
                            <div className="relative flex-1 w-full flex items-center bg-[#050505]/95 backdrop-blur-xl border border-white/10 rounded-lg sm:rounded-2xl p-1 sm:p-2 transition-all duration-300 hover:border-white/20 focus-within:border-purple-500/50 focus-within:bg-[#0a0a0a] focus-within:shadow-[0_0_30px_-5px_rgba(168,85,247,0.2)]">
                                <div className="pl-1 sm:pl-3 pr-1 sm:pr-2 hidden sm:block">
                                    <Search className="size-4 sm:size-5 text-neutral-500 group-focus-within:text-purple-400 transition-colors" />
                                </div>
                                <Input
                                    placeholder={copy("Équipe 2")}
                                    className="flex-1 h-7 sm:h-12 text-[11px] sm:text-base font-medium px-2 sm:px-0 bg-transparent border-0 focus-visible:ring-0 shadow-none text-white placeholder:text-neutral-600"
                                    value={searchTeamB}
                                    onChange={(e) => setSearchTeamB(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="mt-6 space-y-8">
                {loading ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="h-[260px] w-full bg-white/5 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : filtered.length > 0 ? (
                    <>
                        {viewMode === "grid" ? (
                            <MatchGrid matches={visibleMatches} />
                        ) : (
                            <MatchTable items={visibleMatches} />
                        )}

                        {hasMore && (
                            <div className="flex justify-center pt-4">
                                <Button
                                    variant="outline"
                                    size="lg"
                                    className="bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white w-full sm:w-auto min-w-[200px] gap-2 h-12"
                                    onClick={() => setVisibleCount(prev => prev + 6)}
                                >
                                    {copy("Voir plus de matchs")} ({filtered.length - visibleCount}) <ChevronDown className="size-4" />
                                </Button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                        <Swords className="size-10 mb-4 opacity-20" />
                        <p className="font-medium text-lg">{copy("Aucun match trouvé")}</p>
                        <p className="text-sm opacity-60">{copy("Essayez de modifier vos critères de recherche.")}</p>
                        {(searchTeamA || searchTeamB) && (
                            <Button
                                variant="link"
                                onClick={() => { setSearchTeamA(""); setSearchTeamB(""); }}
                                className="mt-2 text-primary"
                            >
                                {copy("Effacer la recherche")}
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function MatchGrid({ matches: items }: { matches: Match[] }) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 stagger-children">
            {items.map((match) => (
                <div key={match.id} className="h-[260px]">
                    <MatchCard match={match} />
                </div>
            ))}
        </div>
    );
}
