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
]);

const phaseMatcher = (operator: JsonObject) => {
  const phase = stringOf(operator.m_nOpEndCapState, "");
  return (ending: boolean) => {
    if (phase === "PARTICLE_ENDCAP_ENDCAP_ON") return ending;
    if (phase === "PARTICLE_ENDCAP_ENDCAP_OFF") return !ending;
    return true;
  };
};

const normalizePath = (path: string) =>
  path.replaceAll("\\", "/").replace(/_c$/, "").toLowerCase();

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
      if (booleanOf(operator.m_bDisableOperator)) return false;
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
    const matches = phaseMatcher(operator);
    const endCap =
      stringOf(operator.m_nOpEndCapState, "") === "PARTICLE_ENDCAP_ENDCAP_ON";
    const emitter = compileEmitter(operator, endCap);
    if (!emitter) block("emitter", operator);
    else {
      emitters.push((system, delta, previousAge) => {
        if (!matches(system.ending)) return 0;
        if (system.released && !endCap) return 0;
        return emitter(system, delta, previousAge);
      });
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
    const matches = phaseMatcher(operator);
    if (BLOCKING.has(classOf(operator))) block("initializer", operator);
    const compiled = compileInitializer(operator);
    if (compiled)
      initializers.push((system, index) => {
        if (matches(system.ending)) compiled(system, index);
      });
    else if (!BLOCKING.has(classOf(operator)))
      report("initializer", operator, "unsupported");
  }
  const operators: FrameOperator[] = [];
  for (const operator of active(definition.m_Operators, "operator")) {
    const matches = phaseMatcher(operator);
    if (BLOCKING.has(classOf(operator))) block("operator", operator);
    const compiled = compileOperator(operator);
    if (compiled)
      operators.push((system, delta) => {
        if (matches(system.ending)) compiled(system, delta);
      });
    else if (!BLOCKING.has(classOf(operator)))
      report("operator", operator, "unsupported");
  }
  const forces: CompiledSystem["forces"] = [];
  for (const operator of active(definition.m_ForceGenerators, "force")) {
    const matches = phaseMatcher(operator);
    const compiled = compileForce(operator);
    if (compiled) {
      forces.push((system, index, out) => {
        if (matches(system.ending)) compiled(system, index, out);
        else out.set(0, 0, 0);
      });
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
      if (list(operator.m_vecTexturesInput).length > 1)
        report("renderer", operator, "approximation");
    } else report("renderer", operator, "unsupported");
  }
  const preEmission: CompiledSystem["preEmission"] = [];
  for (const operator of active(
    definition.m_PreEmissionOperators,
    "pre-emission",
  )) {
    const matches = phaseMatcher(operator);
    const compiled = compilePreEmission(operator);
    if (compiled)
      preEmission.push((points, system) => {
        if (matches(system?.ending ?? false)) compiled(points, system);
      });
    else report("pre-emission", operator, "unsupported");
  }
  const references = list(definition.m_Children);
  const usedReferences = new Set<JsonObject>();
  const children = file.children.flatMap((child) => {
    const matching = references.filter(
      (entry) =>
        normalizePath(stringOf(entry.m_ChildRef, "")) ===
        normalizePath(child.path),
    );
    const reference = matching.find(
      (entry) =>
        !usedReferences.has(entry) && !booleanOf(entry.m_bDisableChild),
    );
    if (!reference && matching.length > 0) return [];
    if (reference) usedReferences.add(reference);
    const compiled = compileSystem(child);
    compiled.lifecycle = {
      delay: Math.max(numberOf(reference?.m_flDelay, 0), 0),
      endCap: booleanOf(reference?.m_bEndCap),
    };
    return [compiled];
  });
  const constantColor = numbersOf(
    definition.m_ConstantColor,
    [255, 255, 255, 255],
  );
  const preview =
    list(definition.m_controlPointConfigurations).find(
      (config) => stringOf(config.m_name, "") === "preview",
    ) ?? list(definition.m_controlPointConfigurations)[0];
  const drivers: CompiledSystem["drivers"] = list(
    preview?.m_drivers ?? definition.m_drivers,
  ).map((driver) => {
    const attachType = stringOf(driver.m_iAttachType, "");
    const [x = 0, y = 0, z = 0] = numbersOf(driver.m_vecOffset, [0, 0, 0]);
    return {
      controlPoint: Math.min(
        Math.max(Math.floor(numberOf(driver.m_iControlPoint, 0)), 0),
        63,
      ),
      attachment: attachType.startsWith("PATTACH_POINT")
        ? stringOf(driver.m_attachmentName, "") || null
        : null,
      offset: [x, y, z],
    };
  });
  return {
    lifecycle: { delay: 0, endCap: false },
    path: file.path,
    diagnostics,
    maxParticles: Math.max(
      Math.floor(numberOf(definition.m_nMaxParticles, 1000)),
      0,
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
    constantTrailLength: Math.max(
      numberOf(definition.m_flConstantTrailLength, 0.1),
      0,
    ),
    emitters,
    continuous,
    lastEmissionTime,
    initializers,
    operators,
    forces,
    preEmission,
    renderers,
    blockedBy,
    children,
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
