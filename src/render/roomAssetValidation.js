const MODEL_EXTENSIONS=/\.(glb|gltf)$/i;
const ENVIRONMENT_EXTENSIONS=/\.hdr$/i;

function isObject(value){
  return value&&typeof value==='object'&&!Array.isArray(value);
}

function isFiniteNumber(value){
  return typeof value==='number'&&Number.isFinite(value);
}

function pushIssue(bucket, levelIndex, code, message){
  bucket.push({ levelIndex, code, message });
}

function validateVector3(value, label, levelIndex, errors){
  if(!Array.isArray(value)||value.length!==3||!value.every(isFiniteNumber)){
    pushIssue(errors, levelIndex, `${label}.invalid`, `${label} must be an array of 3 finite numbers.`);
    return false;
  }
  return true;
}

function validateUrl(value, label, pattern, levelIndex, errors){
  if(value==null) return;
  if(typeof value!=='string'||!value.trim()){
    pushIssue(errors, levelIndex, `${label}.invalid-type`, `${label} must be a non-empty string when provided.`);
    return;
  }
  if(!pattern.test(value)){
    pushIssue(errors, levelIndex, `${label}.invalid-extension`, `${label} must match ${pattern.toString()}.`);
  }
}

function validateTransform(transform, levelIndex, errors){
  if(transform==null) return;
  if(!isObject(transform)){
    pushIssue(errors, levelIndex, 'transform.invalid-type', 'transform must be an object when provided.');
    return;
  }
  if(transform.position!==undefined) validateVector3(transform.position, 'transform.position', levelIndex, errors);
  if(transform.rotation!==undefined) validateVector3(transform.rotation, 'transform.rotation', levelIndex, errors);
  if(transform.scale!==undefined){
    const s=transform.scale;
    const vectorScale=Array.isArray(s)&&s.length===3&&s.every(isFiniteNumber);
    const scalarScale=isFiniteNumber(s);
    if(!vectorScale&&!scalarScale){
      pushIssue(errors, levelIndex, 'transform.scale.invalid', 'transform.scale must be a finite number or an array of 3 finite numbers.');
    }
  }
}

function validateSceneConfig(sceneConfig, levelIndex, errors){
  if(sceneConfig==null) return;
  if(!isObject(sceneConfig)){
    pushIssue(errors, levelIndex, 'sceneConfig.invalid-type', 'sceneConfig must be an object when provided.');
    return;
  }

  if(sceneConfig.fog!==undefined){
    const fog=sceneConfig.fog;
    const valid=Array.isArray(fog)&&fog.length===2&&isFiniteNumber(fog[0])&&isFiniteNumber(fog[1]);
    if(!valid) pushIssue(errors, levelIndex, 'sceneConfig.fog.invalid', 'sceneConfig.fog must be [colorHexNumber, densityNumber].');
  }

  if(sceneConfig.background!==undefined&&!isFiniteNumber(sceneConfig.background)){
    pushIssue(errors, levelIndex, 'sceneConfig.background.invalid', 'sceneConfig.background must be a finite number.');
  }

  if(sceneConfig.spawn!==undefined) validateVector3(sceneConfig.spawn, 'sceneConfig.spawn', levelIndex, errors);

  if(sceneConfig.yaw!==undefined&&!isFiniteNumber(sceneConfig.yaw)){
    pushIssue(errors, levelIndex, 'sceneConfig.yaw.invalid', 'sceneConfig.yaw must be a finite number.');
  }

  if(sceneConfig.pitch!==undefined&&!isFiniteNumber(sceneConfig.pitch)){
    pushIssue(errors, levelIndex, 'sceneConfig.pitch.invalid', 'sceneConfig.pitch must be a finite number.');
  }

  if(sceneConfig.bounds!==undefined){
    if(!isObject(sceneConfig.bounds)){
      pushIssue(errors, levelIndex, 'sceneConfig.bounds.invalid-type', 'sceneConfig.bounds must be an object when provided.');
    }else{
      if(sceneConfig.bounds.insetX!==undefined&&!isFiniteNumber(sceneConfig.bounds.insetX)){
        pushIssue(errors, levelIndex, 'sceneConfig.bounds.insetX.invalid', 'sceneConfig.bounds.insetX must be a finite number.');
      }
      if(sceneConfig.bounds.insetZ!==undefined&&!isFiniteNumber(sceneConfig.bounds.insetZ)){
        pushIssue(errors, levelIndex, 'sceneConfig.bounds.insetZ.invalid', 'sceneConfig.bounds.insetZ must be a finite number.');
      }
    }
  }
}

function validateMaterialTuning(materialTuning, levelIndex, errors){
  if(materialTuning==null) return;
  if(!isObject(materialTuning)){
    pushIssue(errors, levelIndex, 'materialTuning.invalid-type', 'materialTuning must be an object when provided.');
    return;
  }

  const numericFields=['envMapIntensity','roughness','metalness','normalScale'];
  numericFields.forEach(field=>{
    if(materialTuning[field]!==undefined&&!isFiniteNumber(materialTuning[field])){
      pushIssue(errors, levelIndex, `materialTuning.${field}.invalid`, `materialTuning.${field} must be a finite number.`);
    }
  });

  if(materialTuning.flatShading!==undefined&&typeof materialTuning.flatShading!=='boolean'){
    pushIssue(errors, levelIndex, 'materialTuning.flatShading.invalid', 'materialTuning.flatShading must be a boolean.');
  }
}

export function validateRoomAssetRegistry(registry){
  const errors=[];
  const warnings=[];

  if(!isObject(registry)){
    return {
      ok:false,
      errors:[{ levelIndex:-1, code:'registry.invalid-type', message:'Room asset registry must be an object keyed by level index.' }],
      warnings,
    };
  }

  Object.entries(registry).forEach(([levelKey, entry])=>{
    const levelIndex=Number(levelKey);

    if(!isObject(entry)){
      pushIssue(errors, levelIndex, 'entry.invalid-type', 'Room asset entry must be an object.');
      return;
    }

    if(typeof entry.enabled!=='boolean'){
      pushIssue(errors, levelIndex, 'entry.enabled.invalid', 'entry.enabled must be a boolean.');
    }

    if(typeof entry.key!=='string'||!entry.key.trim()){
      pushIssue(warnings, levelIndex, 'entry.key.missing', 'entry.key should be a non-empty string for diagnostics and analytics.');
    }

    if(typeof entry.label!=='string'||!entry.label.trim()){
      pushIssue(warnings, levelIndex, 'entry.label.missing', 'entry.label should be a non-empty string for migration tracking.');
    }

    if(entry.hideProcedural!==undefined&&typeof entry.hideProcedural!=='boolean'){
      pushIssue(errors, levelIndex, 'entry.hideProcedural.invalid', 'entry.hideProcedural must be a boolean when provided.');
    }

    if(entry.useEnvironmentAsBackground!==undefined&&typeof entry.useEnvironmentAsBackground!=='boolean'){
      pushIssue(errors, levelIndex, 'entry.useEnvironmentAsBackground.invalid', 'entry.useEnvironmentAsBackground must be a boolean when provided.');
    }

    validateUrl(entry.modelUrl, 'modelUrl', MODEL_EXTENSIONS, levelIndex, errors);
    validateUrl(entry.environmentUrl, 'environmentUrl', ENVIRONMENT_EXTENSIONS, levelIndex, errors);
    validateTransform(entry.transform, levelIndex, errors);
    validateSceneConfig(entry.sceneConfig, levelIndex, errors);
    validateMaterialTuning(entry.materialTuning, levelIndex, errors);

    if(entry.enabled===true&&!entry.modelUrl&&!entry.environmentUrl){
      pushIssue(errors, levelIndex, 'entry.enabled-without-assets', 'Enabled room entries must provide modelUrl or environmentUrl.');
    }
  });

  return { ok:errors.length===0, errors, warnings };
}

export function formatRegistryValidationReport(report){
  const lines=[];
  report.errors.forEach(issue=>{
    lines.push(`[ERROR] level ${issue.levelIndex}: ${issue.message}`);
  });
  report.warnings.forEach(issue=>{
    lines.push(`[WARN] level ${issue.levelIndex}: ${issue.message}`);
  });
  return lines;
}
