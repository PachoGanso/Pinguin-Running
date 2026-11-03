const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const rooms = new Map();
const MAX_PLAYERS = 30;

function code() { return crypto.randomBytes(3).toString("hex").toUpperCase(); }
function cleanName(n) { return String(n || "Pingüino").trim().slice(0, 16) || "Pingüino"; }
function publicRoom(r) {
  return {
    code: r.code, host: r.host, status: r.status, round: r.round,
    players: [...r.players.values()].map(p => ({
      id:p.id, name:p.name, x:p.x, z:p.z, progress:p.progress,
      alive:p.alive, finished:p.finished, color:p.color
    }))
  };
}
function emitRoom(r) { io.to(r.code).emit("room:update", publicRoom(r)); }
function makeRoom(socket, name) {
  let c; do { c = code(); } while (rooms.has(c));
  const r = { code:c, host:socket.id, status:"lobby", round:1, players:new Map(), finishers:[] };
  rooms.set(c,r); addPlayer(r,socket,name); return r;
}
function addPlayer(r,socket,name) {
  if (r.players.size >= MAX_PLAYERS) return false;
  const colors = ["#f4f7ff","#9be7ff","#ffd166","#ff9fbd","#b8f28b","#c7a6ff"];
  r.players.set(socket.id, {
    id:socket.id, name:cleanName(name), x:0, z:0, progress:0,
    alive:true, finished:false, color:colors[r.players.size % colors.length]
  });
  socket.join(r.code); socket.data.room = r.code;
  emitRoom(r); return true;
}
function removePlayer(socket) {
  const c = socket.data.room; if (!c || !rooms.has(c)) return;
  const r = rooms.get(c); r.players.delete(socket.id);
  if (!r.players.size) { rooms.delete(c); return; }
  if (r.host === socket.id) r.host = r.players.keys().next().value;
  emitRoom(r);
}
io.on("connection", socket => {
  socket.on("room:create", ({name}, cb={}) => {
    const r=makeRoom(socket,name); cb({ok:true,code:r.code,room:publicRoom(r)});
  });
  socket.on("room:join", ({name,code:c}, cb={}) => {
    c=String(c||"").trim().toUpperCase(); const r=rooms.get(c);
    if (!r) return cb({ok:false,error:"No existe esa sala."});
    if (r.status !== "lobby") return cb({ok:false,error:"La partida ya comenzó."});
    if (!addPlayer(r,socket,name)) return cb({ok:false,error:"La sala está llena (30 jugadores)."});
    cb({ok:true,code:c,room:publicRoom(r)});
  });
  socket.on("game:start", () => {
    const r=rooms.get(socket.data.room); if (!r || r.host!==socket.id || r.players.size<1) return;
    r.status="playing"; r.round=1; r.finishers=[];
    for (const p of r.players.values()) { p.alive=true;p.finished=false;p.progress=0;p.x=0;p.z=0; }
    io.to(r.code).emit("game:started", publicRoom(r)); emitRoom(r);
  });
  socket.on("player:move", data => {
    const r=rooms.get(socket.data.room); if (!r || r.status!=="playing") return;
    const p=r.players.get(socket.id); if (!p || !p.alive || p.finished) return;
    p.x=Math.max(-4,Math.min(4,Number(data.x)||0));
    p.z=Math.max(0,Math.min(100,Number(data.z)||0));
    p.progress=p.z/100;
    socket.to(r.code).emit("player:moved", {id:p.id,x:p.x,z:p.z});
  });
  socket.on("player:hit", () => {
    const r=rooms.get(socket.data.room); if (!r || r.status!=="playing") return;
    const p=r.players.get(socket.id); if (!p || !p.alive) return;
    p.alive=false; io.to(r.code).emit("player:eliminated",{id:p.id,name:p.name});
    checkRound(r);
  });
  socket.on("player:finish", () => {
    const r=rooms.get(socket.data.room); if (!r || r.status!=="playing") return;
    const p=r.players.get(socket.id); if (!p || !p.alive || p.finished) return;
    p.finished=true; r.finishers.push(p.id);
    io.to(r.code).emit("player:finished",{id:p.id,name:p.name,place:r.finishers.length});
    checkRound(r);
  });
  socket.on("disconnect", () => removePlayer(socket));
});
function checkRound(r) {
  const alive=[...r.players.values()].filter(p=>p.alive);
  const active=alive.filter(p=>!p.finished);
  const target = r.round===1 ? 15 : r.round===2 ? 8 : 1;
  if (alive.length <= target && active.length===0 || alive.length<=target) {
    const survivors=alive.slice(0,target);
    for (const p of r.players.values()) p.alive=survivors.some(s=>s.id===p.id);
    if (r.round>=3 || survivors.length<=1) {
      r.status="finished";
      io.to(r.code).emit("game:over",{winner:survivors[0]||null});
    } else {
      r.round++;
      for (const p of survivors) { p.finished=false;p.progress=0;p.x=0;p.z=0; }
      io.to(r.code).emit("round:next",{round:r.round,qualified:survivors.map(p=>p.id)});
    }
    emitRoom(r);
  }
}
const port=process.env.PORT || 3000;
server.listen(port,"0.0.0.0",()=>console.log(`Penguin Rush listo en puerto ${port}`));
