import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultContent } from '../src/data/defaultContent.js';
import { ROOM_ASSET_REGISTRY } from '../src/render/roomAssetRegistry.js';
import { QUALITY_PROFILES, ROOM_LIGHT_PROFILES, DEFAULT_VISUAL_SETTINGS } from '../src/render/qualityProfiles.js';
import { ORIGIN, TILE_SIZE, MAP_ATTRIBUTION } from '../src/world/geo.js';
import { STOREY, STYLES } from '../src/world/buildingMesh.js';

const OUTPUT_DIR=path.resolve(process.cwd(),'exports/unity-handoff');

/**
 * The city, for a client that is not this one.
 *
 * The handoff described rooms and content and said nothing at all about the
 * world, which is now most of the game. Unity does not need the mesh code — it
 * needs the CONVENTIONS, because a second client that projects coordinates even
 * slightly differently puts every building in the wrong place, and that failure
 * looks like bad data rather than a bad constant.
 *
 * The geometry itself is fetched from the same endpoints this client uses. The
 * server is the single source of truth for the map; nothing here duplicates it.
 */
function buildWorldHandoff(){
  return {
    attribution: MAP_ATTRIBUTION,
    licence: 'OpenStreetMap contributors, ODbL. Terrain: Environment Agency LIDAR, OGL.',

    // Lat/lon to game metres. Unity must use exactly this, including the sign
    // of z: north is NEGATIVE z, matching the convention the whole world and
    // every door yaw is built on.
    projection: {
      kind: 'equirectangular-local-metres',
      origin: ORIGIN,
      metresPerDegreeLat: 111320,
      note: 'x = (lon - origin.lon) * 111320 * cos(origin.lat); z = -(lat - origin.lat) * 111320',
      northIsNegativeZ: true,
    },

    tiles: {
      sizeMetres: TILE_SIZE,
      key: 'tileX = floor(x / size), tileZ = floor(z / size)',
      endpoint: '/api/map/tile/{tileX}/{tileZ}',
      manifest: '/api/map/manifest',
      note: 'Cache-Control is no-cache with an ETag. Revalidate; do not cache blindly.',
    },

    // What a tile payload contains. Field names are terse because they are sent
    // for every tile.
    payload: {
      b: 'buildings: p flat [x,z,...] ring, y base, s street level (sill), h height, st style, g ground floor, rs roof shape, c colour [r,g,b] 0-255, m massing, lm landmark',
      r: 'road ribbons: p flat [x,z,...], e per-vertex ground height, w width, k highway kind, s surface, br bridge',
      a: 'paved areas: v [x,y,z,...] tessellated vertices, i triangle indices, s surface',
      c: 'land cover: v/i as above, k = grass | wood | water',
      w: 'trees: flat [x,y,z,...]',
      l: 'walls: p flat [x,z,...], e ground heights, k = wall | city | hedge',
      f: 'street furniture: {x,y,z,k} with k = bench | bollard | postbox | bin | lamp | stop',
      t: 'terrain heightmap: y tile floor, step spacing in metres, n samples per side, v decimetres above y (height = y + v * 0.1)',
    },

    building: {
      storeyMetres: STOREY,
      styles: STYLES,
      groundFloors: ['shopfront','residential','blank'],
      roofShapes: ['gabled','flat'],
      massing: ['gateway','cathedral','castle'],
      rules: [
        'Rings arrive in either winding. Normalise to anticlockwise before emitting faces, or two fifths of the city is built inside out and invisible under backface culling.',
        'Wind triangles so the front face is the one the normal points at. The normal attribute alone does not affect culling.',
        '58% of footprints are concave: ear-clip roofs, never fan from vertex zero.',
        'Walls run from s (street level) to s + h. Between y (lowest ground) and s goes a plinth, or sloping sites bury their shopfronts.',
        'Monument style maps ONE texture over the whole elevation, not one per storey, or an 83m cathedral gets 26 rows of office windows.',
        'Buildings flagged lm are in the manifest and must be skipped in tiles, or they are drawn twice.',
        'Gateways are passable: build piers and a span, and do not collide the footprint or the arch walls off its road.',
      ],
    },

    quality: Object.fromEntries(
      Object.entries(QUALITY_PROFILES).map(([k,v])=>[k,{ worldTiles:v.worldTiles, viewDistance:v.viewDistance, shadows:v.shadows }])
    ),

    cors: 'A native Unity player ignores CORS. A Unity WebGL build does not — add its host origin to ALLOWED_ORIGINS on the server.',
  };
}

function toUnityVector3(value, fallback={ x:0, y:0, z:0 }){
  if(!Array.isArray(value)||value.length!==3) return fallback;
  return { x:Number(value[0])||0, y:Number(value[1])||0, z:Number(value[2])||0 };
}

function toUnitySceneConfig(levelIndex, sceneConfig={}){
  return {
    levelIndex,
    fog: Array.isArray(sceneConfig.fog)&&sceneConfig.fog.length===2
      ? { colorHex: Number(sceneConfig.fog[0])||0, density: Number(sceneConfig.fog[1])||0 }
      : null,
    backgroundHex: typeof sceneConfig.background==='number' ? sceneConfig.background : null,
    spawn: toUnityVector3(sceneConfig.spawn, { x:0, y:1.6, z:0 }),
    yaw: typeof sceneConfig.yaw==='number' ? sceneConfig.yaw : 0,
    pitch: typeof sceneConfig.pitch==='number' ? sceneConfig.pitch : 0,
    bounds: sceneConfig.bounds&&typeof sceneConfig.bounds==='object'
      ? {
          insetX: typeof sceneConfig.bounds.insetX==='number' ? sceneConfig.bounds.insetX : 0,
          insetZ: typeof sceneConfig.bounds.insetZ==='number' ? sceneConfig.bounds.insetZ : 0,
        }
      : { insetX:0, insetZ:0 },
  };
}

function mapRoomRegistryForUnity(registry){
  return Object.entries(registry).map(([levelKey,entry])=>{
    const levelIndex=Number(levelKey);
    const sceneConfig=toUnitySceneConfig(levelIndex, entry.sceneConfig||{});

    return {
      levelIndex,
      levelKey: entry.key||`lvl-${String(levelIndex+1).padStart(2,'0')}`,
      label: entry.label||`Level ${levelIndex+1}`,
      enabled: entry.enabled===true,
      modelPath: entry.modelUrl||null,
      environmentPath: entry.environmentUrl||null,
      useEnvironmentAsBackground: entry.useEnvironmentAsBackground===true,
      hideProcedural: entry.hideProcedural===true,
      transform: {
        position: toUnityVector3(entry.transform?.position),
        rotationEulerDegrees: toUnityVector3(entry.transform?.rotation),
        scale: Array.isArray(entry.transform?.scale)
          ? toUnityVector3(entry.transform.scale, { x:1, y:1, z:1 })
          : { x:Number(entry.transform?.scale)||1, y:Number(entry.transform?.scale)||1, z:Number(entry.transform?.scale)||1 },
      },
      materialTuning: {
        envMapIntensity: typeof entry.materialTuning?.envMapIntensity==='number' ? entry.materialTuning.envMapIntensity : 1,
        roughness: typeof entry.materialTuning?.roughness==='number' ? entry.materialTuning.roughness : null,
        metalness: typeof entry.materialTuning?.metalness==='number' ? entry.materialTuning.metalness : null,
        normalScale: typeof entry.materialTuning?.normalScale==='number' ? entry.materialTuning.normalScale : null,
        flatShading: entry.materialTuning?.flatShading===true,
      },
      sceneConfig,
    };
  });
}

function buildUnityRenderProfile(){
  return {
    defaultVisualSettings: DEFAULT_VISUAL_SETTINGS,
    qualityProfiles: QUALITY_PROFILES,
    roomLightProfiles: ROOM_LIGHT_PROFILES,
    notes: [
      'Use Linear color space and ACES tonemapping in Unity URP/HDRP to match web baseline.',
      'Map roomLightProfiles by levelIndex to directional/ambient multipliers in your scene bootstrap.',
      'Bloom defaults are authored for desktop and should be tiered down on mobile.',
    ],
  };
}

function buildUnityContent(content){
  return {
    version: content.version,
    brand: content.brand,
    chapters: content.chapters.map((chapter,index)=>({
      index,
      id: chapter.id,
      number: chapter.number,
      name: chapter.name,
      subtitle: chapter.subtitle,
      moralFocus: chapter.moralFocus,
      roomVisualKey: chapter.roomVisualKey,
      stash: chapter.stash,
      dropId: chapter.dropId,
      missions: chapter.missions,
    })),
    drops: content.drops,
  };
}

async function writeJson(fileName, value){
  const target=path.join(OUTPUT_DIR,fileName);
  await fs.writeFile(target, JSON.stringify(value,null,2)+'\n', 'utf8');
}

async function writeManifest(){
  const lines=[
    '# Unity Handoff Export',
    '',
    'Generated from current TrapMadeIt runtime contracts.',
    '',
    '## Files',
    '- unity-content.json: chapter/drop/mission source payload',
    '- unity-room-registry.json: room asset registry mapped for Unity scene bootstrap',
    '- unity-render-profiles.json: quality and lighting baseline for parity tuning',
    '- unity-world.json: the CITY — projection, tile format, and the geometry',
    '  rules a second client has to match. The map itself is fetched from',
    '  /api/map/*; this describes how to read it, not a copy of it.',
    '',
    '## Import order',
    '1. Import room registry and bind authored level prefabs/GLBs by levelIndex.',
    '2. Import content and map chapter/drop IDs to ScriptableObjects.',
    '3. Apply render profiles to graphics settings + per-level light tuning.',
    '4. Implement the world from unity-world.json. Match the projection exactly',
    '   — north is NEGATIVE z — or every building lands in the wrong place and',
    '   it looks like bad data rather than a wrong constant.',
    '',
    '## Source of truth',
    '- src/data/defaultContent.js',
    '- src/render/roomAssetRegistry.js',
    '- src/render/qualityProfiles.js',
    '- src/world/geo.js, src/world/buildingMesh.js (world conventions)',
  ];

  await fs.writeFile(path.join(OUTPUT_DIR,'README.md'), lines.join('\n')+'\n', 'utf8');
}

async function main(){
  await fs.mkdir(OUTPUT_DIR,{ recursive:true });

  const unityContent=buildUnityContent(defaultContent);
  const unityRooms=mapRoomRegistryForUnity(ROOM_ASSET_REGISTRY);
  const unityRender=buildUnityRenderProfile();

  await writeJson('unity-content.json', unityContent);
  await writeJson('unity-room-registry.json', unityRooms);
  await writeJson('unity-render-profiles.json', unityRender);
  await writeJson('unity-world.json', buildWorldHandoff());
  await writeManifest();

  console.log('[unity-export] wrote handoff package to exports/unity-handoff');
}

main().catch(err=>{
  console.error('[unity-export] failed:', err.message);
  process.exit(1);
});
