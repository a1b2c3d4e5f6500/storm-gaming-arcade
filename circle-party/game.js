const canvas = document.querySelector('#gameCanvas');
const context = canvas.getContext('2d');
const lobby = document.querySelector('#lobby');
const gameScreen = document.querySelector('#gameScreen');
const nameInput = document.querySelector('#nameInput');
const codeInput = document.querySelector('#codeInput');
const createButton = document.querySelector('#createButton');
const joinButton = document.querySelector('#joinButton');
const leaveButton = document.querySelector('#leaveButton');
const lobbyStatus = document.querySelector('#lobbyStatus');
const partyCode = document.querySelector('#partyCode');
const sizeValue = document.querySelector('#sizeValue');
const scoreValue = document.querySelector('#scoreValue');
const fullscreenButton = document.querySelector('#fullscreenButton');
const joystick = document.querySelector('#joystick');
const joystickKnob = document.querySelector('#joystickKnob');

const WORLD_WIDTH = 5000;
const WORLD_HEIGHT = 3200;
const START_RADIUS = 18;
const food = [];
const players = new Map();
const connections = new Set();
let peer = null;
let hostConnection = null;
let localId = null;
let activeCode = null;
let isHost = false;
let worldStarted = false;
const keys = { up:false, down:false, left:false, right:false };
const isMobile = navigator.maxTouchPoints > 0 || window.matchMedia('(hover: none) and (pointer: coarse)').matches;

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = new Uint32Array(6);
  crypto.getRandomValues(bytes);
  for (const value of bytes) code += chars[value % chars.length];
  return code;
}

function makeFood() {
  return { x:15 + Math.random()*(WORLD_WIDTH-30), y:15 + Math.random()*(WORLD_HEIGHT-30), r:5 + Math.floor(Math.random()*6) };
}

for (let i = 0; i < 700; i++) food.push(makeFood());

function cleanName() {
  return (nameInput.value || 'Spiller').trim().slice(0,18) || 'Spiller';
}

function enterGame(code) {
  activeCode = code;
  partyCode.textContent = code;
  lobby.hidden = true;
  gameScreen.hidden = false;
  if (isMobile) document.body.classList.add('mobile-game');
  resizeCanvas();
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 76;
}
window.addEventListener('resize', resizeCanvas);

function setKey(code, pressed) {
  if (code === 'ArrowUp' || code === 'KeyW') keys.up = pressed;
  if (code === 'ArrowDown' || code === 'KeyS') keys.down = pressed;
  if (code === 'ArrowLeft' || code === 'KeyA') keys.left = pressed;
  if (code === 'ArrowRight' || code === 'KeyD') keys.right = pressed;
}
window.addEventListener('keydown', event => setKey(event.code, true));
window.addEventListener('keyup', event => setKey(event.code, false));

function makePlayer(id) {
  const colors = ['#ff6b6b','#ffd166','#06d6a0','#4cc9f0','#f72585','#9b5de5','#00bbf9'];
  const name = cleanName();
  const startingRadius = name.toLowerCase() === 'storm' ? 54 : START_RADIUS;
  return { id, name, x:80+Math.random()*(WORLD_WIDTH-160), y:80+Math.random()*(WORLD_HEIGHT-160), r:startingRadius, score:0, color:colors[Math.floor(Math.random()*colors.length)], input:{up:false,down:false,left:false,right:false} };
}

function setupHostConnection(connection) {
  connections.add(connection);
  connection.on('data', data => {
    if (data.type === 'join') {
      const player = makePlayer(connection.peer);
      player.name = data.name;
      players.set(connection.peer, player);
    }
    if (data.type === 'input') {
      const player = players.get(connection.peer);
      if (player) player.input = data.input;
    }
  });
  connection.on('close', () => { connections.delete(connection); players.delete(connection.peer); });
  connection.on('error', () => { connections.delete(connection); players.delete(connection.peer); });
}

function broadcastState() {
  const payload = { type:'state', players:[...players.values()], food };
  for (const connection of connections) if (connection.open) connection.send(payload);
  if (isHost) renderState(payload);
}

function startHost() {
  const code = randomCode();
  isHost = true;
  peer = new Peer(`circle-party-${code}`);
  peer.on('open', id => {
    localId = id;
    players.set(id, makePlayer(id));
    enterGame(code);
  });
  peer.on('connection', connection => {
    connection.on('open', () => setupHostConnection(connection));
  });
  peer.on('error', error => {
    lobbyStatus.textContent = 'Kunne ikke oprette party. Prøv igen.';
    console.error(error);
  });
  worldStarted = true;
}

function joinParty() {
  const code = codeInput.value.trim().replace(/[^A-Z0-9]/gi,'').toUpperCase();
  if (code.length < 4) { lobbyStatus.textContent = 'Indtast en gyldig partykode.'; return; }
  activeCode = code;
  lobbyStatus.textContent = 'Forbinder til party...';
  peer = new Peer();
  peer.on('open', id => {
    localId = id;
    const connection = peer.connect(`circle-party-${code}`, { reliable:true });
    hostConnection = connection;
    connection.on('open', () => {
      connection.send({ type:'join', name:cleanName() });
      enterGame(code);
    });
    connection.on('data', data => {
      if (data.type === 'state') { renderState(data); }
    });
    connection.on('error', () => { lobbyStatus.textContent = 'Kunne ikke finde partyet.'; });
  });
  peer.on('error', () => { lobbyStatus.textContent = 'Kunne ikke finde partyet.'; });
}

createButton.addEventListener('click', startHost);
joinButton.addEventListener('click', joinParty);
leaveButton.addEventListener('click', () => window.location.reload());
codeInput.addEventListener('input', () => codeInput.value = codeInput.value.replace(/[^a-z0-9]/gi,'').toUpperCase());

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await gameScreen.requestFullscreen();
      if (screen.orientation?.lock) {
        try { await screen.orientation.lock('landscape'); } catch (_) {}
      }
    } else {
      await document.exitFullscreen();
    }
  } catch (_) {
    lobbyStatus.textContent = 'Fuld skærm blev ikke tilladt af browseren.';
  }
}

fullscreenButton.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.textContent = document.fullscreenElement ? 'Forlad fuld skærm' : 'Fuld skærm';
  resizeCanvas();
});

function updateJoystick(event) {
  const rect = joystick.getBoundingClientRect();
  let dx = event.clientX - (rect.left + rect.width / 2);
  let dy = event.clientY - (rect.top + rect.height / 2);
  const length = Math.hypot(dx, dy);
  const maxDistance = 38;
  if (length > maxDistance) {
    dx = dx / length * maxDistance;
    dy = dy / length * maxDistance;
  }
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  const deadZone = 10;
  keys.left = dx < -deadZone;
  keys.right = dx > deadZone;
  keys.up = dy < -deadZone;
  keys.down = dy > deadZone;
}

function releaseJoystick() {
  joystickKnob.style.transform = 'translate(0, 0)';
  keys.up = keys.down = keys.left = keys.right = false;
}

if (isMobile) {
  joystick.addEventListener('pointerdown', event => {
    joystick.setPointerCapture(event.pointerId);
    updateJoystick(event);
  });
  joystick.addEventListener('pointermove', event => {
    if (joystick.hasPointerCapture(event.pointerId)) updateJoystick(event);
  });
  joystick.addEventListener('pointerup', releaseJoystick);
  joystick.addEventListener('pointercancel', releaseJoystick);
}

function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }
function clamp(value,min,max) { return Math.min(Math.max(value,min),max); }
function normalize(dx,dy) { const length=Math.hypot(dx,dy)||1; return [dx/length,dy/length]; }
function addRadiusByArea(player, radiusGained) {
  const hasStormBonus = player.name.trim().toLowerCase() === 'storm';
  const bonusRadius = hasStormBonus ? radiusGained * 3 : radiusGained;
  const maximumRadius = hasStormBonus ? 510 : 170;
  player.r = Math.min(maximumRadius, Math.sqrt(player.r ** 2 + bonusRadius ** 2));
}

function updateWorld() {
  for (const player of players.values()) {
    let mx=(player.input.right?1:0)-(player.input.left?1:0);
    let my=(player.input.down?1:0)-(player.input.up?1:0);
    [mx,my]=normalize(mx,my);
    let speed=240/Math.max(1,player.r/35);
    if (player.name.trim().toLowerCase()==='storm') speed*=3;
    player.x=clamp(player.x+mx*speed/60,player.r,WORLD_WIDTH-player.r);
    player.y=clamp(player.y+my*speed/60,player.r,WORLD_HEIGHT-player.r);
    for (const item of food) {
      if (distance(player,item)<player.r+item.r+2) {
        addRadiusByArea(player, item.r * 0.18);
        player.score++;
        Object.assign(item,makeFood());
        break;
      }
    }
  }
  for (const player of players.values()) {
    for (const other of players.values()) {
      if (player.id===other.id) continue;
      if (distance(player,other)<player.r+other.r-2 && player.r>other.r*1.05) {
        const sizePoints = Math.round(other.r);
        addRadiusByArea(player, sizePoints * 0.55);
        player.score += sizePoints;
        other.r=other.name.trim().toLowerCase()==='storm'?54:START_RADIUS;
        other.score=Math.max(0,other.score-sizePoints);
        other.x=80+Math.random()*(WORLD_WIDTH-160);
        other.y=80+Math.random()*(WORLD_HEIGHT-160);
      }
    }
  }
  broadcastState();
}

setInterval(() => {
  if (isHost && worldStarted) {
    const hostPlayer = players.get(localId);
    if (hostPlayer) hostPlayer.input = keys;
    updateWorld();
  }
  if (hostConnection?.open) hostConnection.send({ type:'input', input:keys });
}, 1000/60);

let renderedWorld = { players:[], food };
function renderState(data) {
  renderedWorld = data;
  draw(data);
  const local = data.players.find(player => player.id === localId);
  if (local) { sizeValue.textContent=Math.round(local.r); scoreValue.textContent=local.score; }
}

function draw(data) {
  context.clearRect(0,0,canvas.width,canvas.height);
  const local = data.players.find(player => player.id===localId) || data.players[0];
  const cameraX = local ? clamp(local.x-canvas.width/2,0,Math.max(0,WORLD_WIDTH-canvas.width)) : 0;
  const cameraY = local ? clamp(local.y-canvas.height/2,0,Math.max(0,WORLD_HEIGHT-canvas.height)) : 0;
  context.fillStyle='#101c18'; context.fillRect(0,0,canvas.width,canvas.height);
  context.strokeStyle='rgba(215,243,91,.055)';
  for(let x=-(cameraX%80);x<canvas.width;x+=80){context.beginPath();context.moveTo(x,0);context.lineTo(x,canvas.height);context.stroke()}
  for(let y=-(cameraY%80);y<canvas.height;y+=80){context.beginPath();context.moveTo(0,y);context.lineTo(canvas.width,y);context.stroke()}
  for(const item of data.food){context.beginPath();context.fillStyle='#d7f35b';context.arc(item.x-cameraX,item.y-cameraY,item.r,0,Math.PI*2);context.fill()}
  for(const player of data.players){
    const x=player.x-cameraX,y=player.y-cameraY;
    context.beginPath();context.fillStyle=player.color;context.arc(x,y,player.r,0,Math.PI*2);context.fill();
    if(player.id===localId){context.strokeStyle='#f1ede4';context.lineWidth=3;context.stroke()}
    context.fillStyle='#f1ede4';context.textAlign='center';context.font='700 14px Arial';context.fillText(player.name,x,y-player.r-12);
  }
  if(local){sizeValue.textContent=Math.round(local.r);scoreValue.textContent=local.score}
}
