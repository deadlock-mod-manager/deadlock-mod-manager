export interface DataRepair {
  modId: string;
  sourceVpk: string;
  filePath: string;
  rowName: string;
  kind:
    | "heroDevelopmentState"
    | "inheritedDefinition"
    | "retainedDependency"
    | "currentReference"
    | "enumMapEntry"
    | "restoredGameData"
    | "restoredGameText";
  detail: string;
}

export interface DataWarning {
  modId: string;
  sourceVpk: string;
  filePath: string;
  rowName: string;
  kind:
    | "missingDefinition"
    | "unverifiedDefinition"
    | "unverifiedInheritance"
    | "missingDevelopmentState"
    | "omittedHeroDefinition"
    | "omittedEnumMapEntry"
    | "unreadableData";
  fieldPath: string;
  targetFile: string;
  targetRow: string;
  reason:
    | "definitionUnavailable"
    | "competingDefinitions"
    | "unrecognizedClassOrEnum"
    | "ambiguousTemplates"
    | "inheritanceCycle"
    | "visibilityMigrationUnverified"
    | "unreadableResource";
  detail: string;
}
