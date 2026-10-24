import {
  MAX_OPERATORS,
  list,
  numberOf,
  stringOf,
  numbersOf,
  classOf,
  booleanOf,
} from "./definition";
import { unsupportedInputTypes } from "./inputs";
import {
  type CompiledSystem,
  type InitOperator,
  type FrameOperator,
  type Emitter,
  type SpriteRendererSpec,
  type ParticleStage,
  type ParticleDiagnostic,
} from "./types";
import { type JsonObject, type JsonValue } from "./json";
import { compileInitializer } from "./initializers";
import { compileOperator, compileForce } from "./operators";
import { compileEmitter, compilePreEmission } from "./emission";
import { compileRenderer } from "./renderers";

/** Classes that would draw the effect wrong in a preview, so their system is skipped. */
const BLOCKING = new Set([
  "C_INIT_InitSkinnedPositionFromCPSnapshot",
  "C_OP_SnapshotRigidSkinToBones",
  "C_INIT_CreateOnModel",
  "C_INIT_CreateOnModelAtHeight",
  "C_INIT_CreateFromParentParticles",
  "C_INIT_CreateSequentialPath",
  "C_INIT_CreateSequentialPathV2",
]);

const endCapOnly = (operator: JsonObject) =>
  stringOf(operator.m_nOpEndCapState, "") === "PARTICLE_ENDCAP_ENDCAP_ON";

export interface DefinitionFile {
  path: string;
  definition: JsonObject;
  children: DefinitionFile[];
}

/** Compile the supported subset and retain every omitted class as diagnostics. */
export const compileSystem = (file: DefinitionFile): CompiledSystem => {
  const definition = file.definition;
  const diagnostics: ParticleDiagnostic[] = [];
  let blockedBy: string | null = null;
  const report = (
    stage: ParticleStage,
    operator: JsonObject,
    code: ParticleDiagnostic["code"],
    detail?: string,
  ) => {
    const diagnostic: ParticleDiagnostic = {
      path: file.path,
      stage,
      className: classOf(operator),
      code,
    };
    if (detail) diagnostic.detail = detail;
    diagnostics.push(diagnostic);
  };
  let remainingOperators = MAX_OPERATORS;
  const active = (value: JsonValue | undefined, stage: ParticleStage) => {
    const allowance = remainingOperators;
    const length = Array.isArray(value) ? value.length : 0;
    remainingOperators -= Math.min(length, allowance);
    if (length > allowance)
      diagnostics.push({
        path: file.path,
        stage,
        className: "",
        code: "system-limit",
        detail: "operator-budget",
      });
    return list(value, allowance).filter((operator) => {
      if (booleanOf(operator.m_bDisableOperator) || endCapOnly(operator))
        return false;
      const unsupported = unsupportedInputTypes(operator);
      for (const type of unsupported)
        report(stage, operator, "unsupported-input", type);
      return !unsupported.includes("input-scan-limit");
    });
  };
  const block = (stage: ParticleStage, operator: JsonObject) => {
    blockedBy ??= classOf(operator);
    report(stage, operator, "blocked");
  };
  const emitters: Emitter[] = [];
  let continuous = false;
  let lastEmissionTime = 0;
  for (const operator of active(definition.m_Emitters, "emitter")) {
    const emitter = compileEmitter(operator);
    if (!emitter) block("emitter", operator);
    else {
      emitters.push(emitter);
      lastEmissionTime = Math.max(
        lastEmissionTime,
        numberOf(operator.m_flStartTime, 0),
      );
      if (classOf(operator) !== "C_OP_InstantaneousEmitter") continuous = true;
      if (classOf(operator) === "C_OP_NoiseEmitter")
        report("emitter", operator, "approximation");
    }
  }
  const initializers: InitOperator[] = [];
  for (const operator of active(definition.m_Initializers, "initializer")) {
    if (BLOCKING.has(classOf(operator))) block("initializer", operator);
    const compiled = compileInitializer(operator);
    if (compiled) initializers.push(compiled);
    else if (!BLOCKING.has(classOf(operator)))
      report("initializer", operator, "unsupported");
  }
  const operators: FrameOperator[] = [];
  for (const operator of active(definition.m_Operators, "operator")) {
    if (BLOCKING.has(classOf(operator))) block("operator", operator);
    const compiled = compileOperator(operator);
    if (compiled) operators.push(compiled);
    else if (!BLOCKING.has(classOf(operator)))
      report("operator", operator, "unsupported");
  }
  const forces: CompiledSystem["forces"] = [];
  for (const operator of active(definition.m_ForceGenerators, "force")) {
    const compiled = compileForce(operator);
    if (compiled) {
      forces.push(compiled);
      if (classOf(operator) === "C_OP_CurlNoiseForce")
        report("force", operator, "approximation");
    } else report("force", operator, "unsupported");
  }
  for (const operator of active(definition.m_Constraints, "constraint"))
    report("constraint", operator, "unsupported");
  const renderers: SpriteRendererSpec[] = [];
  for (const operator of active(definition.m_Renderers, "renderer")) {
    const compiled = compileRenderer(operator);
    if (compiled) {
      renderers.push(compiled);
      if (
        classOf(operator) === "C_OP_RenderTrails" ||
        list(operator.m_vecTexturesInput).length > 1
      )
        report("renderer", operator, "approximation");
    } else report("renderer", operator, "unsupported");
  }
  const preEmission: CompiledSystem["preEmission"] = [];
  for (const operator of active(
    definition.m_PreEmissionOperators,
    "pre-emission",
  )) {
    const compiled = compilePreEmission(operator);
    if (compiled) preEmission.push(compiled);
    else report("pre-emission", operator, "unsupported");
  }
  for (const child of list(definition.m_Children)) {
    if (booleanOf(child.m_bDisableChild)) continue;
    if (booleanOf(child.m_bEndCap) || numberOf(child.m_flDelay, 0) > 0) {
      diagnostics.push({
        path: file.path,
        stage: "definition",
        className: "m_Children",
        code: "approximation",
        detail: stringOf(child.m_ChildRef, ""),
      });
    }
  }
  const constantColor = numbersOf(
    definition.m_ConstantColor,
    [255, 255, 255, 255],
  );
  const preview =
    list(definition.m_controlPointConfigurations).find(
      (config) => stringOf(config.m_name, "") === "preview",
    ) ?? list(definition.m_controlPointConfigurations)[0];
  const drivers = list(preview?.m_drivers).map((driver) => {
    const attachType = stringOf(driver.m_iAttachType, "");
    return {
      controlPoint: numberOf(driver.m_iControlPoint, 0),
      attachment: attachType.startsWith("PATTACH_POINT")
        ? stringOf(driver.m_attachmentName, "") || null
        : null,
    };
  });
  return {
    path: file.path,
    diagnostics,
    maxParticles: Math.max(
      Math.floor(numberOf(definition.m_nMaxParticles, 1000)),
      1,
    ),
    constantLifetime: numberOf(definition.m_flConstantLifespan, 1),
    constantRadius: numberOf(definition.m_flConstantRadius, 5),
    constantColor: [
      (constantColor[0] ?? 255) / 255,
      (constantColor[1] ?? 255) / 255,
      (constantColor[2] ?? 255) / 255,
      (constantColor[3] ?? 255) / 255,
    ],
    constantSequence: numberOf(definition.m_nConstantSequenceNumber, 0),
    emitters,
    continuous,
    lastEmissionTime,
    initializers,
    operators,
    forces,
    preEmission,
    renderers,
    blockedBy,
    children: file.children.map(compileSystem),
    drivers,
  };
};

export const particleSystemDiagnostics = (
  systems: CompiledSystem[],
): ParticleDiagnostic[] =>
  systems.flatMap((system) => [
    ...system.diagnostics,
    ...particleSystemDiagnostics(system.children),
  ]);
