// Static game content: characters, abilities, items, themes and tracks.
// Add new content by appending to these arrays; the engine reads them generically.

export type VehicleType = "kart" | "moto" | "truck" | "hover" | "buggy" | "rocket" | "car" | "dragon";
export type AbilityId = "dash" | "phase" | "shock" | "repair" | "steal" | "freeze" | "hop" | "mines";
export type ItemId = "nitro" | "shield" | "missile" | "mine" | "oil" | "heal" | "zap";

export interface Stats { speed: number; accel: number; handling: number; weight: number; armor: number }

export interface CharacterDef {
  id: string; name: string; vehicle: VehicleType; vehicleName: string;
  color: string; skin: string; ability: AbilityId; stats: Stats;
  unlockLevel: number; price: number; bio: string;
}

export const CHARACTERS: CharacterDef[] = [
  { id: "nova", name: "Nova", vehicle: "kart", vehicleName: "Faísca GT", color: "#ff7a1a", skin: "#f2c39b", ability: "dash", stats: { speed: 3, accel: 4, handling: 4, weight: 2, armor: 3 }, unlockLevel: 1, price: 0, bio: "Piloto de rua equilibrada, ama turbo." },
  { id: "brutus", name: "Brutus", vehicle: "truck", vehicleName: "Rolo Compressor", color: "#c0392b", skin: "#8d5a3b", ability: "shock", stats: { speed: 4, accel: 2, handling: 2, weight: 5, armor: 5 }, unlockLevel: 1, price: 0, bio: "Pesado e teimoso. Empurra tudo." },
  { id: "kiko", name: "Kiko", vehicle: "moto", vehicleName: "Vespa Relâmpago", color: "#2ecc71", skin: "#ffd8b0", ability: "steal", stats: { speed: 3, accel: 5, handling: 5, weight: 1, armor: 2 }, unlockLevel: 1, price: 0, bio: "Rápido nas curvas, rouba itens." },
  { id: "yuki", name: "Yuki", vehicle: "hover", vehicleName: "Floco Hover", color: "#5dade2", skin: "#fde7d6", ability: "freeze", stats: { speed: 4, accel: 3, handling: 3, weight: 2, armor: 3 }, unlockLevel: 1, price: 0, bio: "Desliza sem rodas e congela rivais." },
  { id: "mecha", name: "Mecha-7", vehicle: "car", vehicleName: "Unidade Sedã", color: "#95a5a6", skin: "#b8c4c8", ability: "repair", stats: { speed: 3, accel: 3, handling: 3, weight: 4, armor: 5 }, unlockLevel: 2, price: 150, bio: "Robô mecânico que se conserta." },
  { id: "rusty", name: "Rusty", vehicle: "buggy", vehicleName: "Areia Louca", color: "#d4a017", skin: "#c68642", ability: "mines", stats: { speed: 4, accel: 4, handling: 2, weight: 3, armor: 3 }, unlockLevel: 3, price: 250, bio: "Deixa um rastro de minas." },
  { id: "spectra", name: "Spectra", vehicle: "rocket", vehicleName: "Cometa Fantasma", color: "#9b59b6", skin: "#e8d5f5", ability: "phase", stats: { speed: 5, accel: 2, handling: 3, weight: 2, armor: 2 }, unlockLevel: 4, price: 400, bio: "Atravessa tudo como um fantasma." },
  { id: "draco", name: "Draco", vehicle: "dragon", vehicleName: "Dragão Mecânico", color: "#e74c3c", skin: "#3c8d5a", ability: "hop", stats: { speed: 5, accel: 3, handling: 4, weight: 3, armor: 3 }, unlockLevel: 6, price: 700, bio: "Voa por cima dos obstáculos." },
];

export interface AbilityDef { id: AbilityId; name: string; desc: string; unlockLevel: number }
export const ABILITIES: AbilityDef[] = [
  { id: "dash", name: "Super Turbo", desc: "Turbo longo e potente.", unlockLevel: 1 },
  { id: "shock", name: "Onda de Choque", desc: "Empurra e atordoa quem estiver perto.", unlockLevel: 1 },
  { id: "steal", name: "Ladrão", desc: "Rouba o item do rival (ou ganha um).", unlockLevel: 1 },
  { id: "freeze", name: "Raio Gélido", desc: "Dispara gelo que deixa o rival lento.", unlockLevel: 1 },
  { id: "repair", name: "Reparo", desc: "Recupera vida e remove lentidão.", unlockLevel: 2 },
  { id: "mines", name: "Campo Minado", desc: "Solta 3 minas atrás de você.", unlockLevel: 3 },
  { id: "phase", name: "Fase Fantasma", desc: "Fica intangível e imune por 3s.", unlockLevel: 4 },
  { id: "hop", name: "Salto", desc: "Pula alto sobre perigos.", unlockLevel: 5 },
];

export interface ItemDef { id: ItemId; name: string; icon: string; color: string }
export const ITEMS: ItemDef[] = [
  { id: "nitro", name: "Nitro", icon: "⚡", color: "#ffb020" },
  { id: "shield", name: "Escudo", icon: "◈", color: "#4fc3f7" },
  { id: "missile", name: "Míssil", icon: "➤", color: "#ff4d4d" },
  { id: "mine", name: "Mina", icon: "✹", color: "#ff3b6b" },
  { id: "oil", name: "Óleo", icon: "●", color: "#333" },
  { id: "heal", name: "Reparo", icon: "✚", color: "#5be37b" },
  { id: "zap", name: "Raio", icon: "ϟ", color: "#f5e663" },
];

export type DecorKind = "tree" | "pine" | "building" | "cactus" | "rock" | "crystal" | "lamp" | "palm" | "candy" | "snowman" | "mushroom" | "tower";

export interface ThemeDef {
  id: string; name: string; ground: string; ground2: string; road: string; edgeA: string; edgeB: string;
  line: string; dirt: string; decor: DecorKind[]; decorColors: string[]; night: boolean;
  surface: "ice" | "mud" | "sand" | "lava" | null;
  music: { bpm: number; root: number; scale: number[]; wave: OscillatorType };
}

const MINOR = [0, 3, 5, 7, 10];
const MAJOR = [0, 2, 4, 7, 9];
const DORIAN = [0, 2, 3, 7, 9];
const PHRYG = [0, 1, 5, 7, 8];

export const THEMES: Record<string, ThemeDef> = {
  forest: { id: "forest", name: "Floresta", ground: "#2f6b3a", ground2: "#285c32", road: "#4a4a55", edgeA: "#e8e8e8", edgeB: "#d93a3a", line: "#f0f0f0", dirt: "#8a6a3e", decor: ["tree", "pine", "rock", "mushroom"], decorColors: ["#1f4d28", "#2c6e37", "#3d8a45"], night: false, surface: "mud", music: { bpm: 132, root: 57, scale: MAJOR, wave: "triangle" } },
  city: { id: "city", name: "Cidade Neon", ground: "#1b1b2e", ground2: "#22223a", road: "#2e2e3d", edgeA: "#ff3df2", edgeB: "#27e0ff", line: "#ffd34d", dirt: "#3a3550", decor: ["building", "lamp"], decorColors: ["#3b2a5a", "#28304f", "#4a2350"], night: true, surface: null, music: { bpm: 140, root: 52, scale: MINOR, wave: "sawtooth" } },
  desert: { id: "desert", name: "Deserto", ground: "#d9a85b", ground2: "#cf9c4f", road: "#7b6550", edgeA: "#fff1d6", edgeB: "#c0552a", line: "#fff6e0", dirt: "#b8834a", decor: ["cactus", "rock"], decorColors: ["#4f8a3c", "#9c6b3a", "#b07a46"], night: false, surface: "sand", music: { bpm: 120, root: 50, scale: PHRYG, wave: "square" } },
  snow: { id: "snow", name: "Montanha Nevada", ground: "#e8f1f8", ground2: "#dbe7f1", road: "#6d7a8c", edgeA: "#ffffff", edgeB: "#3b7dd8", line: "#ffffff", dirt: "#a9bccd", decor: ["pine", "snowman", "rock"], decorColors: ["#2d5b45", "#3c6e57", "#e0ecf5"], night: false, surface: "ice", music: { bpm: 126, root: 60, scale: DORIAN, wave: "triangle" } },
  volcano: { id: "volcano", name: "Vulcão", ground: "#2a1612", ground2: "#331a14", road: "#3f3434", edgeA: "#ffb347", edgeB: "#2b2b2b", line: "#ff8c42", dirt: "#5a2a1a", decor: ["rock", "crystal"], decorColors: ["#4a2a22", "#ff5a1f", "#7a3a2a"], night: true, surface: "lava", music: { bpm: 150, root: 45, scale: PHRYG, wave: "sawtooth" } },
  beach: { id: "beach", name: "Praia Tropical", ground: "#f2d98d", ground2: "#ead083", road: "#8a7d6e", edgeA: "#ffffff", edgeB: "#1fb5c9", line: "#ffffff", dirt: "#e0c070", decor: ["palm", "rock"], decorColors: ["#2f8f4e", "#3fa65e", "#bfa16a"], night: false, surface: "sand", music: { bpm: 118, root: 55, scale: MAJOR, wave: "triangle" } },
  bridge: { id: "bridge", name: "Ponte Noturna", ground: "#141824", ground2: "#181d2b", road: "#3a2f33", edgeA: "#ffa94d", edgeB: "#3b2f2f", line: "#ffd9a0", dirt: "#2c2a35", decor: ["lamp", "building"], decorColors: ["#20263a", "#2b2238", "#1a2030"], night: true, surface: null, music: { bpm: 104, root: 49, scale: DORIAN, wave: "sawtooth" } },
  space: { id: "space", name: "Estação Orbital", ground: "#0a0a1f", ground2: "#0f0f2a", road: "#1f2340", edgeA: "#7cf9ff", edgeB: "#5b3dff", line: "#7cf9ff", dirt: "#2a1f4a", decor: ["tower", "crystal"], decorColors: ["#2a2f5a", "#7cf9ff", "#b04dff"], night: true, surface: "ice", music: { bpm: 144, root: 48, scale: MINOR, wave: "square" } },
  candy: { id: "candy", name: "Reino Doce", ground: "#ffc6e0", ground2: "#ffbad8", road: "#8e6ad6", edgeA: "#ffffff", edgeB: "#ff4f9a", line: "#fff7a8", dirt: "#d99ac0", decor: ["candy", "mushroom"], decorColors: ["#ff4f9a", "#5ad1ff", "#ffe24f"], night: false, surface: "mud", music: { bpm: 136, root: 62, scale: MAJOR, wave: "square" } },
  swamp: { id: "swamp", name: "Pântano", ground: "#2c3b26", ground2: "#26341f", road: "#4b4636", edgeA: "#a3b86c", edgeB: "#3b2f1f", line: "#c9d48a", dirt: "#4a3e28", decor: ["tree", "mushroom", "rock"], decorColors: ["#1d2b18", "#5a7a3a", "#7a5a9a"], night: true, surface: "mud", music: { bpm: 112, root: 47, scale: PHRYG, wave: "triangle" } },
  canyon: { id: "canyon", name: "Cânion", ground: "#b5603a", ground2: "#a95634", road: "#6b4a3a", edgeA: "#f4e2c8", edgeB: "#7a2e1a", line: "#f4e2c8", dirt: "#8a4a2a", decor: ["rock", "cactus"], decorColors: ["#7a3a22", "#8f4a2c", "#4f7a3a"], night: false, surface: "sand", music: { bpm: 128, root: 52, scale: DORIAN, wave: "sawtooth" } },
  mountain: { id: "mountain", name: "Montanhas", ground: "#5f7d4a", ground2: "#567343", road: "#5a5048", edgeA: "#f1e9dc", edgeB: "#7a5230", line: "#fff4d6", dirt: "#7f6a4c", decor: ["pine", "rock", "rock"], decorColors: ["#2f4a2a", "#7d7468", "#9b9184"], night: false, surface: "mud", music: { bpm: 124, root: 55, scale: DORIAN, wave: "triangle" } },
  future: { id: "future", name: "Pista Futurista", ground: "#101a2c", ground2: "#13203a", road: "#28324a", edgeA: "#e8f6ff", edgeB: "#ff2e88", line: "#5cf2ff", dirt: "#223050", decor: ["tower", "lamp", "crystal"], decorColors: ["#1e2b4a", "#5cf2ff", "#ff2e88"], night: true, surface: "ice", music: { bpm: 148, root: 50, scale: MINOR, wave: "square" } },
  dusk: { id: "dusk", name: "Lago Crepúsculo", ground: "#3a3d5c", ground2: "#34375a", road: "#4c3f5e", edgeA: "#ff9ec7", edgeB: "#5a4a9a", line: "#ffd1a8", dirt: "#4a3a5a", decor: ["pine", "rock", "mushroom"], decorColors: ["#232845", "#2c3a4a", "#ff9ec7"], night: false, surface: null, music: { bpm: 110, root: 53, scale: MAJOR, wave: "triangle" } },
};

export type ObjKind =
  | "item" | "boost" | "ramp" | "oil" | "crate" | "surface"
  | "barrier" | "tire" | "cone" | "rock" | "hole" | "mover" | "spinner" | "platform" | "trap";
export type SurfaceKind = "ice" | "mud" | "sand" | "lava" | "grass";
export interface TrackObject { kind: ObjKind; x: number; y: number; a?: number; sf?: SurfaceKind }
export interface TrackRoute { a: number; b: number; via: [number, number][]; secret?: boolean }

export const OBJECT_INFO: Record<ObjKind, { name: string; desc: string }> = {
  item: { name: "Caixa de item", desc: "Dá um item aleatório" },
  boost: { name: "Turbo no chão", desc: "Acelera quem passa" },
  ramp: { name: "Rampa / salto", desc: "Lança o veículo no ar" },
  platform: { name: "Plataforma de salto", desc: "Pulo alto e turbo ao aterrissar" },
  oil: { name: "Óleo", desc: "Faz rodar" },
  crate: { name: "Caixa destrutível", desc: "Quebra ao bater, causa dano" },
  barrier: { name: "Barreira", desc: "Parede sólida" },
  tire: { name: "Pneus", desc: "Obstáculo sólido que amortece" },
  cone: { name: "Cone", desc: "Pode ser derrubado" },
  rock: { name: "Pedra", desc: "Sólida e pesada" },
  hole: { name: "Buraco", desc: "Quem cai volta atrás" },
  mover: { name: "Barreira móvel", desc: "Vai e volta pela pista" },
  spinner: { name: "Obstáculo giratório", desc: "Braço que gira e empurra" },
  trap: { name: "Armadilha de espinhos", desc: "Liga e desliga, causa dano" },
  surface: { name: "Terreno", desc: "Gelo, lama, areia, lava ou grama" },
};
export const SOLID: ObjKind[] = ["barrier", "tire", "rock", "mover", "spinner"];

export interface TrackDef {
  id: string; name: string; theme: string; difficulty: 1 | 2 | 3; unlockLevel: number;
  width: number; points: [number, number][];
  shortcuts?: [number, number][]; // control-point index pairs
  objects?: TrackObject[]; // grid units, optional (auto-generated otherwise)
  routes?: TrackRoute[]; // alternative paths and secret shortcuts (forward only: a < b)
  laps?: number; creator?: string; createdAt?: number;
  custom?: boolean;
}

export const TRACKS: TrackDef[] = [
  { id: "bosque", name: "Bosque Esmeralda", theme: "forest", difficulty: 1, unlockLevel: 1, width: 4.4, points: [[20, 30], [50, 20], [80, 30], [88, 55], [75, 80], [45, 85], [18, 72], [12, 50]] },
  { id: "neon", name: "Avenida Neon", theme: "city", difficulty: 1, unlockLevel: 1, width: 4, points: [[15, 15], [85, 15], [88, 38], [62, 48], [88, 60], [85, 85], [15, 85], [12, 50]], shortcuts: [[2, 4]] },
  { id: "dunas", name: "Dunas Douradas", theme: "desert", difficulty: 1, unlockLevel: 1, width: 4.2, points: [[20, 20], [60, 12], [85, 30], [68, 52], [90, 75], [60, 90], [35, 70], [15, 85], [10, 50]], shortcuts: [[2, 4]] },
  { id: "ponte", name: "Ponte da Meia-Noite", theme: "bridge", difficulty: 1, unlockLevel: 1, width: 4, points: [[10, 18], [90, 18], [92, 32], [80, 40], [30, 40], [22, 50], [30, 62], [88, 62], [92, 76], [85, 88], [12, 88], [6, 55]] },
  { id: "pico", name: "Pico Nevado", theme: "snow", difficulty: 2, unlockLevel: 2, width: 4, points: [[50, 10], [85, 20], [90, 50], [68, 62], [85, 85], [50, 90], [30, 75], [15, 85], [10, 40], [30, 30]], shortcuts: [[2, 4]] },
  { id: "vulcao", name: "Vulcão Rubro", theme: "volcano", difficulty: 2, unlockLevel: 2, width: 3.8, points: [[15, 20], [45, 10], [55, 38], [80, 15], [92, 45], [70, 70], [85, 90], [40, 88], [25, 60], [10, 55]], shortcuts: [[1, 3]] },
  { id: "praia", name: "Baía Tropical", theme: "beach", difficulty: 2, unlockLevel: 3, width: 4.2, points: [[10, 50], [25, 15], [55, 25], [80, 10], [92, 40], [72, 55], [90, 80], [50, 92], [30, 75]] },
  { id: "orbital", name: "Estação Orbital", theme: "space", difficulty: 3, unlockLevel: 3, width: 3.6, points: [[50, 8], [70, 15], [75, 30], [90, 40], [85, 70], [65, 75], [60, 90], [35, 88], [25, 70], [10, 60], [15, 30], [35, 25]] },
  { id: "doce", name: "Reino Doce", theme: "candy", difficulty: 2, unlockLevel: 4, width: 4, points: [[20, 15], [50, 25], [80, 15], [90, 40], [70, 52], [90, 66], [75, 90], [50, 75], [25, 90], [10, 65], [30, 50], [10, 35]], shortcuts: [[3, 5]] },
  { id: "pantano", name: "Pântano Sombrio", theme: "swamp", difficulty: 3, unlockLevel: 5, width: 3.8, points: [[15, 15], [40, 18], [45, 45], [70, 40], [85, 15], [92, 55], [70, 85], [45, 70], [25, 90], [8, 60]], shortcuts: [[1, 3]] },
  { id: "canion", name: "Cânion Rochoso", theme: "canyon", difficulty: 3, unlockLevel: 6, width: 3.6, points: [[10, 10], [50, 15], [90, 10], [85, 45], [60, 50], [65, 75], [90, 90], [40, 92], [30, 60], [12, 55]], shortcuts: [[3, 6]] },
  { id: "crepusculo", name: "Lago Crepúsculo", theme: "dusk", difficulty: 2, unlockLevel: 7, width: 4.2, points: [[20, 25], [45, 12], [75, 20], [90, 45], [80, 70], [60, 60], [45, 85], [20, 80], [10, 52]], shortcuts: [[4, 6]] },
  { id: "serra", name: "Serra dos Ventos", theme: "mountain", difficulty: 2, unlockLevel: 2, width: 3.9, points: [[12, 20], [40, 12], [62, 26], [86, 14], [92, 46], [74, 58], [90, 82], [58, 90], [42, 70], [22, 88], [8, 60]], shortcuts: [[4, 6]] },
  { id: "hyper", name: "Hiper Anel 2099", theme: "future", difficulty: 3, unlockLevel: 4, width: 3.6, points: [[50, 8], [82, 14], [92, 36], [70, 46], [92, 62], [84, 88], [50, 80], [16, 90], [8, 62], [30, 48], [8, 32], [20, 12]], shortcuts: [[2, 4], [7, 9]] },
];

export const UNIT = 40; // pixels per grid unit
