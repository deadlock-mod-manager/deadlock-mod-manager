// Lighting math adapted from Julián Caceres' Deadlock Playground (MIT).
// See LICENSE.deadlock-playground. This is a stylized preview, not Valve's shader.
export const PLAYGROUND_TOON_LIGHTING = /* glsl */ `
uniform float uModelNprEnabled;
void RE_Direct_ModelToon(
  const in IncidentLight directLight,
  const in vec3 geometryPosition,
  const in vec3 geometryNormal,
  const in vec3 geometryViewDir,
  const in vec3 geometryClearcoatNormal,
  const in PhysicalMaterial material,
  inout ReflectedLight reflectedLight
) {
  if (uModelNprEnabled < 0.5) {
    RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    return;
  }
  float ndl = dot(geometryNormal, directLight.direction);
  float wrapped = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  float feather = mix(0.04, 0.12, 0.3);
  float band = smoothstep(0.45 - feather, 0.45 + feather, wrapped);
  vec3 shadow = mix(material.diffuseColor * 0.35 * vec3(0.75, 0.75, 0.85), material.diffuseColor * vec3(0.18, 0.16, 0.26) * 1.5, 0.4);
  vec3 diffuse = mix(shadow, material.diffuseColor * directLight.color, band);
  float ndv = clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0);
  float rim = pow(1.0 - ndv, 4.0) * clamp(ndl, 0.0, 1.0);
  diffuse += directLight.color * smoothstep(0.4, 0.7, rim) * 0.25;
  reflectedLight.directDiffuse += clamp(diffuse, vec3(0.0), vec3(1.0));
  vec3 halfVector = normalize(geometryViewDir + directLight.direction);
  float exponent = mix(8.0, 128.0, 1.0 - material.roughness);
  float specular = pow(clamp(dot(geometryNormal, halfVector), 0.0, 1.0), exponent);
  float falloff = pow(clamp(1.0 - material.roughness, 0.0, 1.0), 2.0);
  reflectedLight.directSpecular += material.specularColor * directLight.color * smoothstep(0.7, 0.85, specular) * falloff * 0.35;
}
#undef RE_Direct
#define RE_Direct RE_Direct_ModelToon
`;
