import React, { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";
import Dropdown from "./components/dropdown";
import TextInput from "./components/TextInput";
import GridDisplay from "./components/GridDisplays";
import { fetchTeamContracts, findContract } from "./utils/contractSheet";
import { loadPlayers } from "./utils/playerCache";
import CapCalculator from "./components/CapCalculator";
import HallOfChampions from "./components/HallOfChampions";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Persists just enough state (who's logged in, which league/year/view they
// were on) so a page refresh picks back up where the user left off instead
// of dropping them back at the username screen. Everything else (rosters,
// trades, matchups, etc.) is re-fetched from that restored state via the
// app's existing effects — this only needs to remember the "address," not
// the data itself.
const SESSION_KEY = "ifl_session_v1";

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSession(partial) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(partial));
  } catch {
    // Best-effort — a failed write here just means the next reload starts
    // fresh instead of restoring, never a broken app.
  }
}

const savedSession = loadSession();

const formatDate = (ms) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const getKeyByValue = (obj, val) => Object.keys(obj).find((k) => obj[k] === val);

// A fixed palette so every team gets its own consistent color wherever it
// shows up in a trade — same team, same color, every time, rather than an
// alternating scheme that only encoded row position. Kept out of
// floodlight-gold territory so it doesn't compete with that accent's own
// meaning (selection/highlight) elsewhere in the UI.
const TEAM_COLOR_PALETTE = [
  "#E8A33D", // amber
  "#5FB4D9", // sky blue
  "#E0687A", // rose
  "#7FC77F", // grass green
  "#B98CDE", // lavender
  "#E8896B", // terracotta
  "#6FCDC0", // teal
  "#D9C15B", // mustard
  "#8FA6E0", // periwinkle
  "#D98FC4", // magenta
];

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Deterministic: the same roster/team id always hashes to the same color.
function getTeamColor(id) {
  const str = String(id ?? "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return TEAM_COLOR_PALETTE[Math.abs(hash) % TEAM_COLOR_PALETTE.length];
}

// The cap/contract system (Cap Calculator, contract columns on Rosters,
// dead-cap offsets) is a homebrew IFL rule set, not something Sleeper
// tracks — it only applies to this specific league, never to any other
// league a visitor might look up on this same site.
const IFL_LEAGUE_NAME = "The International Football League";

/**
 * Reconstructs current draft pick ownership by replaying Sleeper's traded_picks log.
 * Returns picks owned by rosterId, or all picks if rosterId is null.
 */
async function getDynastyPicks(leagueId, rosterId, years, totalTeams, rounds = 4) {
  const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`);
  if (!res.ok) throw new Error(`traded_picks fetch failed: ${res.status}`);
  const tradedPicks = await res.json();

  const picks = [];
  for (const year of years) {
    for (let team = 1; team <= totalTeams; team++) {
      for (let round = 1; round <= rounds; round++) {
        const lastTrade = tradedPicks
          .filter((p) => p.season === String(year) && p.round === round && p.roster_id === team)
          .at(-1);
        const currentOwner = lastTrade ? lastTrade.owner_id : team;
        if (rosterId == null || currentOwner === Number(rosterId)) {
          picks.push({ season: year, round, originalTeam: team, currentOwner, wasTraded: !!lastTrade });
        }
      }
    }
  }
  return picks;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const Database = require("./data.json");

  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState({});
  const [playersLoading, setPlayersLoading] = useState(true);
  const [trades, setTrades] = useState([]);
  const [freeAgents, setFreeAgents] = useState([]);
  const [rosters, setRosters] = useState([]);
  const [teams, setTeams] = useState({});
  const [teamsKey, setKey] = useState([]);
  const [dropdownTeamOptions, setDropdownTeams] = useState([]);
  const [dynastyPicks, setDynastyPicks] = useState([]);
  const [matchups, setMatchups] = useState([]);
  const [contractsByTeam, setContractsByTeam] = useState({});
  const [contractsLoading, setContractsLoading] = useState(false);
  const [playerQuery, setPlayerQuery] = useState("");

  // Fetch the Sleeper player database once (cached in localStorage — see
  // src/utils/playerCache.js) instead of bundling ~19MB into the app.
  useEffect(() => {
    let cancelled = false;
    loadPlayers()
      .then((data) => {
        if (!cancelled) setPlayers(data);
      })
      .catch((err) => console.error("Failed to load player database:", err))
      .finally(() => {
        if (!cancelled) setPlayersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [user, setUser] = useState(savedSession.user || "");
  const [idUser, setUserId] = useState(savedSession.idUser || "");
  const [leagueId, setLeagueId] = useState(savedSession.leagueId || "");
  const [leagueName, setLeagueName] = useState(savedSession.leagueName || "");
  const [leagueType, setLeagueType] = useState(savedSession.leagueType || "");
  const [positions, setLeaguePositions] = useState(savedSession.positions || []);
  const [dropdownLeagueOptions, setLeagueDropdown] = useState([]);

  const [year, setYear] = useState(savedSession.year || "2026");
  const [availableYears, setAvailableYears] = useState(savedSession.availableYears || ["2026"]);
  const [newTeam, setNewTeam] = useState(savedSession.newTeam || "All Teams");
  const [transaction, setTransactions] = useState(savedSession.transaction || "Trades");
  const [tradeCount, setTradeCount] = useState(1);

  const [activeWeek, setActiveWeek] = useState(0);
  const [weekChecker, setWeekChecker] = useState(false);
  const [dropdownWeeks, setDropdownWeeks] = useState([]);
  const weeks = 17;

  // ── Session persistence ─────────────────────────────────────────────────────────
  // Keep localStorage in sync so a page refresh restores this exact spot —
  // who's logged in, which league/year/view — instead of the login screen.
  useEffect(() => {
    saveSession({
      user, idUser, leagueId, leagueName, leagueType, positions,
      year, availableYears, newTeam, transaction,
    });
  }, [user, idUser, leagueId, leagueName, leagueType, positions, year, availableYears, newTeam, transaction]);

  // ── Derived options ───────────────────────────────────────────────────────────

  const dropdownYearOptions = availableYears.map((y) => ({ label: y }));
  const dropdownWeekOptions = dropdownWeeks.map((w) => ({ label: `Week ${w}`, value: w }));
  // availableYears is sorted descending, so index 0 is always the current/most recent season.
  const isCurrentSeason = year === availableYears[0];

  // "Who has this player" — searches every roster currently loaded for this
  // league (active roster, taxi, and IR), not just the current team filter.
  const playerSearchResults = useMemo(() => {
    const q = playerQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return Object.entries(players)
      .filter(([, p]) => p?.full_name && p.full_name.toLowerCase().includes(q))
      .slice(0, 25)
      .map(([pid, p]) => {
        const owner = rosters.find(
          (r) =>
            (r.players || []).includes(pid) ||
            (r.taxi || []).includes(pid) ||
            (r.reserve || []).includes(pid)
        );
        let status = "Not currently rostered in this league";
        if (owner) {
          const onTaxi = (owner.taxi || []).includes(pid);
          const onIR = (owner.reserve || []).includes(pid);
          const teamName = teams[owner.roster_id] || "Unknown Team";
          status = teamName + (onTaxi ? " (Taxi)" : onIR ? " (IR)" : "");
        }
        return { pid, name: p.full_name, position: p.position, status, rosterId: owner?.roster_id };
      });
  }, [playerQuery, players, rosters, teams]);

  // Assign colors by each team's stable position among this league's
  // roster ids, not a hash — guarantees no two teams collide as long as
  // there are no more teams than colors (10 of each, matching this
  // league's size), while still being deterministic across renders.
  const teamColorMap = useMemo(() => {
    const ids = Object.keys(teams).sort((a, b) => Number(a) - Number(b));
    const map = {};
    ids.forEach((id, i) => {
      map[id] = TEAM_COLOR_PALETTE[i % TEAM_COLOR_PALETTE.length];
    });
    return map;
  }, [teams]);

  const dropdownTransactionOptions = [
    { label: "Standings" },
    { label: "Trades" },
    { label: "Free Agent Transactions" },
    { label: "Rosters and Records" },
    { label: "Matchups" },
    { label: "Player Search" },
    { label: "Hall of Champions" },
    ...(leagueName === IFL_LEAGUE_NAME && isCurrentSeason ? [{ label: "Cap Calculator" }] : []),
    ...(leagueType === "Dynasty" ? [{ label: "Draft Picks" }] : []),
  ];

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const clearButton = () => {
    if (!user) return;
    setUser(""); 
    setUserId(""); 
    setLeagueId(""); 
    setLeagueName("");
    setLeagueType("");
    setLeaguePositions([]);
    setLeagueDropdown([]); 
    setDropdownTeams([]); 
    setTeams({});
    setTrades([]); 
    setFreeAgents([]); 
    setKey([]); 
    setRosters([]);
    setMatchups([]); 
    setDynastyPicks([]); 
    setActiveWeek(0); 
    setWeekChecker(false);
    setYear("2026");
    setAvailableYears(["2026"]);
    setNewTeam("All Teams");
    setTransactions("Trades");
    localStorage.removeItem(SESSION_KEY);
    alert("User data cleared.");
  };

  const handleDropdownLeague = (opt) => {
    setLeagueId(opt.id);
    setLeagueName(opt.label);
    setLeagueType(opt.dynasty);
    setLeaguePositions(opt.roster);
    fetchAvailableYears(opt.label);
  };

  // ── Data fetching ─────────────────────────────────────────────────────────────

  const handleInputSubmit = async (value) => {
    await new Promise((r) => setTimeout(r, 500));
    if (!value) { alert("Please enter a username."); return; }
    try {
      const res = await fetch(`https://api.sleeper.app/v1/user/${value}`);
      if (!res.ok) throw new Error("User not found");
      const json = await res.json();
      if (!json?.user_id) { alert(`No user found matching "${value}".`); return; }

      setLeagueId(""); setLeagueName(""); setLeagueDropdown([]); setDropdownTeams([]);
      setTeams({}); setNewTeam("All Teams"); setTrades([]); setTransactions("Trades");
      setKey([]); setUser(value); setUserId(json.user_id);
      setAvailableYears(["2026"]); setYear("2026"); setWeekChecker(false); setMatchups([]);
    } catch {
      alert(`Nothing matches with the username "${value}".`);
    }
  };

  const fetchAvailableYears = async (selectedLeagueName) => {
    if (!idUser) return;
    const yearsToCheck = ["2026", "2025", "2024", "2023", "2022", "2021"];
    try {
      const results = await Promise.all(
        yearsToCheck.map((y) =>
          fetch(`https://api.sleeper.app/v1/user/${idUser}/leagues/nfl/${y}`)
            .then((r) => (r.ok ? r.json() : []))
            .then((leagues) => (leagues.some((l) => l.name === selectedLeagueName) ? y : null))
        )
      );
      setAvailableYears(results.filter(Boolean).sort((a, b) => b - a));
    } catch (err) {
      console.error("Failed to fetch available years:", err);
    }
  };

  // Fetch leagues when year or user changes
  useEffect(() => {
    if (!idUser) return;
    const fetchLeagues = async () => {
      try {
        const res = await fetch(`https://api.sleeper.app/v1/user/${idUser}/leagues/nfl/${year}`);
        const leagues = await res.json();
        if (!leagues?.length) { alert(`User "${user}" has no leagues.`); return; }

        const temp = leagues.map((l) => ({
          label: l.name,
          id: l.league_id,
          dynasty: l.settings.taxi_slots > 0 ? "Dynasty" : "Redraft",
          roster: l.roster_positions.filter((p) => p !== "BN"),
        }));

        const match = temp.find((l) => l.label === leagueName);
        if (match) {
          setLeagueId(match.id);
        } else {
          setLeagueId(""); setLeagueDropdown(""); setLeagueType(""); setTrades([]); setKey([]);
        }
        setLeagueDropdown(temp);
      } catch (err) {
        console.error(err);
      }
    };
    fetchLeagues();
  }, [year, idUser]);

  // Reset team state when the underlying leagueId changes — this fires for
  // both an actual league switch AND a year switch within the same league
  // (each season is its own leagueId). Only reset the active VIEW on a true
  // league switch; a year switch should keep whatever view the user was on
  // and just let its data refresh for the new year.
  const prevLeagueNameRef = useRef(null);
  useEffect(() => {
    if (!leagueId) return;
    setKey([]); setTeams({}); setDropdownTeams([]); setTrades([]);
    setFreeAgents([]); setRosters([]); setNewTeam(""); setDynastyPicks([]);
    setContractsByTeam({});
    const isActualLeagueSwitch =
      prevLeagueNameRef.current !== null && prevLeagueNameRef.current !== leagueName;
    if (isActualLeagueSwitch) {
      setTransactions("Trades");
    }
    prevLeagueNameRef.current = leagueName;
  }, [leagueId]);

  // Belt-and-suspenders: Cap Calculator is only ever valid for the current
  // season. Rather than rely solely on the league-change reset above (which
  // depends on year-switching also producing a new leagueId), check this
  // directly so an out-of-date view can never linger.
  useEffect(() => {
    if (!isCurrentSeason && transaction === "Cap Calculator") {
      setTransactions("Trades");
    }
  }, [isCurrentSeason, transaction]);

  // Fetch matchups
  useEffect(() => {
    if (!leagueId) return;
    const currentLeague = leagueId;
    const fetchMatchups = async () => {
      try {
        const stateRes = await fetch("https://api.sleeper.app/v1/state/nfl");
        const nflState = await stateRes.json();

        let currentWeek;
        if (year === "2026") {
          const maxWeek = nflState.week;
          setDropdownWeeks(Array.from({ length: maxWeek }, (_, i) => i + 1));
          currentWeek = activeWeek > maxWeek ? maxWeek : (activeWeek && weekChecker ? activeWeek : maxWeek);
          setActiveWeek(currentWeek);
        } else {
          setDropdownWeeks(Array.from({ length: 17 }, (_, i) => i + 1));
          currentWeek = activeWeek && weekChecker ? activeWeek : 17;
          setActiveWeek(currentWeek);
        }

        const res = await fetch(`https://api.sleeper.app/v1/league/${currentLeague}/matchups/${currentWeek}`);
        const json = await res.json();

        const paired = [];
        for (let i = 0; i < json.length; i++) {
          const mid = json[i].matchup_id;
          if (!mid) continue;
          for (let x = i + 1; x < json.length; x++) {
            if (json[x].matchup_id === mid) {
              paired.push({
                matchupId: mid,
                team1: { teamId: json[i].roster_id, starters: json[i].starters, points: json[i].points, players_points: json[i].players_points, players: json[i].players },
                team2: { teamId: json[x].roster_id, starters: json[x].starters, points: json[x].points, players_points: json[x].players_points, players: json[x].players },
              });
            }
          }
        }

        if (!newTeam || newTeam === "All Teams") {
          setMatchups(paired);
        } else {
          const key = getKeyByValue(teams, newTeam);
          setMatchups(paired.filter((m) => m.team1.teamId.toString() === key || m.team2.teamId.toString() === key));
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchMatchups();
  }, [activeWeek, leagueId, transaction, newTeam]);

  // Fetch transactions, rosters, and users
  useEffect(() => {
    if (!leagueId) return;
    const currentLeague = leagueId;
    setLoading(true);

    const fetchTransactions = async () => {
      try {
        // All weeks fetched in parallel
        const weekResults = await Promise.all(
          Array.from({ length: weeks }, (_, i) =>
            fetch(`https://api.sleeper.app/v1/league/${currentLeague}/transactions/${i + 1}`)
              .then((r) => r.json())
              .then((json) => json.filter((t) => t.status === "complete"))
          )
        );
        if (currentLeague !== leagueId) return;

        let totalFreeAgents = weekResults.map((week) =>
          week.filter((t) => t.type === "free_agent" || t.type === "waiver").reverse()
        );
        let totalTrades = weekResults.map((week) => week.filter((t) => t.type === "trade").reverse());
        setTradeCount(totalTrades.reduce((sum, w) => sum + w.length, 0));

        // Users + Rosters in parallel
        const [usersRes, rostersRes] = await Promise.all([
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`).then((r) => r.json()),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`).then((r) => r.json()),
        ]);

        const userList = usersRes.map((u) => ({
          team: u.metadata.team_name,
          owner_id: u.user_id,
          username: u.display_name,
        }));
        let roster = rostersRes.map((r) => ({
          roster_id: r.roster_id,
          owner_id: r.owner_id,
          co_owners: r.co_owners || [],
          players: r.players,
          reserve: r.reserve,
          taxi: r.taxi,
          wins: r.settings.wins,
          losses: r.settings.losses,
          ties: r.settings.ties || 0,
          pointsFor: (r.settings.fpts || 0) + (r.settings.fpts_decimal || 0) / 100,
          pointsAgainst: (r.settings.fpts_against || 0) + (r.settings.fpts_against_decimal || 0) / 100,
        }));

        const teamsMap = {};
        const dropdownTeams = [{ label: "All Teams" }];

        // First pass: each roster's team name comes from its primary owner only.
        const rosterTeamName = {};
        for (const u of userList) {
          const match = roster.find((r) => r.owner_id === u.owner_id);
          if (match) {
            const teamName = u.team || `Team ${u.username}`;
            rosterTeamName[match.roster_id] = teamName;
            teamsMap[match.roster_id] = teamName;
            dropdownTeams.push({ label: teamName });
            match.team_name = teamName;
          }
        }

        // Second pass: build the key. A co-owner (listed in a roster's
        // co_owners, not its primary owner_id) is grouped under that same
        // team instead of falling back to a fake standalone "Team
        // {username}" entry — then usernames sharing a team are combined
        // into one row rather than one row per person.
        const usernamesByTeam = new Map();
        for (const u of userList) {
          const owned = roster.find((r) => r.owner_id === u.owner_id);
          const coOwned = owned ? null : roster.find((r) => r.co_owners.includes(u.owner_id));
          const match = owned || coOwned;
          const teamName = match ? rosterTeamName[match.roster_id] : u.team || `Team ${u.username}`;
          if (!usernamesByTeam.has(teamName)) usernamesByTeam.set(teamName, []);
          usernamesByTeam.get(teamName).push(u.username);
        }
        const keyArr = [...usernamesByTeam.entries()].map(([team, usernames]) => ({
          team,
          username: usernames.join(", "),
        }));

        setRosters(roster);
        setTeams(teamsMap);
        setKey(keyArr);
        setDropdownTeams(dropdownTeams);

        // Annotate trades with local notes
        const dbMap = Object.fromEntries(Database.map((d) => [d.transactionId, d.notes]));
        totalTrades = totalTrades.map((group) =>
          group.map((t) => ({ ...t, notes: dbMap[t.transaction_id] ?? t.notes }))
        );

        if (!newTeam || newTeam === "All Teams") {
          setTrades(totalTrades);
          setFreeAgents(totalFreeAgents);
          setRosters(roster);
        } else {
          const key = getKeyByValue(teamsMap, newTeam);
          if (!key) return;
          setTrades(totalTrades.map((g) => g.filter((t) => t.consenter_ids?.includes(Number(key)))));
          setFreeAgents(totalFreeAgents.map((g) => g.filter((t) => t.roster_ids?.includes(Number(key)) || t.consenter_ids?.includes(Number(key)))));
          setRosters([roster[key - 1]]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, [newTeam, leagueId, transaction, activeWeek, year]);

  // Fetch dynasty picks
  useEffect(() => {
    if (!leagueId || leagueType !== "Dynasty" || !rosters.length) return;
    const currentYear = parseInt(year, 10);
    const years = [currentYear, currentYear + 1, currentYear + 2];
    const rosterId = newTeam && newTeam !== "All Teams" ? getKeyByValue(teams, newTeam) : null;

    getDynastyPicks(leagueId, rosterId, years, rosters.length)
      .then(setDynastyPicks)
      .catch((err) => console.error("Failed to fetch dynasty picks:", err));
  }, [leagueId, leagueType, newTeam, rosters, year]);

  // Fetch live cap/contract data from the Google Sheet whenever the
  // Rosters view or Cap Calculator is open. Re-fetches on every visit
  // (subject to the utility's own 5-minute cache), so it always reflects
  // the current state of the sheet without needing a rebuild/deploy.
  useEffect(() => {
    const needsContracts =
      leagueName === IFL_LEAGUE_NAME &&
      isCurrentSeason &&
      (transaction === "Rosters and Records" || transaction === "Cap Calculator");
    if (!needsContracts || !rosters.length) return;
    let cancelled = false;

    const load = async () => {
      setContractsLoading(true);
      const teamNames = [...new Set(rosters.map((r) => r.team_name).filter(Boolean))];
      const entries = await Promise.all(
        teamNames.map(async (name) => {
          try {
            return [name, await fetchTeamContracts(name)];
          } catch (err) {
            console.error(err);
            return [name, null];
          }
        })
      );
      if (!cancelled) setContractsByTeam(Object.fromEntries(entries));
      setContractsLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [transaction, rosters]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>
      <main className="p-4">
        <div className="ifl-hero">
          <p className="ifl-eyebrow">Fantasy Football · Powered by Sleeper</p>
          <h1 className="ifl-wordmark">
            {leagueName ? (
              leagueName
            ) : (
              <>League <span>Command Center</span></>
            )}
          </h1>
          <p className="ifl-tagline">
            {leagueName === IFL_LEAGUE_NAME
              ? "Ten franchises. One salary cap. Every contract, every trade, every season."
              : "Rosters, trades, matchups, and draft history — all in one place."}
          </p>
        </div>

        <div className="ifl-controls">
          <TextInput onSubmitValue={handleInputSubmit} />
          {user.length > 0 && (
            <div style={{ textAlign: "center", marginTop: "0.85rem" }}>
              <button className="clear-button" onClick={clearButton}>Logout &amp; clear data</button>
            </div>
          )}

          {user.length > 0 && (
            <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
              <p className="ifl-welcome">Welcome, <strong>{user}</strong></p>
              {playersLoading && (
                <p className="ifl-loading-note">Loading player database…</p>
              )}
              <div className="ifl-select-row">
                <Dropdown placeholder="Select a League" options={dropdownLeagueOptions} onSelect={handleDropdownLeague} resetTrigger={user} />

                {leagueName && (
                  <>
                    {availableYears.length > 1 && (
                      <Dropdown placeholder="Select a year" options={dropdownYearOptions} onSelect={(o) => setYear(o.label)} value={year} />
                    )}
                    <Dropdown placeholder="Select a team" options={dropdownTeamOptions} onSelect={(o) => setNewTeam(o.label)} resetTrigger={leagueId} />
                    <Dropdown placeholder="Select a view" options={dropdownTransactionOptions} onSelect={(o) => setTransactions(o.label)} resetTrigger={`${user}|${leagueName}`} />
                    {transaction === "Matchups" && (
                      <Dropdown
                        placeholder="Select a week"
                        options={dropdownWeekOptions}
                        onSelect={(o) => { setActiveWeek(o.value); setWeekChecker(true); }}
                        resetTrigger={year}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <p style={{ textAlign: "center" }}>Loading...</p>
        ) : user && leagueId ? (
          <div style={{ textAlign: "center" }}>
            <h3>Starting Positions</h3>
            <GridDisplay items={positions} />

            <div>
              {/* ── Standings ── */}
              {transaction === "Standings" && (
                <div className="my-4">
                  <h3 style={{ textAlign: "center" }}>Standings</h3>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Team</th>
                        <th>W</th>
                        <th>L</th>
                        {rosters.some((r) => r.ties > 0) && <th>T</th>}
                        <th>PF</th>
                        <th>PA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...rosters]
                        .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
                        .map((r, i) => (
                          <tr key={r.roster_id}>
                            <td>{i + 1}</td>
                            <td style={{ fontWeight: 600, color: teamColorMap[r.roster_id] }}>
                              {r.team_name || teams[r.roster_id]}
                            </td>
                            <td>{r.wins}</td>
                            <td>{r.losses}</td>
                            {rosters.some((x) => x.ties > 0) && <td>{r.ties}</td>}
                            <td>{r.pointsFor.toFixed(2)}</td>
                            <td>{r.pointsAgainst.toFixed(2)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  <p className="ifl-note">Sorted by record, then points for.</p>
                </div>
              )}

              {/* ── Player Search ── */}
              {transaction === "Player Search" && (
                <div className="my-4" style={{ maxWidth: 520, margin: "0 auto" }}>
                  <h3 style={{ textAlign: "center" }}>Who Has This Player?</h3>
                  <label className="ifl-input-label" htmlFor="ifl-player-search">
                    Search every roster in this league
                  </label>
                  <input
                    id="ifl-player-search"
                    type="text"
                    className="ifl-text-input"
                    style={{ width: "100%" }}
                    placeholder="e.g. Rashee Rice"
                    value={playerQuery}
                    onChange={(e) => setPlayerQuery(e.target.value)}
                  />
                  {playerQuery.trim().length >= 2 && (
                    <table className="custom-table" style={{ marginTop: "1rem" }}>
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Pos</th>
                          <th>Team</th>
                        </tr>
                      </thead>
                      <tbody>
                        {playerSearchResults.length === 0 ? (
                          <tr>
                            <td colSpan={3}>No matches.</td>
                          </tr>
                        ) : (
                          playerSearchResults.map((r) => (
                            <tr key={r.pid}>
                              <td>{r.name}</td>
                              <td>{r.position}</td>
                              <td style={{ color: r.rosterId ? teamColorMap[r.rosterId] : "var(--chalk-dim)" }}>
                                {r.status}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── Hall of Champions ── */}
              {transaction === "Hall of Champions" && (
                <HallOfChampions idUser={idUser} leagueName={leagueName} year={year} players={players} />
              )}

              {/* ── Trades ── */}
              {transaction === "Trades" && (
                tradeCount > 0
                  ? trades.map((week, weekIdx) =>
                    week.length === 0 ? null : (
                      <div key={weekIdx} className="my-4">
                        <h3 style={{ textAlign: "center" }}>Week {weekIdx + 1} Trades</h3>
                        <table className="custom-table trades-table">
                          <thead>
                            <tr>
                              <th>Date</th><th>Team</th><th>Players</th>
                              {leagueType === "Dynasty" && <th>Draft Picks</th>}
                              {leagueName === IFL_LEAGUE_NAME && year <= "2025" && <th>Notes</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {week.map((trade, tradeIdx) => {
                              const teamIds = Object.values(trade.consenter_ids || {});
                              const playerGroups = teamIds.map(() => []);
                              const draftGroups = teamIds.map(() => []);

                              Object.entries(trade.adds || {}).forEach(([pid, owner]) => {
                                const idx = teamIds.indexOf(owner);
                                if (idx >= 0) playerGroups[idx].push(pid);
                              });
                              (trade.draft_picks || []).forEach((pick) => {
                                const idx = teamIds.indexOf(pick.owner_id);
                                if (idx >= 0) draftGroups[idx].push(pick);
                              });

                              const rows = teamIds.flatMap((teamId, i) => [
                                ...playerGroups[i].map((pid) => ({ teamId, teamIdx: i, player: players[pid]?.full_name ?? pid, pick: null })),
                                ...draftGroups[i].map((pick) => ({ teamId, teamIdx: i, player: null, pick: `${pick.season} Round ${pick.round} via ${teams[pick.roster_id]}` })),
                              ]);

                              return (
                                <React.Fragment key={tradeIdx}>
                                  {rows.map((row, rowIdx) => {
                                    const color = teamColorMap[row.teamId] || getTeamColor(row.teamId);
                                    return (
                                      <tr
                                        key={rowIdx}
                                        style={{
                                          backgroundColor: hexToRgba(color, 0.1),
                                          borderLeft: `4px solid ${color}`,
                                          ...(rowIdx === rows.length - 1
                                            ? { borderBottom: "3px solid var(--floodlight-dim)" }
                                            : {}),
                                        }}
                                      >
                                        {rowIdx === 0 && <td rowSpan={rows.length} className="trade-date-cell">{formatDate(trade.created)}</td>}
                                        <td className="trade-team-cell" style={{ color }}>{teams[row.teamId]}</td>
                                        <td>{row.player}</td>
                                        {leagueType === "Dynasty" && <td>{row.pick}</td>}
                                        {rowIdx === 0 && leagueName === IFL_LEAGUE_NAME && year <= "2025" && (
                                          <td rowSpan={rows.length}>{trade.notes || "No Notes"}</td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  )
                  : <h3 style={{ textAlign: "center" }}>No Trades Yet!</h3>
              )}

              {/* ── Free Agents ── */}
              {transaction === "Free Agent Transactions" &&
                freeAgents.map((week, weekIdx) =>
                  week.length === 0 ? null : (
                    <div key={weekIdx} className="my-4">
                      <h3 style={{ textAlign: "center" }}>Week {weekIdx + 1} Free Agents</h3>
                      <table className="custom-table">
                        <thead><tr><th>Date</th><th>Team</th><th>Added</th><th>Dropped</th></tr></thead>
                        <tbody>
                          {week.map((fa, idx) => {
                            const adds = fa.adds ? Object.keys(fa.adds).map((pid) => players[pid]?.full_name ?? pid) : [];
                            if (fa.settings && "waiver_bid" in fa.settings) adds[0] = `${adds[0]} - $${fa.settings.waiver_bid}`;
                            const drops = fa.drops ? Object.keys(fa.drops).map((pid) => players[pid]?.full_name ?? pid) : [];
                            const teamId = fa.roster_ids?.[0];
                            const rowCount = Math.max(adds.length, drops.length) || 1;
                            return (
                              <React.Fragment key={idx}>
                                {[...Array(rowCount)].map((_, i) => (
                                  <tr key={`${idx}-${i}`}>
                                    {i === 0 && <td rowSpan={rowCount}>{formatDate(fa.created)}</td>}
                                    <td>{teams[teamId]}</td>
                                    <td>{adds[i] ?? ""}</td>
                                    <td>{drops[i] ?? ""}</td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )
              }

              {/* ── Draft Picks ── */}
              {transaction === "Draft Picks" && (() => {
                if (!dynastyPicks.length) return <h3 style={{ textAlign: "center" }}>No dynasty picks data available.</h3>;
                const ownerNames = newTeam && newTeam !== "All Teams"
                  ? [newTeam]
                  : [...new Set(dynastyPicks.map((p) => teams[p.currentOwner] || `Roster ${p.currentOwner}`))].sort();
                return ownerNames.map((ownerName) => {
                  const ownerPicks = dynastyPicks
                    .filter((p) => (teams[p.currentOwner] || `Roster ${p.currentOwner}`) === ownerName)
                    .sort((a, b) => a.season - b.season || a.round - b.round);
                  if (!ownerPicks.length) return null;
                  return (
                    <div key={ownerName} className="my-4">
                      <h3 style={{ textAlign: "center" }}>{ownerName} — Draft Picks</h3>
                      <table className="custom-table">
                        <thead><tr><th>Year</th><th>Round</th><th>Original Team</th><th>Acquired via Trade</th></tr></thead>
                        <tbody>
                          {ownerPicks.map((pick, i) => (
                            <tr key={i}>
                              <td>{pick.season}</td>
                              <td>Round {pick.round}</td>
                              <td>{teams[pick.originalTeam] || `Roster ${pick.originalTeam}`}</td>
                              <td>{pick.wasTraded ? "Yes" : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                });
              })()}

              {/* ── Rosters ── */}
              {transaction === "Rosters and Records" && (
                <>
                  {/* eslint-disable-next-line no-console */}
                  {console.log(
                    `[Rosters] year=${JSON.stringify(year)} availableYears[0]=${JSON.stringify(
                      availableYears[0]
                    )} isCurrentSeason=${isCurrentSeason}`
                  )}
                  {contractsLoading && <p style={{ textAlign: "center" }}>Loading contract data…</p>}
                  {rosters.map((roster, rosterIdx) => {
                    const playerList = roster.players || [];
                    const irList = roster.reserve || [];
                    const taxiList = roster.taxi || [];

                    // Cap/contract data only ever applies to the current season —
                    // past years show a plain Sleeper roster (Player, Pos, IR,
                    // Taxi) with no cost/contract info at all.
                    const teamContracts = isCurrentSeason ? contractsByTeam[roster.team_name] : null;
                    const contractYears = teamContracts?.years || [];

                    // Sleeper has no squad data synced for the IFL — rosters are
                    // managed through the contract sheet / auction rather than
                    // Sleeper's native add/drop flow. When Sleeper comes back
                    // empty (current season only), use the contract sheet itself
                    // as the roster source instead of showing a blank team.
                    const useSheetAsRoster =
                      isCurrentSeason && playerList.length === 0 && !!teamContracts?.players?.length;

                    const rows = useSheetAsRoster
                      ? teamContracts.players.map((cp) => ({
                          name: cp.name,
                          position: cp.position,
                          contractEnd: cp.contractEnd,
                          hitByYear: cp.netCapByYear || {},
                          rawByYear: cp.capByYear || {},
                        }))
                      : playerList.map((pid) => {
                          const p = players[pid];
                          const contract =
                            teamContracts && p
                              ? findContract(teamContracts.players, `${p.first_name} ${p.last_name}`)
                              : null;
                          return {
                            name: p ? `${p.first_name} ${p.last_name}` : "",
                            position: p?.position ?? "",
                            contractEnd: contract?.contractEnd ?? "",
                            hitByYear: contract?.netCapByYear || {},
                            rawByYear: contract?.capByYear || {},
                          };
                        });

                    const maxLen = Math.max(rows.length, irList.length, taxiList.length);

                    // Spent/Remaining come straight from the sheet's own
                    // "Draft Cap Spent:" / "Remaining Budget:" rows — the
                    // sheet already accounts for every source of dead money,
                    // so there's no need to reconstruct it here.
                    const budgetByYear = teamContracts?.budgetByYear || {};

                    return (
                      <div key={rosterIdx} className="my-4">
                        <div className="ifl-nameplate">
                          <span className="ifl-nameplate-name">{roster.team_name}</span>
                          <span className="ifl-scoreboard-chip">{roster.wins}-{roster.losses}</span>
                        </div>
                        {useSheetAsRoster && (
                          <p className="ifl-note">
                            Roster shown from the contract sheet — Sleeper has no synced roster for this team.
                          </p>
                        )}

                        {teamContracts && contractYears.length > 0 && (
                          <table className="custom-table" style={{ margin: "0.5rem auto 1rem" }}>
                            <thead>
                              <tr>
                                <th>Cap</th>
                                {contractYears.map((y) => (
                                  <th key={y}>{y}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td>Spent</td>
                                {contractYears.map((y) => (
                                  <td key={y}>
                                    {budgetByYear[y]?.spent != null ? `$${budgetByYear[y].spent}` : "—"}
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td>Remaining</td>
                                {contractYears.map((y) => (
                                  <td key={y}>
                                    <strong>
                                      {budgetByYear[y]?.remaining != null ? `$${budgetByYear[y].remaining}` : "—"}
                                    </strong>
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        )}

                        <table className="custom-table">
                          <thead>
                            <tr>
                              <th>Player</th>
                              <th>Pos</th>
                              {teamContracts && <th>Contract Ends</th>}
                              {teamContracts &&
                                contractYears.map((y) => <th key={y}>{y}</th>)}
                              {!useSheetAsRoster && <th>IR</th>}
                              {!useSheetAsRoster && leagueType === "Dynasty" && <th>Taxi</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {[...Array(maxLen)].map((_, i) => {
                              const row = rows[i];
                              return (
                                <tr key={i}>
                                  <td>{row?.name ?? ""}</td>
                                  <td>{row?.position ?? ""}</td>
                                  {teamContracts && <td>{row?.contractEnd ?? ""}</td>}
                                  {teamContracts &&
                                    contractYears.map((y) => {
                                      const hit = row?.hitByYear?.[y];
                                      const raw = row?.rawByYear?.[y];
                                      const isOffset = hit != null && raw != null && hit !== raw;
                                      return (
                                        <td
                                          key={y}
                                          title={isOffset ? `$${raw} drafted, offset to $${hit}` : undefined}
                                        >
                                          {hit != null ? `$${hit}${isOffset ? " *" : ""}` : ""}
                                        </td>
                                      );
                                    })}
                                  {!useSheetAsRoster && <td>{players[irList[i]]?.full_name ?? ""}</td>}
                                  {!useSheetAsRoster && leagueType === "Dynasty" && (
                                    <td>{players[taxiList[i]]?.full_name ?? ""}</td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {teamContracts && (
                          <p className="ifl-note">
                            * cap hit adjusted by a dead-cap / trade offset — hover for details
                          </p>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* ── Matchups ── */}
              {transaction === "Matchups" &&
                matchups.map((matchup, matchupIdx) => {
                  const team1Name = teams[matchup.team1.teamId] || "Unknown Team 1";
                  const team2Name = teams[matchup.team2.teamId] || "Unknown Team 2";
                  const t1pts = matchup.team1.points || 0;
                  const t2pts = matchup.team2.points || 0;
                  const t1starters = new Set(matchup.team1.starters || []);
                  const t2starters = new Set(matchup.team2.starters || []);
                  const sortByStarters = (players, starters) => [
                    ...players.filter((p) => starters.has(p)),
                    ...players.filter((p) => !starters.has(p)),
                  ];
                  const sorted1 = sortByStarters(matchup.team1.players || [], t1starters);
                  const sorted2 = sortByStarters(matchup.team2.players || [], t2starters);
                  const maxRows = Math.max(sorted1.length, sorted2.length);
                  const t1Won = t1pts > t2pts, t2Won = t2pts > t1pts;

                  return (
                    <div key={matchupIdx} className="my-4">
                      <h3 style={{ textAlign: "center", marginBottom: "10px" }}>
                        Week {activeWeek} —{" "}
                        <span style={{ color: t1Won ? "var(--floodlight)" : t2Won ? "var(--flag)" : "var(--chalk-dim)" }}>
                          {t1Won ? `${team1Name} Wins` : t2Won ? `${team2Name} Wins` : "Tie"}
                        </span>
                      </h3>
                      <table className="custom-table" style={{ width: "95%", margin: "auto" }}>
                        <thead>
                          <tr><th colSpan="2">{team1Name}</th><th colSpan="2">{team2Name}</th></tr>
                          <tr><th>Player</th><th>Points</th><th>Player</th><th>Points</th></tr>
                        </thead>
                        <tbody>
                          {[...Array(maxRows)].map((_, i) => {
                            const p1 = sorted1[i], p2 = sorted2[i];
                            const p1d = players[p1], p2d = players[p2];
                            return (
                              <tr key={i}>
                                <td style={{ fontWeight: t1starters.has(p1) ? "bold" : "normal", backgroundColor: t1starters.has(p1) ? "rgba(245, 184, 48, 0.1)" : "" }}>
                                  {p1d && <>{p1d.first_name} {p1d.last_name} <span style={{ color: "var(--chalk-dim)" }}>{p1d.position}</span></>}
                                </td>
                                <td>{p1 && matchup.team1.players_points?.[p1]?.toFixed(2)}</td>
                                <td style={{ fontWeight: t2starters.has(p2) ? "bold" : "normal", backgroundColor: t2starters.has(p2) ? "rgba(245, 184, 48, 0.1)" : "" }}>
                                  {p2d && <>{p2d.first_name} {p2d.last_name} <span style={{ color: "var(--chalk-dim)" }}>{p2d.position}</span></>}
                                </td>
                                <td>{p2 && matchup.team2.players_points?.[p2]?.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                          <tr style={{ fontWeight: "bold", borderTop: "2px solid var(--floodlight-dim)", backgroundColor: "var(--turf-2)" }}>
                            <td>Total</td><td>{t1pts.toFixed(2)}</td>
                            <td>Total</td><td>{t2pts.toFixed(2)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })
              }

              {/* ── Cap Calculator ── */}
              {transaction === "Cap Calculator" && (
                <CapCalculator contractsByTeam={contractsByTeam} currentYear={year} />
              )}
            </div>

            {/* ── Team / Username key ── */}
            <br /><br />
            {teamsKey.length > 0 && (
              <table className="custom-table" style={{ width: "30%", margin: "0 auto" }}>
                <thead><tr><th>Team</th><th>Username</th></tr></thead>
                <tbody>
                  {teamsKey.map((team, i) => (
                    <tr key={i}><td>{team.team}</td><td>{team.username}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <br /><br />
          </div>
        ) : null}
      </main>
    </div>
  );
}