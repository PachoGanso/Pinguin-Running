import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
const socket=io();
const $=id=>document.getElementById(id);
let room=null, me=null, started=false, alive=true, round=1, x=0,z=0,vy=0,jumping=false,lastSend=0,obstacles=[],remote=new Map(),myPenguin=null;
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x8bd9ed); scene.fog=new THREE.Fog(0x8bd9ed,30,115);
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,200);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xc9f3ff,0x45213b,2));
const sun=new THREE.DirectionalLight(0xffffff,2.4);sun.position.set(-8,18,8);sun.castShadow=true;scene.add(sun);
const mat=(c,rough=.7)=>new THREE.MeshStandardMaterial({color:c,roughness:rough});
const floorMat=mat(0x263e5a), lavaMat=new THREE.MeshStandardMaterial({color:0xff4a0a,emissive:0xff2700,emissiveIntensity:1.5}), ice=mat(0x83d9ed);
function box(w,h,d,m,x,y,z){let o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o}
box(12,1,110,floorMat,0,-.7,-48);
box(1,2,110,ice,-6.3,.2,-48);box(1,2,110,ice,6.3,.2,-48);
box(11,.4,110,lavaMat,0,-1.5,-48);
for(let i=0;i<14;i++){let p=box(1.2,.3,2,ice,(Math.random()*8-4),-.05,-8-i*7);p.rotation.y=Math.random()*.3}
function makePenguin(color=0x17243a){
 const g=new THREE.Group();const body=new THREE.Mesh(new THREE.SphereGeometry(.48,18,14),mat(color));body.scale.set(.82,1.18,.7);body.position.y=.8;body.castShadow=true;g.add(body);
 const belly=new THREE.Mesh(new THREE.SphereGeometry(.36,16,12),mat(0xf5f7ff));belly.scale.set(.82,1.05,.25);belly.position.set(0,.78,.27);g.add(belly);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.32,16,12),mat(color));head.position.set(0,1.48,0);head.castShadow=true;g.add(head);
 const eyeMat=mat(0xffffff),black=mat(0x101522);
 for(let s of [-1,1]){let e=new THREE.Mesh(new THREE.SphereGeometry(.065,10,8),eyeMat);e.position.set(s*.12,1.52,.28);g.add(e);let b=new THREE.Mesh(new THREE.SphereGeometry(.03,8,8),black);b.position.set(s*.12,1.52,.337);g.add(b)}
 const beak=new THREE.Mesh(new THREE.ConeGeometry(.1,.22,8),mat(0xffa52e));beak.rotation.x=Math.PI/2;beak.position.set(0,1.4,.39);g.add(beak);
 for(let s of [-1,1]){let wing=new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),mat(color));wing.scale.set(.65,1.8,.55);wing.position.set(s*.4,.82,0);wing.rotation.z=s*.3;g.add(wing);let foot=new THREE.Mesh(new THREE.SphereGeometry(.14,10,8),mat(0xffa52e));foot.scale.set(1,.35,1.5);foot.position.set(s*.19,.12,.08);g.add(foot)}
 return g;
}
myPenguin=makePenguin();scene.add(myPenguin);
function addBall(zpos,lane){let b=new THREE.Mesh(new THREE.SphereGeometry(.75,18,14),lavaMat);b.position.set(lane,.55,zpos);b.castShadow=true;scene.add(b);obstacles.push({mesh:b,lane,z:zpos})}
for(let i=0;i<11;i++)addBall(-12-i*8,(i%3-1)*3.2);
const keys={};addEventListener("keydown",e=>{keys[e.code]=true;if(e.code==="Space")e.preventDefault()});addEventListener("keyup",e=>keys[e.code]=false);
function show(t){$("toast").textContent=t;setTimeout(()=>$("toast").textContent="",2600)}
function setMenu(on){$("menu").style.display=on?"block":"none";$("hud").style.display=on?"none":"flex";$("help").style.display=on?"none":"block"}
function renderRoom(r){room=r;$("roomInfo").innerHTML=`Sala: <b>${r.code}</b><br>${r.players.length}/30 jugadores<br>${r.players.map(p=>p.name).join(", ")}`;$("players").textContent=`Jugadores: ${r.players.length}`;$("start").style.display=r.host===socket.id&&r.status==="lobby"?"block":"none";$("roster").innerHTML=r.players.map(p=>`${p.alive?"🐧":"❌"} ${p.name}`).join("<br>")}
$("create").onclick=()=>socket.emit("room:create",{name:$("name").value},res=>{if(!res.ok)return $("msg").textContent=res.error;me=socket.id;renderRoom(res.room);$("msg").textContent="Comparte este código con tus amigos: "+res.code});
$("join").onclick=()=>socket.emit("room:join",{name:$("name").value,code:$("code").value},res=>{if(!res.ok)return $("msg").textContent=res.error;me=socket.id;renderRoom(res.room);$("msg").textContent="¡Te uniste! Código: "+res.code});
$("start").onclick=()=>socket.emit("game:start");
socket.on("room:update",renderRoom);
socket.on("game:started",r=>{renderRoom(r);started=true;alive=true;round=1;x=0;z=0;setMenu(false);show("¡CORRE! RONDA 1")});
socket.on("player:moved",p=>{let g=remote.get(p.id);if(g){g.position.x=p.x;g.position.z=-p.z}});
socket.on("player:eliminated",p=>show(p.name+" fue eliminado"));
socket.on("player:finished",p=>show(p.name+" llegó a la meta"));
socket.on("round:next",d=>{round=d.round;z=0;x=0;alive=true;$("round").textContent=`Ronda ${round}/3`;show("¡RONDA "+round+"! Clasificados: "+d.qualified.length)});
socket.on("game:over",d=>{started=false;show(d.winner?"🏆 GANÓ "+d.winner.name:"Fin de la partida");$("status").textContent="Partida terminada";setTimeout(()=>setMenu(true),3500)});
function update(dt){
 if(started&&alive){
  let speed=dt*.012;
  if(keys.ArrowLeft||keys.KeyA)x-=speed;if(keys.ArrowRight||keys.KeyD)x+=speed;
  x=Math.max(-4.8,Math.min(4.8,x));
  if((keys.Space||keys.ArrowUp||keys.KeyW)&&!jumping){vy=.19;jumping=true}
  vy-=dt*.00055;myPenguin.position.y+=vy*dt*.06;if(myPenguin.position.y<=0){myPenguin.position.y=0;vy=0;jumping=false}
  if(keys.ArrowUp||keys.KeyW)z+=dt*.006;
  if(keys.ArrowDown||keys.KeyS)z-=dt*.003;
  z=Math.max(0,Math.min(100,z));
  myPenguin.position.x=x;myPenguin.position.z=-z;myPenguin.rotation.z=(keys.ArrowLeft||keys.KeyA)?.15:(keys.ArrowRight||keys.KeyD)?-.15:0;
  for(const o of obstacles){let oz=o.z+Math.sin(performance.now()*.001+o.z)*1.5;if(Math.abs(oz+z)<1.25&&Math.abs(o.lane-x)<1.15&&myPenguin.position.y<.9){alive=false;socket.emit("player:hit");show("¡Te golpeó la lava!");}}
  if(z>=100){started=false;socket.emit("player:finish");show("¡Llegaste a la meta!")}
  const now=performance.now();if(now-lastSend>65){socket.emit("player:move",{x,z});lastSend=now}
 }
 camera.position.lerp(new THREE.Vector3(myPenguin.position.x*.45,5.3,myPenguin.position.z+9),.08);camera.lookAt(myPenguin.position.x,1,myPenguin.position.z-5);
}
let prev=performance.now();function loop(now){let dt=Math.min(40,now-prev);prev=now;update(dt);renderer.render(scene,camera);requestAnimationFrame(loop)}requestAnimationFrame(loop);
socket.on("room:update",r=>{for(const p of r.players){if(p.id===socket.id)continue;if(!remote.has(p.id)){let g=makePenguin(0x283b65);scene.add(g);remote.set(p.id,g)}let g=remote.get(p.id);g.position.x=p.x;g.position.z=-p.z}for(const [id,g] of remote){if(!r.players.some(p=>p.id===id)){scene.remove(g);remote.delete(id)}}});
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
setMenu(true);
