import { PMREMGenerator } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

export function createAssetPipeline(renderer){
  const dracoLoader=new DRACOLoader();
  dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");

  const ktx2Loader=new KTX2Loader();
  ktx2Loader.setTranscoderPath("https://unpkg.com/three@0.166.1/examples/jsm/libs/basis/");
  ktx2Loader.detectSupport(renderer);

  const gltfLoader=new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.setKTX2Loader(ktx2Loader);

  const rgbeLoader=new RGBELoader();
  const pmremGenerator=new PMREMGenerator(renderer);
  const gltfCache=new Map();
  const envCache=new Map();

  async function loadGLTF(modelUrl){
    if(!gltfCache.has(modelUrl)) gltfCache.set(modelUrl,gltfLoader.loadAsync(modelUrl));
    const gltf=await gltfCache.get(modelUrl);
    return {
      ...gltf,
      scene:gltf.scene.clone(true),
    };
  }

  async function loadEnvironmentHDR(hdrUrl){
    if(!envCache.has(hdrUrl)){
      envCache.set(hdrUrl,(async()=>{
        const hdrTexture=await rgbeLoader.loadAsync(hdrUrl);
        const envMap=pmremGenerator.fromEquirectangular(hdrTexture).texture;
        hdrTexture.dispose();
        return envMap;
      })());
    }
    return envCache.get(hdrUrl);
  }

  return {
    gltfLoader,
    rgbeLoader,
    ktx2Loader,
    dracoLoader,
    loadGLTF,
    loadEnvironmentHDR,
    dispose(){
      pmremGenerator.dispose();
      envCache.forEach(async(promise)=>{
        const tex=await promise;
        tex.dispose();
      });
      gltfCache.clear();
      envCache.clear();
      ktx2Loader.dispose();
      dracoLoader.dispose();
    },
  };
}
