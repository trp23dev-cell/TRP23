export function createRoomAssetTemplate(overrides={}){
  return {
    enabled:false,
    modelUrl:null,
    environmentUrl:null,
    useEnvironmentAsBackground:false,
    hideProcedural:false,
    transform:null,
    sceneConfig:null,
    materialTuning:null,
    ...overrides,
  };
}

export const ROOM_ASSET_REGISTRY={
  0:createRoomAssetTemplate({ key:"lvl-01", label:"The Come Up" }),
  1:createRoomAssetTemplate({ key:"lvl-02", label:"The Cook Up" }),
  2:createRoomAssetTemplate({ key:"lvl-03", label:"The Graveyard Shift" }),
  3:createRoomAssetTemplate({ key:"lvl-04", label:"The Front" }),
  4:createRoomAssetTemplate({ key:"lvl-05", label:"Top Floor" }),
  5:createRoomAssetTemplate({ key:"lvl-06", label:"The Warehouse" }),
};

export const FIRST_ROOM_MIGRATION_EXAMPLE=createRoomAssetTemplate({
  enabled:false,
  key:"lvl-01",
  label:"The Come Up",
  modelUrl:"/src/assets/models/lvl-01-room.glb",
  environmentUrl:"/src/assets/hdr/night-alley.hdr",
  useEnvironmentAsBackground:false,
  hideProcedural:true,
  transform:{ position:[0,0,0], rotation:[0,0,0], scale:1 },
  materialTuning:{ envMapIntensity:1.2, roughness:0.65, metalness:0.05, normalScale:1.0, flatShading:false },
  sceneConfig:{
    fog:[0x0a0805,0.038],
    background:0x050403,
    spawn:[0,1.6,4.2],
    yaw:0,
    pitch:0,
    bounds:{ insetX:0.5, insetZ:0.5 },
  },
});

function applyTransform(target, transform={}){
  const { position, rotation, scale }=transform;
  if(position) target.position.set(position[0]||0,position[1]||0,position[2]||0);
  if(rotation) target.rotation.set(rotation[0]||0,rotation[1]||0,rotation[2]||0);
  if(scale){
    if(Array.isArray(scale)) target.scale.set(scale[0]||1,scale[1]||1,scale[2]||1);
    else target.scale.setScalar(scale||1);
  }
}

function tuneMaterial(material, tuning={}){
  if(!material) return;
  if(typeof tuning.envMapIntensity==="number"&&"envMapIntensity" in material) material.envMapIntensity=tuning.envMapIntensity;
  if(typeof tuning.roughness==="number"&&"roughness" in material) material.roughness=tuning.roughness;
  if(typeof tuning.metalness==="number"&&"metalness" in material) material.metalness=tuning.metalness;
  if(typeof tuning.normalScale==="number"&&material.normalScale?.setScalar) material.normalScale.setScalar(tuning.normalScale);
  if(typeof tuning.flatShading==="boolean"&&"flatShading" in material) material.flatShading=tuning.flatShading;
  material.needsUpdate=true;
}

function applyMaterialTuning(node, entry){
  const tuning=entry.materialTuning;
  if(!node.isMesh||!tuning) return;
  if(Array.isArray(node.material)) node.material.forEach(mat=>tuneMaterial(mat,tuning));
  else tuneMaterial(node.material,tuning);
}

export async function applyRoomAssetLayer({
  levelIndex,
  levelGroup,
  scene,
  assetPipeline,
  decorateNode,
  shouldApply,
}){
  const entry=ROOM_ASSET_REGISTRY[levelIndex];
  if(!entry||entry.enabled!==true) return { applied:false, reason:"disabled" };
  if(!entry.modelUrl&&!entry.environmentUrl) return { applied:false, reason:"no-assets" };
  if(shouldApply&&!shouldApply()) return { applied:false, reason:"stale-request" };

  if(entry.environmentUrl){
    const envMap=await assetPipeline.loadEnvironmentHDR(entry.environmentUrl);
    if(shouldApply&&!shouldApply()) return { applied:false, reason:"stale-request" };
    scene.environment=envMap;
    if(entry.useEnvironmentAsBackground) scene.background=envMap;
  }

  if(entry.modelUrl){
    const existingChildren=entry.hideProcedural?[...levelGroup.children]:null;
    const gltf=await assetPipeline.loadGLTF(entry.modelUrl);
    if(shouldApply&&!shouldApply()) return { applied:false, reason:"stale-request" };
    const roomRoot=gltf.scene;
    applyTransform(roomRoot,entry.transform);
    roomRoot.traverse(node=>{
      if(node.isMesh){
        node.castShadow=true;
        node.receiveShadow=true;
      }
      applyMaterialTuning(node,entry);
      if(decorateNode) decorateNode(node);
    });
    if(existingChildren) existingChildren.forEach(child=>{ child.visible=false; });
    levelGroup.add(roomRoot);
  }

  return { applied:true, entry, sceneConfig:entry.sceneConfig||null };
}
