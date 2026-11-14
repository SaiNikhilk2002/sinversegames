// Infrastructure cost model (docs/INFRASTRUCTURE_COST_BREAKDOWN.md). Run: node docs/infrastructure-cost-model.mjs
// Prices: official pages read 2026-11-14. Assumptions A1..A10 are labelled inline and explained in the document. Edit them with real usage.
// Updated 2026-11-14 (INFRASTRUCTURE_OPTIMIZATION_FINAL_REPORT.md): "ratio", A6 and A7 are now MEASURED with the real server
// (apps/realtime bench:compression, 248 clients, permessage-deflate with context takeover, as shipped in WS_COMPRESSION).
const H = 730; // hours per month
// Per-game model (A1: equal share of rooms across the six multiplayer games).
const games = {
  // ratio: MEASURED wire bytes per message, uncompressed / compressed (bench:compression, contextTakeover, x4 run).
  "bumper-blitz":      { players: 6, inMsgPerS: 60,  outKBs: 228, ratio: 13.1, turnBased: false }, // out: measured; in: A2 10 inputs/s/player
  "kitchen-rush-coop": { players: 3, inMsgPerS: 9,   outKBs: 74,  ratio: 19.9, turnBased: false }, // out: measured 12 KB/s base + A3 actions
  "chef-rivals":       { players: 2, inMsgPerS: 6,   outKBs: 42,  ratio: 29.6, turnBased: false },
  "color-clash":       { players: 4, inMsgPerS: 1.2, outKBs: 3,   ratio: 10.3, turnBased: true  },
  "token-trail":       { players: 4, inMsgPerS: 1.2, outKBs: 2,   ratio: 9.7,  turnBased: true  },
  "doodle-duel":       { players: 6, inMsgPerS: 16,  outKBs: 23,  ratio: 3.5,  turnBased: false }, // A4 drawer 15 strokes/s x 300 B x 5 viewers
};
const g = Object.values(games);
const avg = (f) => g.reduce((n, x) => n + f(x), 0) / g.length;
const playersPerRoom = avg((x) => x.players);
const inPerS = avg((x) => x.inMsgPerS);
const gbPerRoomHour = (avg((x) => x.outKBs) * 1024 * 3600) / 1e9;
const gbPerRoomHourCompressed = (avg((x) => x.outKBs / x.ratio) * 1024 * 3600) / 1e9;
const turnShare = avg((x) => (x.turnBased ? 1 : 0));
const DUTY = 0.3; // A5: average concurrency over a month = 30% of the stated peak
const MB128 = 0.125;
const fmt = (n) => (n < 10 ? n.toFixed(2) : n.toFixed(0));
console.log(`players/room ${playersPerRoom.toFixed(2)}, inbound msgs/s/room ${inPerS.toFixed(1)}, egress GB/room-hour ${gbPerRoomHour.toFixed(3)} (compressed ${gbPerRoomHourCompressed.toFixed(4)}), turn-based share ${turnShare.toFixed(2)}`);

function railway({ avgRooms, avgPlayers, deflate }) {
  const egressGB = avgRooms * H * (deflate ? gbPerRoomHourCompressed : gbPerRoomHour); // per-game measured ratios
  // A6 MEASURED: 248 clients in 56 active rooms used 0.235 vCPU uncompressed, 0.498 compressed (incl. Socket.IO, JSON, zlib).
  const vcpu = 0.02 + avgRooms * (deflate ? 0.0089 : 0.0042);
  // A7 MEASURED: about 140 MB base; about 75 KB per connected player uncompressed, about 550 KB with compression context.
  const memGB = 0.14 + avgPlayers * (deflate ? 0.00055 : 0.000075);
  const usage = vcpu * 20 + memGB * 10 + egressGB * 0.05;
  return { usage, bill: 5 + Math.max(0, usage - 5), egressGB, vcpu, memGB };
}
function durableObjects({ avgRooms, hibernateTurnBased, coordinatorAwake }) {
  const roomHours = avgRooms * H;
  const gbs = roomHours * 3600 * MB128 * (hibernateTurnBased ? 1 - turnShare : 1) + coordinatorAwake * H * 3600 * MB128; // A8, A9
  const requests = roomHours * ((inPerS / 20) * 3600 + playersPerRoom * 2) + roomHours * 20; // 20:1; A10
  const overage = (Math.max(0, gbs - 400_000) / 1e6) * 12.5 + (Math.max(0, requests - 1_000_000) / 1e6) * 0.15;
  return { gbs, requests, overage, bill: 5 + overage, freeFits: gbs / 30.4 <= 13_000 && requests / 30.4 <= 100_000 };
}
function neon({ awakeHoursPerDay, cu }) {
  const cuh = awakeHoursPerDay * 30.4 * cu;
  return { cuh, freeFits: cuh <= 100, launch: cuh * 0.106 + 0.35 };
}
const scenarios = [
  { label: "10 players", peak: 10, dbHours: 12, cu: 0.25, coord: 0.25 },
  { label: "100 players", peak: 100, dbHours: 24, cu: 0.25, coord: 1 },
  { label: "500 players", peak: 500, dbHours: 24, cu: 0.5, coord: 1 },
  { label: "1000 players", peak: 1000, dbHours: 24, cu: 1, coord: 1 },
];
// Scenarios by peak concurrent ROOMS (CLOUDFLARE_DURABLE_OBJECTS_ASSESSMENT.md), typical month (A5), coordinator awake.
console.log("\n=== BY PEAK CONCURRENT ROOMS, typical month (A5) ===");
for (const peakRooms of [10, 50, 100, 500]) {
  const avgRooms = peakRooms * DUTY, avgPlayers = avgRooms * playersPerRoom;
  const d = durableObjects({ avgRooms, hibernateTurnBased: false, coordinatorAwake: 1 });
  const dh = durableObjects({ avgRooms, hibernateTurnBased: true, coordinatorAwake: 1 });
  const r = railway({ avgRooms, avgPlayers, deflate: false }), rz = railway({ avgRooms, avgPlayers, deflate: true });
  console.log(`${peakRooms} rooms (~${Math.round(peakRooms * playersPerRoom)} players): avg ${avgRooms} | DO requests ${(d.requests / 1e6).toFixed(1)}M, GB-s ${(d.gbs / 1e6).toFixed(2)}M (${Math.round(d.gbs / 30.4)}/day) -> Paid+DO $${fmt(d.bill)}, hibernating turn-based $${fmt(dh.bill)} | Railway $${fmt(r.bill)}, with deflate $${fmt(rz.bill)}`);
}
for (const sustained of [false, true]) {
  console.log(`\n=== ${sustained ? "UPPER BOUND: peak sustained 24/7" : "TYPICAL: average = 30% of peak (A5)"} ===`);
  for (const s of scenarios) {
    const avgPlayers = s.peak * (sustained ? 1 : DUTY), avgRooms = avgPlayers / playersPerRoom;
    const r = railway({ avgRooms, avgPlayers, deflate: false }), rz = railway({ avgRooms, avgPlayers, deflate: true });
    const d = durableObjects({ avgRooms, hibernateTurnBased: false, coordinatorAwake: s.coord });
    const dh = durableObjects({ avgRooms, hibernateTurnBased: true, coordinatorAwake: s.coord });
    const n = neon({ awakeHoursPerDay: s.dbHours, cu: s.cu });
    console.log(`${s.label}: avg rooms ${fmt(avgRooms)} | Railway usage $${fmt(r.usage)} bill $${fmt(r.bill)} (egress ${fmt(r.egressGB)} GB, vCPU ${r.vcpu.toFixed(3)}, mem ${r.memGB.toFixed(2)} GB) | Railway+deflate bill $${fmt(rz.bill)} | DO GB-s ${fmt(d.gbs)} req ${fmt(d.requests)} overage $${fmt(d.overage)} -> Paid+DO $${fmt(d.bill)}, hibernating turn-based $${fmt(dh.bill)} | DO-Free fits ${d.freeFits} | Neon ${fmt(n.cuh)} CU-h Free ${n.freeFits}, Launch $${fmt(n.launch)}`);
  }
}
