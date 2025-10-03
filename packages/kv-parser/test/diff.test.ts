import { describe, expect, it } from "vitest";
import { DiffApplicator, DiffGenerator } from "../src";
import { KvDocument } from "../src/document";
import { parseKvWithAST } from "../src/parser";

describe("Diff System", () => {
  describe("DiffGenerator", () => {
    describe("data diff", () => {
      it("should detect added keys", () => {
        const source = {
          Root: {
            Key1: "Value1",
          },
        };

        const target = {
          Root: {
            Key1: "Value1",
            Key2: "Value2",
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);

        expect(diff.changes).toHaveLength(1);
        expect(diff.changes[0].op).toBe("add");
        expect(diff.changes[0].path).toBe("Root.Key2");
        expect(diff.changes[0].newValue).toBe("Value2");
      });

      it("should detect removed keys", () => {
        const source = {
          Root: {
            Key1: "Value1",
            Key2: "Value2",
          },
        };

        const target = {
          Root: {
            Key1: "Value1",
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);

        expect(diff.changes).toHaveLength(1);
        expect(diff.changes[0].op).toBe("remove");
        expect(diff.changes[0].path).toBe("Root.Key2");
        expect(diff.changes[0].oldValue).toBe("Value2");
      });

      it("should detect modified values", () => {
        const source = {
          Root: {
            Key: "OldValue",
          },
        };

        const target = {
          Root: {
            Key: "NewValue",
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);

        expect(diff.changes).toHaveLength(1);
        expect(diff.changes[0].op).toBe("replace");
        expect(diff.changes[0].path).toBe("Root.Key");
        expect(diff.changes[0].oldValue).toBe("OldValue");
        expect(diff.changes[0].newValue).toBe("NewValue");
      });

      it("should detect nested changes", () => {
        const source = {
          Root: {
            Nested: {
              Key: "OldValue",
            },
          },
        };

        const target = {
          Root: {
            Nested: {
              Key: "NewValue",
            },
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);

        expect(diff.changes).toHaveLength(1);
        expect(diff.changes[0].path).toBe("Root.Nested.Key");
      });

      it("should detect multiple changes", () => {
        const source = {
          Root: {
            Key1: "Value1",
            Key2: "Value2",
          },
        };

        const target = {
          Root: {
            Key1: "ModifiedValue1",
            Key3: "Value3",
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);

        expect(diff.changes).toHaveLength(3);

        const ops = diff.changes.map((c) => c.op);
        expect(ops).toContain("replace"); // Key1 modified
        expect(ops).toContain("remove"); // Key2 removed
        expect(ops).toContain("add"); // Key3 added
      });

      it("should detect no changes", () => {
        const source = {
          Root: {
            Key: "Value",
          },
        };

        const target = {
          Root: {
            Key: "Value",
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);

        expect(diff.changes).toHaveLength(0);
      });

      it("should handle array changes", () => {
        const source = {
          Root: {
            Array: ["Item1", "Item2"],
          },
        };

        const target = {
          Root: {
            Array: ["Item1", "Item2", "Item3"],
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);

        expect(diff.changes).toHaveLength(1);
        expect(diff.changes[0].op).toBe("replace");
      });

      it("should not detect changes for identical arrays", () => {
        const source = {
          Root: {
            Array: ["Item1", "Item2"],
          },
        };

        const target = {
          Root: {
            Array: ["Item1", "Item2"],
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);

        expect(diff.changes).toHaveLength(0);
      });
    });

    describe("AST diff", () => {
      it("should generate diff from AST", () => {
        const source = parseKvWithAST(`"Root" { "Key" "OldValue" }`);
        const target = parseKvWithAST(`"Root" { "Key" "NewValue" }`);

        const diff = DiffGenerator.generateASTDiff(source.ast, target.ast);

        expect(diff.changes).toHaveLength(1);
        expect(diff.changes[0].op).toBe("replace");
        expect(diff.changes[0].path).toBe("Root.Key");
      });

      it("should preserve AST references in diff", () => {
        const source = parseKvWithAST(`"Root" { "Key" "Value" }`);
        const target = parseKvWithAST(
          `"Root" { "Key" "Value" "New" "Value2" }`,
        );

        const diff = DiffGenerator.generateASTDiff(source.ast, target.ast);

        expect(diff.sourceAst).toBe(source.ast);
        expect(diff.targetAst).toBe(target.ast);
      });
    });

    describe("diff utilities", () => {
      it("should format diff as readable text", () => {
        const source = { Root: { Key: "OldValue" } };
        const target = { Root: { Key: "NewValue" } };

        const diff = DiffGenerator.generateDataDiff(source, target);
        const formatted = DiffGenerator.formatDiff(diff);

        expect(formatted).toContain("Replace");
        expect(formatted).toContain("Root.Key");
        expect(formatted).toContain("OldValue");
        expect(formatted).toContain("NewValue");
      });

      it("should generate unified diff format", () => {
        const source = { Root: { Key: "OldValue" } };
        const target = { Root: { Key: "NewValue" } };

        const diff = DiffGenerator.generateDataDiff(source, target);
        const unified = DiffGenerator.generateUnifiedDiff(diff);

        expect(unified).toContain("---");
        expect(unified).toContain("+++");
        expect(unified).toContain("-Root.Key");
        expect(unified).toContain("+Root.Key");
      });

      it("should check equality", () => {
        const obj1 = { Root: { Key: "Value" } };
        const obj2 = { Root: { Key: "Value" } };
        const obj3 = { Root: { Key: "DifferentValue" } };

        expect(DiffGenerator.areEqual(obj1, obj2)).toBe(true);
        expect(DiffGenerator.areEqual(obj1, obj3)).toBe(false);
      });

      it("should provide diff statistics", () => {
        const source = {
          Root: {
            Key1: "Value1",
            Key2: "Value2",
            Key3: "Value3",
          },
        };

        const target = {
          Root: {
            Key1: "ModifiedValue",
            Key4: "Value4",
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);
        const stats = DiffGenerator.getStats(diff);

        // Key1: modified
        // Key2: removed
        // Key3: removed
        // Key4: added
        expect(stats.total).toBe(4);
        expect(stats.modified).toBe(1); // Key1
        expect(stats.removed).toBe(2); // Key2, Key3
        expect(stats.added).toBe(1); // Key4
      });
    });
  });

  describe("DiffApplicator", () => {
    describe("apply to data", () => {
      it("should apply add operation", () => {
        const source = {
          Root: {
            Key1: "Value1",
          },
        };

        const target = {
          Root: {
            Key1: "Value1",
            Key2: "Value2",
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);
        const result = DiffApplicator.applyToData(source, diff);

        expect(result).toEqual(target);
      });

      it("should apply remove operation", () => {
        const source = {
          Root: {
            Key1: "Value1",
            Key2: "Value2",
          },
        };

        const target = {
          Root: {
            Key1: "Value1",
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);
        const result = DiffApplicator.applyToData(source, diff);

        expect(result).toEqual(target);
      });

      it("should apply replace operation", () => {
        const source = {
          Root: {
            Key: "OldValue",
          },
        };

        const target = {
          Root: {
            Key: "NewValue",
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);
        const result = DiffApplicator.applyToData(source, diff);

        expect(result).toEqual(target);
      });

      it("should apply multiple operations", () => {
        const source = {
          Root: {
            Key1: "Value1",
            Key2: "Value2",
          },
        };

        const target = {
          Root: {
            Key1: "ModifiedValue1",
            Key3: "Value3",
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);
        const result = DiffApplicator.applyToData(source, diff);

        expect(result).toEqual(target);
      });

      it("should not modify source object", () => {
        const source = {
          Root: {
            Key: "OldValue",
          },
        };

        const target = {
          Root: {
            Key: "NewValue",
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);
        DiffApplicator.applyToData(source, diff);

        // Source should be unchanged
        expect(source.Root.Key).toBe("OldValue");
      });
    });

    describe("apply to AST", () => {
      it("should apply diff to AST", () => {
        const source = parseKvWithAST(`"Root" { "Key" "OldValue" }`);
        const target = parseKvWithAST(`"Root" { "Key" "NewValue" }`);

        const diff = DiffGenerator.generateASTDiff(source.ast, target.ast);
        const resultAst = DiffApplicator.applyToAST(source.ast, diff);

        // Extract data from result
        const resultData = DiffGenerator.astToData(resultAst);
        expect(resultData.Root.Key).toBe("NewValue");
      });
    });

    describe("validation", () => {
      it("should validate applicable diffs", () => {
        const source = {
          Root: {
            Key: "Value",
          },
        };

        const target = {
          Root: {
            Key: "NewValue",
          },
        };

        const diff = DiffGenerator.generateDataDiff(source, target);
        const validation = DiffApplicator.validateDiff(source, diff);

        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      });

      it("should detect invalid remove operations", () => {
        const source = {
          Root: {
            Key1: "Value1",
          },
        };

        const invalidDiff = {
          changes: [
            {
              op: "remove" as const,
              path: "Root.NonExistentKey",
              oldValue: "Something",
            },
          ],
          sourceAst: DiffGenerator.createEmptyDocument(),
        };

        const validation = DiffApplicator.validateDiff(source, invalidDiff);

        expect(validation.valid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe("KvDocument integration", () => {
    it("should generate diff between documents", () => {
      const doc1 = new KvDocument();
      doc1.loadFromString(`"Root" { "Key" "Value1" }`);

      const doc2 = new KvDocument();
      doc2.loadFromString(`"Root" { "Key" "Value2" }`);

      const diff = doc1.diff(doc2);

      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0].op).toBe("replace");
    });

    it("should apply diff to document", () => {
      const doc1 = new KvDocument();
      doc1.loadFromString(`"Root" { "Key" "OldValue" }`);

      const doc2 = new KvDocument();
      doc2.loadFromString(`"Root" { "Key" "NewValue" }`);

      const diff = doc1.diff(doc2);
      doc1.applyDiff(diff);

      expect(doc1.get("Root.Key")).toBe("NewValue");
    });

    it("should check document equality", () => {
      const doc1 = new KvDocument();
      doc1.loadFromString(`"Root" { "Key" "Value" }`);

      const doc2 = new KvDocument();
      doc2.loadFromString(`"Root" { "Key" "Value" }`);

      const doc3 = new KvDocument();
      doc3.loadFromString(`"Root" { "Key" "DifferentValue" }`);

      expect(doc1.equals(doc2)).toBe(true);
      expect(doc1.equals(doc3)).toBe(false);
    });

    it("should provide diff summary", () => {
      const doc1 = new KvDocument();
      doc1.loadFromString(`"Root" { "Key" "OldValue" }`);

      const doc2 = new KvDocument();
      doc2.loadFromString(`"Root" { "Key" "NewValue" }`);

      const summary = doc1.diffSummary(doc2);

      expect(summary).toContain("Replace");
      expect(summary).toContain("Root.Key");
    });

    it("should provide diff statistics", () => {
      const doc1 = new KvDocument();
      doc1.loadFromString(`"Root" { "Key1" "Value1" "Key2" "Value2" }`);

      const doc2 = new KvDocument();
      doc2.loadFromString(`"Root" { "Key1" "ModifiedValue" "Key3" "Value3" }`);

      const stats = doc1.diffStats(doc2);

      expect(stats.modified).toBe(1); // Key1
      expect(stats.removed).toBe(1); // Key2
      expect(stats.added).toBe(1); // Key3
      expect(stats.total).toBe(3);
    });
  });

  describe("round-trip diff application", () => {
    it("should maintain data integrity through diff round-trip", () => {
      const original = {
        Root: {
          Key1: "Value1",
          Key2: "Value2",
          Nested: {
            NestedKey: "NestedValue",
          },
        },
      };

      const modified = {
        Root: {
          Key1: "ModifiedValue1",
          Key2: "Value2",
          Nested: {
            NestedKey: "ModifiedNestedValue",
          },
          Key3: "Value3",
        },
      };

      // Generate diff
      const diff = DiffGenerator.generateDataDiff(original, modified);

      // Apply diff
      const result = DiffApplicator.applyToData(original, diff);

      // Result should match modified
      expect(result).toEqual(modified);
    });

    it("should handle complex nested structures", () => {
      const doc1 = new KvDocument();
      doc1.loadFromString(`
"GameInfo"
{
    "game"    "citadel"
    "FileSystem"
    {
        "SearchPath"    "citadel"
        "SearchPath"    "core"
    }
}
      `);

      const doc2 = new KvDocument();
      doc2.loadFromString(`
"GameInfo"
{
    "game"    "my_mod"
    "FileSystem"
    {
        "SearchPath"    "citadel"
        "SearchPath"    "core"
        "SearchPath"    "my_mod"
    }
}
      `);

      const diff = doc1.diff(doc2);
      doc1.applyDiff(diff);

      expect(doc1.get("GameInfo.game")).toBe("my_mod");
    });
  });
});
