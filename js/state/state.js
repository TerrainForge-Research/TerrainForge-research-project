var STATE = {
  eq: 'fbm(x,y,6)*3 + ridge(x,y)*1.5',
  scale: 1.0, amp: 2.0, oct: 4, rough: 0.5,
  res: 80, erosion: 0.0,
  erosionType: 'none',
  droplets: 3000, inertia: 0.05, eroRate: 0.3, depRate: 0.3, evap: 0.02,
  talusAngle: 30, thermIters: 20,
  showFlowMap: false,
  seaLevel: 0.0, wAlpha: 0.6, wSpeed: 0.4, wHeight: 0.08,
  waterEqOn: false, waterEq: 'sin(x*1.2+t*0.6)*0.6 + sin(y*0.9-t*0.5)*0.4',
  riverOn: false, riverDepth: 0.6, riverWarp: 0.8,
  riverGenThresh: 0.22, riverCarveDepth: 0.28, riverCarveWidth: 1, riverCarveOn: true,
  treeDensity: 0.5, rockDensity: 0.3,
  snowLine: 0.78, forestLo: 0.12, forestHi: 0.62, maxSlope: 0.8,
  colors:{deep:'#1a6bbd',shallow:'#3d8fd4',sand:'#e6c97a',grass:'#4a9e3f',
          forest:'#2d6b24',rock:'#8a7d6e',snow:'#e8eef2'},
  cBlend:0.08, beachW:0.04,
  wireframe:false, flatShade:false, showNormals:false,
  seed: 42, layers: [],
  autoRotate: true,
  mapArea: 1.0,      // World-space area multiplier (1 = default, up to 8 = 8× larger map)
  regions: [],       // Terrain zone presets painted across the map
  importedTerrains: [], // Exact-size terrains imported from other saved maps (max 5)
  lodEnabled: false, // Automatic camera-distance Level of Detail (terrain mesh)
  // ── Climate Biome System — classification driven by height + moisture + temperature ──
  climateOn: true,
  moistureScale: 1.0,
  tempScale: 1.0,
  tempLapse: 0.85,             // how much temperature drops per unit of elevation
  coastalMoistureBoost: 0.4,   // extra moisture near water bodies
  // ── Tree Level-of-Detail — billboard (far) ↔ low-poly (mid) ↔ full mesh (near) ──
  treeLODEnabled: true,
  treeLodNearMult: 1.0,
  treeLodFarMult: 1.0
};

var SURF = 20; // world units


