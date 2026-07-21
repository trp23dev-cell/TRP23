import fs from 'node:fs';
import path from 'node:path';
import { ROOM_ASSET_REGISTRY } from '../src/render/roomAssetRegistry.js';
import { formatRegistryValidationReport, validateRoomAssetRegistry } from '../src/render/roomAssetValidation.js';

const report=validateRoomAssetRegistry(ROOM_ASSET_REGISTRY);
const messages=formatRegistryValidationReport(report);

function resolveWorkspaceAsset(url){
  if(typeof url!=='string') return null;
  if(!url.startsWith('/src/')) return null;
  return path.resolve(process.cwd(), url.slice(1));
}

function checkAssetPathExists(url, label, levelIndex, enabled){
  const resolved=resolveWorkspaceAsset(url);
  if(!resolved) return;
  if(fs.existsSync(resolved)) return;

  const issue={
    levelIndex,
    code:`${label}.missing-file`,
    message:`${label} points to a missing file: ${url}`,
  };

  if(enabled) report.errors.push(issue);
  else report.warnings.push(issue);
}

Object.entries(ROOM_ASSET_REGISTRY).forEach(([levelKey, entry])=>{
  if(!entry||typeof entry!=='object') return;
  const levelIndex=Number(levelKey);
  checkAssetPathExists(entry.modelUrl, 'modelUrl', levelIndex, entry.enabled===true);
  checkAssetPathExists(entry.environmentUrl, 'environmentUrl', levelIndex, entry.enabled===true);
});

const finalLines=formatRegistryValidationReport(report);
if(finalLines.length){
  console.log('Room asset registry preflight report:');
  finalLines.forEach(line=>console.log(' -', line));
}else{
  console.log('Room asset registry preflight report: clean');
}

if(!report.ok){
  process.exitCode=1;
}
