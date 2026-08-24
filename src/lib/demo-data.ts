export const teammates = [
  { id: "analyst_a", displayName: "Analyst A", initials: "G", role: "Owner" }
] as const;

export const sundayGames = [
  {
    id: "buf-nyj",
    away: "BUF",
    awayName: "Buffalo",
    home: "NYJ",
    homeName: "New York",
    kickoff: "1:05 PM PT",
    countdown: "03:18:42",
    venue: "MetLife Stadium",
    roof: "Outdoor",
    weather: "11 mph · 68°",
    inactives: true,
    model: "BUF 25.4 — NYJ 20.1",
    selection: "Buffalo −2.5",
    market: "Spread",
    edge: "+3.4%",
    interval: "+0.8 to +5.9%",
    units: "1.0u",
    dollars: "$25",
    status: "Teammate seat locked",
    edgeDecay: "−0.6 pp from open",
    sparkline: [24, 22, 23, 19, 18, 17, 16, 15],
    books: [
      { name: "BetMGM", point: "−2.5", price: "−110", age: "42s", fair: "51.9%", shrunk: "55.3%", ev: "+5.8%", canonical: "−108", best: true },
      { name: "FanDuel", point: "−3", price: "+102", age: "1m", fair: "50.6%", shrunk: "53.1%", ev: "+5.3%", canonical: "−113", best: false }
    ]
  },
  {
    id: "mia-ne",
    away: "MIA",
    awayName: "Miami",
    home: "NE",
    homeName: "New England",
    kickoff: "10:00 AM PT",
    countdown: "00:13:42",
    venue: "Gillette Stadium",
    roof: "Outdoor",
    weather: "18 mph · 59°",
    inactives: true,
    model: "MIA 22.8 — NE 21.9",
    selection: "Under 44.5",
    market: "Total",
    edge: "+2.2%",
    interval: "−0.4 to +4.8%",
    units: "0.5u",
    dollars: "$12.50",
    status: "Approved · locks at kickoff",
    edgeDecay: "−1.1 pp from open",
    sparkline: [12, 15, 14, 16, 18, 19, 20, 21],
    books: [
      { name: "BetMGM", point: "44.5", price: "−105", age: "28s", fair: "50.2%", shrunk: "52.4%", ev: "+2.3%", canonical: "−105", best: true },
      { name: "FanDuel", point: "44", price: "−112", age: "51s", fair: "52.4%", shrunk: "54.0%", ev: "+2.2%", canonical: "−107", best: false }
    ]
  },
  {
    id: "sf-sea",
    away: "SF",
    awayName: "San Francisco",
    home: "SEA",
    homeName: "Seattle",
    kickoff: "5:20 PM PT",
    countdown: "07:33:42",
    venue: "Lumen Field",
    roof: "Open roof",
    weather: "7 mph · 62°",
    inactives: false,
    model: "SF 24.6 — SEA 23.8",
    selection: "Seattle +1.5",
    market: "Spread",
    edge: "−0.3%",
    interval: "−2.9 to +2.1%",
    units: "Pass",
    dollars: "$0",
    status: "Edge gone",
    edgeDecay: "−3.5 pp from open",
    sparkline: [8, 9, 11, 14, 16, 20, 24, 27],
    books: [
      { name: "BetMGM", point: "+1.5", price: "−110", age: "47s", fair: "52.1%", shrunk: "51.8%", ev: "−1.1%", canonical: "−110", best: false },
      { name: "FanDuel", point: "+2", price: "−118", age: "39s", fair: "53.7%", shrunk: "53.5%", ev: "−0.8%", canonical: "−111", best: true }
    ]
  }
] as const;

export const recordRows = [
  { date: "Jan 03", pick: "GB −2.5", status: "Executed", result: "Won", units: "+0.91u", clv: "+4.2¢ / +0.5pt", book: "BetMGM" },
  { date: "Dec 28", pick: "Under 47", status: "Paper", result: "Lost", units: "−0.50u", clv: "+1.7¢ / 0pt", book: "FanDuel" },
  { date: "Dec 27", pick: "BUF ML", status: "Executed", result: "Won", units: "+0.63u", clv: "+3.1¢", book: "FanDuel" },
  { date: "Dec 21", pick: "DET +3", status: "Paper", result: "Push", units: "0.00u", clv: "+2.4¢ / +0.5pt", book: "BetMGM" }
] as const;
