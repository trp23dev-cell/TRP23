import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultContent } from '../src/data/defaultContent.js';
import { ROOM_ASSET_REGISTRY } from '../src/render/roomAssetRegistry.js';
import { QUALITY_PROFILES, ROOM_LIGHT_PROFILES, DEFAULT_VISUAL_SETTINGS } from '../src/render/qualityProfiles.js';

const OUTPUT_DIR=path.resolve(process.cwd(),'exports/unity-handoff');

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
    '',
    '## Import order',
    '1. Import room registry and bind authored level prefabs/GLBs by levelIndex.',
    '2. Import content and map chapter/drop IDs to ScriptableObjects.',
    '3. Apply render profiles to graphics settings + per-level light tuning.',
    '',
    '## Source of truth',
    '- src/data/defaultContent.js',
    '- src/render/roomAssetRegistry.js',
    '- src/render/qualityProfiles.js',
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
  await writeManifest();

  console.log('[unity-export] wrote handoff package to exports/unity-handoff');
}

main().catch(err=>{
  console.error('[unity-export] failed:', err.message);
  process.exit(1);
});
