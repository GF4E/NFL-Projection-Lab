export type WeekOneMatchup = {
  id: string;
  day: "Wednesday" | "Thursday" | "Sunday" | "Monday";
  date: string;
  timePt: string;
  away: string;
  awayName: string;
  home: string;
  homeName: string;
  venue: string;
  network: string;
  researchFocus: string;
  quantQuestion: string;
  footballQuestion: string;
};

export const officialScheduleSource = "https://www.nfl.com/news/2026-nfl-schedule-release-complete-slate-of-week-1-games";

export const weekOneKickoffs: Record<string, string> = {
  "ne-sea": "2026-09-10T00:20:00.000Z",
  "sf-lar": "2026-09-11T00:35:00.000Z",
  "chi-car": "2026-09-13T17:00:00.000Z",
  "tb-cin": "2026-09-13T17:00:00.000Z",
  "no-det": "2026-09-13T17:00:00.000Z",
  "buf-hou": "2026-09-13T17:00:00.000Z",
  "bal-ind": "2026-09-13T17:00:00.000Z",
  "cle-jax": "2026-09-13T17:00:00.000Z",
  "atl-pit": "2026-09-13T17:00:00.000Z",
  "nyj-ten": "2026-09-13T17:00:00.000Z",
  "ari-lac": "2026-09-13T20:25:00.000Z",
  "mia-lv": "2026-09-13T20:25:00.000Z",
  "gb-min": "2026-09-13T20:25:00.000Z",
  "was-phi": "2026-09-13T20:25:00.000Z",
  "dal-nyg": "2026-09-14T00:20:00.000Z",
  "den-kc": "2026-09-15T00:15:00.000Z"
};

export const weekOneMatchups: WeekOneMatchup[] = [
  { id: "ne-sea", day: "Wednesday", date: "SEP 9", timePt: "5:20 PM", away: "NE", awayName: "New England Patriots", home: "SEA", homeName: "Seattle Seahawks", venue: "Lumen Field", network: "NBC", researchFocus: "Super Bowl rematch with meaningful Seattle backfield and secondary turnover.", quantQuestion: "How much of Seattle's 2025 efficiency survives its personnel changes?", footballQuestion: "Does New England's defensive continuity travel against Seattle's reworked run game?" },
  { id: "sf-lar", day: "Thursday", date: "SEP 10", timePt: "5:35 PM", away: "SF", awayName: "San Francisco 49ers", home: "LAR", homeName: "Los Angeles Rams", venue: "Melbourne Cricket Ground", network: "Netflix", researchFocus: "The NFL's first Australia game adds unusual travel and preparation uncertainty to a familiar rivalry.", quantQuestion: "How should international travel widen the forecast interval rather than force a direction?", footballQuestion: "Which returning defenders and new Rams personnel materially change the Shanahan–McVay matchup?" },
  { id: "chi-car", day: "Sunday", date: "SEP 13", timePt: "10:00 AM", away: "CHI", awayName: "Chicago Bears", home: "CAR", homeName: "Carolina Panthers", venue: "Bank of America Stadium", network: "FOX", researchFocus: "Two young quarterbacks meet after both teams won their divisions in 2025.", quantQuestion: "Did either offense improve in stable early-down efficiency, not just record?", footballQuestion: "Can Carolina's new pass-rush pieces change Caleb Williams' time-to-throw profile?" },
  { id: "tb-cin", day: "Sunday", date: "SEP 13", timePt: "10:00 AM", away: "TB", awayName: "Tampa Bay Buccaneers", home: "CIN", homeName: "Cincinnati Bengals", venue: "Paycor Stadium", network: "FOX", researchFocus: "Both teams are resetting after injury-heavy 2025 seasons and major defensive personnel changes.", quantQuestion: "Which injury-adjusted efficiency baseline is appropriate for both offenses?", footballQuestion: "How do Cincinnati's interior additions and Tampa Bay's changed receiver room alter the matchup?" },
  { id: "no-det", day: "Sunday", date: "SEP 13", timePt: "10:00 AM", away: "NO", awayName: "New Orleans Saints", home: "DET", homeName: "Detroit Lions", venue: "Ford Field", network: "FOX", researchFocus: "Detroit debuts a new offensive coordinator; New Orleans arrives with a reshaped backfield and receiving corps.", quantQuestion: "Does Detroit's scoring projection hold after coordinator and backfield changes?", footballQuestion: "Can New Orleans sustain Tyler Shough's late-2025 form against Detroit's defense?" },
  { id: "buf-hou", day: "Sunday", date: "SEP 13", timePt: "10:00 AM", away: "BUF", awayName: "Buffalo Bills", home: "HOU", homeName: "Houston Texans", venue: "NRG Stadium", network: "CBS", researchFocus: "Buffalo's celebrated offense meets Houston's pass rush in Joe Brady's first game as head coach.", quantQuestion: "Does Buffalo retain an early-down EPA edge after opponent and roster adjustment?", footballQuestion: "Can Buffalo's protection rules handle Will Anderson Jr. and Danielle Hunter?" },
  { id: "bal-ind", day: "Sunday", date: "SEP 13", timePt: "10:00 AM", away: "BAL", awayName: "Baltimore Ravens", home: "IND", homeName: "Indianapolis Colts", venue: "Lucas Oil Stadium", network: "CBS", researchFocus: "Baltimore changes coaches and defensive personnel while Indianapolis monitors quarterback health.", quantQuestion: "How much variance should uncertain quarterback availability add to the price?", footballQuestion: "Will Baltimore's reworked front control Jonathan Taylor without overcommitting?" },
  { id: "cle-jax", day: "Sunday", date: "SEP 13", timePt: "10:00 AM", away: "CLE", awayName: "Cleveland Browns", home: "JAX", homeName: "Jacksonville Jaguars", venue: "EverBank Stadium", network: "CBS", researchFocus: "Jacksonville enters Year 2 under Liam Coen while Cleveland has unresolved quarterback competition.", quantQuestion: "How should the model distribute Cleveland's snaps across possible starting quarterbacks?", footballQuestion: "Can Jacksonville repeat 2025 offensive growth against Cleveland's new structure?" },
  { id: "atl-pit", day: "Sunday", date: "SEP 13", timePt: "10:00 AM", away: "ATL", awayName: "Atlanta Falcons", home: "PIT", homeName: "Pittsburgh Steelers", venue: "Acrisure Stadium", network: "FOX", researchFocus: "Both clubs enter with new head coaches and unresolved quarterback questions.", quantQuestion: "Is any preseason line tradable before starting quarterbacks are confirmed?", footballQuestion: "Which new scheme can create a coherent Week 1 plan with limited continuity?" },
  { id: "nyj-ten", day: "Sunday", date: "SEP 13", timePt: "10:00 AM", away: "NYJ", awayName: "New York Jets", home: "TEN", homeName: "Tennessee Titans", venue: "Nissan Stadium", network: "CBS", researchFocus: "Robert Saleh faces his former team; both rosters introduce multiple high-profile young players.", quantQuestion: "Are either team's 2025 results more extreme than its down-to-down efficiency?", footballQuestion: "How quickly can the new coaches and rookie-heavy units communicate cleanly?" },
  { id: "ari-lac", day: "Sunday", date: "SEP 13", timePt: "1:25 PM", away: "ARI", awayName: "Arizona Cardinals", home: "LAC", homeName: "Los Angeles Chargers", venue: "SoFi Stadium", network: "CBS", researchFocus: "Arizona debuts a new head coach and backfield centerpiece; the Chargers unveil Mike McDaniel's offense.", quantQuestion: "How much should new-scheme uncertainty widen the total projection?", footballQuestion: "Can Arizona's front keep Jacoby Brissett clean against a healthy Chargers line and rush?" },
  { id: "mia-lv", day: "Sunday", date: "SEP 13", timePt: "1:25 PM", away: "MIA", awayName: "Miami Dolphins", home: "LV", homeName: "Las Vegas Raiders", venue: "Allegiant Stadium", network: "FOX", researchFocus: "Two extensively reconstructed teams could start new quarterbacks and rookie head coaches.", quantQuestion: "Does the market overstate certainty around unknown quarterback and scheme baselines?", footballQuestion: "Which offense is more likely to have a functional identity in Week 1?" },
  { id: "gb-min", day: "Sunday", date: "SEP 13", timePt: "1:25 PM", away: "GB", awayName: "Green Bay Packers", home: "MIN", homeName: "Minnesota Vikings", venue: "U.S. Bank Stadium", network: "CBS", researchFocus: "Green Bay carries injury questions into a rivalry game while Minnesota has quarterback competition.", quantQuestion: "What is the price of quarterback uncertainty and Green Bay's late-2025 regression?", footballQuestion: "Which quarterback can execute Minnesota's offense against the Packers' front?" },
  { id: "was-phi", day: "Sunday", date: "SEP 13", timePt: "1:25 PM", away: "WAS", awayName: "Washington Commanders", home: "PHI", homeName: "Philadelphia Eagles", venue: "Lincoln Financial Field", network: "FOX", researchFocus: "Jayden Daniels returns as both NFC East rivals reshape their receiving and defensive personnel.", quantQuestion: "How much should Daniels' absence distort Washington's 2025 team ratings?", footballQuestion: "Will either rebuilt receiver room be stable enough to attack downfield?" },
  { id: "dal-nyg", day: "Sunday", date: "SEP 13", timePt: "5:20 PM", away: "DAL", awayName: "Dallas Cowboys", home: "NYG", homeName: "New York Giants", venue: "MetLife Stadium", network: "NBC", researchFocus: "Dallas' explosive offense meets New York's pass rush as both defenses change coordinators and personnel.", quantQuestion: "Does the projected pace support the total once both new defensive schemes are accounted for?", footballQuestion: "Can New York's front win quickly enough to protect its secondary?" },
  { id: "den-kc", day: "Monday", date: "SEP 14", timePt: "5:15 PM", away: "DEN", awayName: "Denver Broncos", home: "KC", homeName: "Kansas City Chiefs", venue: "Arrowhead Stadium", network: "ESPN / ABC", researchFocus: "Quarterback health is the defining variable for a standalone AFC West opener.", quantQuestion: "What do scenario-weighted prices look like for each quarterback availability state?", footballQuestion: "If both quarterbacks play, which mobility or protection limits remain materially visible?" }
];

export const pickReasons = [
  { value: "model-price", label: "Model disagrees with market price", lane: "Quant", description: "Our fair probability or projected margin differs enough from the no-vig market." },
  { value: "key-number", label: "Better number / key-number value", lane: "Quant", description: "The offered point or price is meaningfully better after translating the contract." },
  { value: "efficiency", label: "Opponent-adjusted efficiency matchup", lane: "Quant", description: "Stable down-to-down measures such as EPA or success rate create the case." },
  { value: "regression", label: "Turnover or scoring regression", lane: "Quant", description: "A noisy extreme is likely to move back toward a more stable baseline." },
  { value: "pace-total", label: "Pace / scoring environment", lane: "Quant", description: "Expected play volume, pass rate or explosiveness creates a totals angle." },
  { value: "personnel", label: "Personnel or injury advantage", lane: "Football", description: "Availability, role, depth or a returning player changes the matchup." },
  { value: "scheme", label: "Coaching or scheme matchup", lane: "Football", description: "The structure of one offense or defense attacks a specific opponent weakness." },
  { value: "chemistry", label: "Role clarity / team chemistry", lane: "Football", description: "Continuity, communication or changed roles make the team more or less trustworthy." },
  { value: "schedule", label: "Rest, travel or schedule spot", lane: "Situational", description: "Rest differential, international travel or a compressed schedule affects preparation." },
  { value: "weather", label: "Weather or venue", lane: "Situational", description: "Kickoff-hour wind, precipitation, surface or roof status changes the distribution." },
  { value: "market-move", label: "Market move / likely CLV", lane: "Market", description: "The current quote is expected to move and preserving the number is the edge." },
  { value: "other", label: "Other / still researching", lane: "Open", description: "The thesis is not standardized yet; add a concise note before the pick is final." }
] as const;
