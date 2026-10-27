import * as THREE from "three";
import {
  bool,
  fields,
  list,
  scalar,
  str,
  type Fields,
  type Inputs,
} from "./values";
import type { ParticleAssets } from "./assets";
import {
  layers,
  layerIndex,
  CHANNELS,
  BLENDS,
  EFFECTS,
} from "./texture-layers";

const OUTPUT_ALPHA = new Map([
  ["ALPHA", 1],
  ["ADD", 0],
  ["BLEND_ADD", -1],
  ["HALF_BLEND_ADD", 0.5],
  ["NEG_HALF_BLEND_ADD", -0.5],
  ["MOD2X", 1],
  ["LIGHTEN", 1],
]);

export function particleMaterial(
  op: Fields,
  assets: ParticleAssets,
  vertex: string,
): THREE.ShaderMaterial | null {
  const refs = layers(op),
    primary = assets.layer(refs[0]);
  if (!primary) {
    assets.warnings.add(
      `Renderer texture unavailable: ${str(refs[0]?.m_hTexture)}`,
    );
    return null;
  }
  const blend = str(
    op.m_nOutputBlendMode,
    "PARTICLE_OUTPUT_BLEND_MODE_ALPHA",
  ).replace("PARTICLE_OUTPUT_BLEND_MODE_", "");
  if (!OUTPUT_ALPHA.has(blend))
    assets.warnings.add(`Unsupported particle blend mode: ${blend}`);
  for (const input of list(op.m_vecTexturesInput).map(fields)) {
    if (!bool(input.m_bEnabled, true)) continue;
    const type = str(input.m_nTextureType, "SPRITECARD_TEXTURE_DIFFUSE");
    if (!EFFECTS.includes(type.replace("SPRITECARD_TEXTURE_", "")))
      assets.warnings.add(`Unsupported particle texture layer: ${type}`);
  }
  const textures = refs.map((ref) => assets.layer(ref) ?? primary);
  return new THREE.ShaderMaterial({
    uniforms: {
      map0: { value: textures[0] },
      map1: { value: textures[1] ?? primary },
      map2: { value: textures[2] ?? primary },
      map3: { value: textures[3] ?? primary },
      map4: { value: textures[4] ?? primary },
      layerCount: { value: refs.length },
      channels: {
        value: refs.map((ref) =>
          layerIndex(
            ref,
            "m_nTextureChannels",
            "SPRITECARD_TEXTURE_CHANNEL_",
            CHANNELS,
            1,
          ),
        ),
      },
      blends: {
        value: refs.map((ref) =>
          layerIndex(
            ref,
            "m_nTextureBlendMode",
            "SPRITECARD_TEXTURE_BLEND_",
            BLENDS,
            0,
          ),
        ),
      },
      effects: {
        value: refs.map((ref) =>
          layerIndex(ref, "m_nTextureType", "SPRITECARD_TEXTURE_", EFFECTS, 0),
        ),
      },
      layerBlend: { value: [1, 1, 1, 1, 1] },
      distortion: { value: [0, 0, 0, 0, 0] },
      zoom: { value: [0, 0, 0, 0, 0] },
      rotation: { value: [0, 0, 0, 0, 0] },
      uvTransforms: {
        value: Array.from({ length: 5 }, () => new THREE.Vector4(1, 1, 0, 0)),
      },
      opacity: { value: 1 },
      brightness: { value: 1 },
      outputAlphaFactor: { value: OUTPUT_ALPHA.get(blend) ?? 1 },
      modulate2x: { value: blend === "MOD2X" },
    },
    vertexShader: vertex,
    fragmentShader: `uniform sampler2D map0;uniform sampler2D map1;uniform sampler2D map2;uniform sampler2D map3;uniform sampler2D map4;
      uniform int layerCount;uniform int channels[5];uniform int blends[5];uniform int effects[5];uniform float layerBlend[5];uniform float distortion[5];uniform float zoom[5];uniform float rotation[5];uniform vec4 uvTransforms[5];uniform float opacity;uniform float brightness;uniform float outputAlphaFactor;uniform bool modulate2x;
      varying vec2 vUv;varying vec4 vRect0;varying vec4 vRect1;varying vec4 vRect2;varying vec4 vRect3;varying vec4 vRect4;varying vec4 vColor;
      vec4 sampleLayer(int i,vec2 uv){if(i==0)return texture2D(map0,uv);if(i==1)return texture2D(map1,uv);if(i==2)return texture2D(map2,uv);if(i==3)return texture2D(map3,uv);return texture2D(map4,uv);}
      float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}
      vec4 maskLayer(vec4 a,vec4 b,int mode){
        if(mode==0)return vec4(b.rgb,a.a);if(mode==1)return b;if(mode==2)return vec4(a.rgb,b.a);if(mode==3)return vec4(b.rgb,a.a*b.a);
        if(mode==4)return vec4(mix(a.rgb,b.rgb,b.a),a.a);if(mode==5)return vec4(mix(a.rgb,b.rgb,luma(b.rgb)),a.a);
        if(mode==6)return vec4(b.rgb,luma(b.rgb));if(mode==7)return vec4(a.rgb,luma(b.rgb));if(mode==8)return vec4(a.rgb,a.a*luma(b.rgb));
        float channel=mode==9||mode==12?b.r:mode==10||mode==13?b.g:b.b;return vec4(vec3(channel),mode>=12?channel:a.a);
      }
      vec4 blendLayer(vec4 a,vec4 b,int mode){
        if(mode==1)return a*b*2.;if(mode==2)return b;if(mode==3)return a+b;if(mode==4)return a-b;if(mode==5)return(a+b)*.5;if(mode==6)return vec4(a.rgb*luma(b.rgb),b.a);return a*b;
      }
      vec4 rect(int i){if(i==0)return vRect0;if(i==1)return vRect1;if(i==2)return vRect2;if(i==3)return vRect3;return vRect4;}
      void main(){vec4 accum=vec4(1.);vec2 previousUv=vUv;
        for(int i=0;i<5;i++){if(i>=layerCount)break;vec2 uv=vUv;
          float c=cos(rotation[i]),s=sin(rotation[i]);uv=mat2(c,-s,s,c)*(uv-.5)+.5;uv=uv*uvTransforms[i].xy+uvTransforms[i].zw;vec4 bounds=rect(i);uv=mix(bounds.xy,bounds.zw,uv);
          vec4 value=sampleLayer(i,uv);
          if(effects[i]==1||effects[i]==4){float phase=fract(zoom[i]);float eased=phase/(-.4*(1.-phase)+1.);value=mix(sampleLayer(i,(uv-.5)*mix(1.,.0625,eased)+.5),sampleLayer(i,(uv-.5)*mix(4.,1.,eased)+.5),eased*eased);}
          if(effects[i]==3||effects[i]==4)value=sampleLayer(max(0,i-1),previousUv-(value.rg-.5)*2.*distortion[i]*.125*value.a);
          if(effects[i]==2)value=sampleLayer(i,vec2(luma(accum.rgb),.5));
          accum=max(mix(accum,blendLayer(accum,maskLayer(accum,value,channels[i]),blends[i]),layerBlend[i]),vec4(0.));previousUv=uv;
        }
        vec4 color=accum*vColor;color.rgb*=brightness;color.a*=opacity;if(color.a<.002)discard;gl_FragColor=color;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        color=gl_FragColor;
        if(modulate2x){color.rgb=mix(vec3(.5),color.rgb,color.a);}
        else{color.rgb*=mix(color.a,1.,clamp(-outputAlphaFactor,0.,1.));color.a*=abs(outputAlphaFactor);}
        gl_FragColor=color;
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: blend === "MOD2X" ? THREE.DstColorFactor : THREE.OneFactor,
    blendDst:
      blend === "LIGHTEN"
        ? THREE.OneFactor
        : blend === "MOD2X"
          ? THREE.SrcColorFactor
          : THREE.OneMinusSrcAlphaFactor,
    blendEquation: blend === "LIGHTEN" ? THREE.MaxEquation : THREE.AddEquation,
  });
}
export function updateMaterial(
  material: THREE.ShaderMaterial,
  op: Fields,
  ctx: Inputs,
  fade: number,
) {
  material.uniforms.opacity.value = scalar(op.m_flAlphaScale, ctx, 1) * fade;
  material.uniforms.brightness.value = scalar(op.m_flOverbrightFactor, ctx, 1);
  const refs = layers(op),
    transforms: THREE.Vector4[] = [],
    strengths: number[] = [],
    distortion: number[] = [],
    zoom: number[] = [],
    rotation: number[] = [];
  for (let i = 0; i < 5; i++) {
    const ref = refs[i] ?? {},
      controls = fields(ref.m_TextureControls);
    transforms.push(
      new THREE.Vector4(
        scalar(controls.m_flFinalTextureScaleU, ctx, 1),
        scalar(controls.m_flFinalTextureScaleV, ctx, 1),
        scalar(controls.m_flFinalTextureOffsetU, ctx),
        scalar(controls.m_flFinalTextureOffsetV, ctx),
      ),
    );
    strengths.push(scalar(ref.m_flTextureBlend, ctx, 1));
    distortion.push(scalar(controls.m_flDistortion, ctx));
    zoom.push(scalar(controls.m_flZoomScale, ctx));
    rotation.push(
      (scalar(controls.m_flFinalTextureUVRotation, ctx) * Math.PI) / 180,
    );
  }
  material.uniforms.uvTransforms.value = transforms;
  material.uniforms.layerBlend.value = strengths;
  material.uniforms.distortion.value = distortion;
  material.uniforms.zoom.value = zoom;
  material.uniforms.rotation.value = rotation;
}
export const SPRITE_VERTEX = `attribute vec3 center;attribute vec3 axisX;attribute vec3 axisY;attribute vec4 rgba;attribute vec4 rect0;attribute vec4 rect1;attribute vec4 rect2;attribute vec4 rect3;attribute vec4 rect4;
 varying vec2 vUv;varying vec4 vRect0;varying vec4 vRect1;varying vec4 vRect2;varying vec4 vRect3;varying vec4 vRect4;varying vec4 vColor;
 void main(){vec3 p=center+axisX*position.x+axisY*position.y;vUv=position.xy*.5+.5;vRect0=rect0;vRect1=rect1;vRect2=rect2;vRect3=rect3;vRect4=rect4;vColor=rgba;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
export const RIBBON_VERTEX = `attribute vec4 rgba;varying vec2 vUv;varying vec4 vRect0;varying vec4 vRect1;varying vec4 vRect2;varying vec4 vRect3;varying vec4 vRect4;varying vec4 vColor;
 void main(){vUv=uv;vRect0=vRect1=vRect2=vRect3=vRect4=vec4(0.,0.,1.,1.);vColor=rgba;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
