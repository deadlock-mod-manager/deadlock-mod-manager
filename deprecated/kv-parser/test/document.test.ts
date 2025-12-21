import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KvDocument } from "../src/document";

describe("KvDocument", () => {
  describe("basic operations", () => {
    it("should create an empty document", () => {
      const doc = new KvDocument();
      expect(doc.getData()).toEqual({});
    });

    it("should load from string", () => {
      const doc = new KvDocument();
      const kvString = `
"Root"
{
    "Key"    "Value"
}
`;
      doc.loadFromString(kvString);
      expect(doc.get("Root")).toBeDefined();
      expect(doc.get("Root.Key")).toBe("Value");
    });

    it("should get data", () => {
      const doc = new KvDocument();
      doc.loadFromString(`"Root" { "Key" "Value" }`);
      const data = doc.getData();
      expect(data).toHaveProperty("Root");
    });
  });

  describe("path-based access", () => {
    it("should get value by path", () => {
      const doc = new KvDocument();
      doc.loadFromString(`
"GameInfo"
{
    "game"    "citadel"
    "FileSystem"
    {
        "SearchPath"    "core"
    }
}
`);

      expect(doc.get("GameInfo.game")).toBe("citadel");
      expect(doc.get("GameInfo.FileSystem.SearchPath")).toBe("core");
    });

    it("should return undefined for non-existent paths", () => {
      const doc = new KvDocument();
      doc.loadFromString(`"Root" { "Key" "Value" }`);

      expect(doc.get("Root.NonExistent")).toBeUndefined();
      expect(doc.get("NonExistent")).toBeUndefined();
    });

    it("should set value by path", () => {
      const doc = new KvDocument();
      doc.loadFromString(`"Root" { "Key" "Value" }`);

      doc.set("Root.Key", "NewValue");
      expect(doc.get("Root.Key")).toBe("NewValue");
    });

    it("should create intermediate objects when setting", () => {
      const doc = new KvDocument();
      doc.loadFromString(`"Root" {}`);

      doc.set("Root.Nested.Deep.Key", "Value");
      expect(doc.get("Root.Nested.Deep.Key")).toBe("Value");
    });

    it("should delete value by path", () => {
      const doc = new KvDocument();
      doc.loadFromString(`
"Root"
{
    "Key1"    "Value1"
    "Key2"    "Value2"
}
`);

      expect(doc.delete("Root.Key1")).toBe(true);
      expect(doc.get("Root.Key1")).toBeUndefined();
      expect(doc.get("Root.Key2")).toBe("Value2");
    });

    it("should return false when deleting non-existent path", () => {
      const doc = new KvDocument();
      doc.loadFromString(`"Root" { "Key" "Value" }`);

      expect(doc.delete("Root.NonExistent")).toBe(false);
    });

    it("should check if path exists", () => {
      const doc = new KvDocument();
      doc.loadFromString(`"Root" { "Key" "Value" }`);

      expect(doc.has("Root.Key")).toBe(true);
      expect(doc.has("Root.NonExistent")).toBe(false);
    });
  });

  describe("collection operations", () => {
    it("should get keys", () => {
      const doc = new KvDocument();
      doc.loadFromString(`
"Root"
{
    "Key1"    "Value1"
    "Key2"    "Value2"
}
`);

      const keys = doc.keys("Root");
      expect(keys).toContain("Key1");
      expect(keys).toContain("Key2");
      expect(keys.length).toBe(2);
    });

    it("should get root keys when no path provided", () => {
      const doc = new KvDocument();
      doc.loadFromString(`
{
    "Root1" { "Key" "Value" }
    "Root2" { "Key" "Value" }
}
`);

      const keys = doc.keys();
      expect(keys).toContain("Root1");
      expect(keys).toContain("Root2");
    });

    it("should get values", () => {
      const doc = new KvDocument();
      doc.loadFromString(`
"Root"
{
    "Key1"    "Value1"
    "Key2"    "Value2"
}
`);

      const values = doc.values("Root");
      expect(values).toContain("Value1");
      expect(values).toContain("Value2");
    });

    it("should get entries", () => {
      const doc = new KvDocument();
      doc.loadFromString(`
"Root"
{
    "Key1"    "Value1"
    "Key2"    "Value2"
}
`);

      const entries = doc.entries("Root");
      expect(entries).toEqual([
        ["Key1", "Value1"],
        ["Key2", "Value2"],
      ]);
    });
  });

  describe("modify and save", () => {
    it("should modify value and save", () => {
      const doc = new KvDocument();
      const tempFile = resolve(tmpdir(), `kv-test-${Date.now()}.txt`);

      // Create initial file
      writeFileSync(
        tempFile,
        `
"GameInfo"
{
    "game"    "citadel"
    "title"   "Citadel"
}
`,
        "utf-8",
      );

      try {
        // Load, modify, save
        doc.load(tempFile);
        expect(doc.get("GameInfo.game")).toBe("citadel");

        doc.set("GameInfo.game", "new_game");
        doc.save();

        // Load again and verify
        const doc2 = new KvDocument();
        doc2.load(tempFile);
        expect(doc2.get("GameInfo.game")).toBe("new_game");
        expect(doc2.get("GameInfo.title")).toBe("Citadel"); // Other values preserved
      } finally {
        unlinkSync(tempFile);
      }
    });

    it("should save to different file", () => {
      const doc = new KvDocument();
      const tempFile1 = resolve(tmpdir(), `kv-test-1-${Date.now()}.txt`);
      const tempFile2 = resolve(tmpdir(), `kv-test-2-${Date.now()}.txt`);

      writeFileSync(tempFile1, `"Root" { "Key" "Value" }`, "utf-8");

      try {
        doc.load(tempFile1);
        doc.set("Root.Key", "NewValue");
        doc.saveAs(tempFile2);

        // Verify both files
        const doc1 = new KvDocument();
        doc1.load(tempFile1);
        expect(doc1.get("Root.Key")).toBe("Value"); // Original unchanged

        const doc2 = new KvDocument();
        doc2.load(tempFile2);
        expect(doc2.get("Root.Key")).toBe("NewValue"); // New file has changes
      } finally {
        unlinkSync(tempFile1);
        unlinkSync(tempFile2);
      }
    });
  });

  describe("merge operations", () => {
    it("should merge at root", () => {
      const doc = new KvDocument();
      doc.loadFromString(`"Root1" { "Key1" "Value1" }`);

      doc.merge(undefined, { Root2: { Key2: "Value2" } });

      expect(doc.get("Root1.Key1")).toBe("Value1");
      expect(doc.get("Root2.Key2")).toBe("Value2");
    });

    it("should merge at specific path", () => {
      const doc = new KvDocument();
      doc.loadFromString(`
"Root"
{
    "Existing"    "Value"
}
`);

      doc.merge("Root", { NewKey: "NewValue" });

      expect(doc.get("Root.Existing")).toBe("Value");
      expect(doc.get("Root.NewKey")).toBe("NewValue");
    });
  });

  describe("serialization", () => {
    it("should convert to string", () => {
      const doc = new KvDocument();
      doc.loadFromString(`"Root" { "Key" "Value" }`);

      const str = doc.toString();
      expect(str).toContain("Root");
      expect(str).toContain("Key");
      expect(str).toContain("Value");
    });

    it("should convert to JSON", () => {
      const doc = new KvDocument();
      doc.loadFromString(`"Root" { "Key" "Value" }`);

      const json = doc.toJSON();
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty("Root");
      expect(parsed.Root).toHaveProperty("Key");
    });

    it("should support custom serialization options", () => {
      const doc = new KvDocument({ useTabs: true, indentSize: 2 });
      doc.loadFromString(`"Root" { "Key" "Value" }`);

      const str = doc.toString();
      expect(str).toContain("\t"); // Should use tabs
    });
  });

  describe("utility operations", () => {
    it("should clone document", () => {
      const doc = new KvDocument();
      doc.loadFromString(`"Root" { "Key" "Value" }`);

      const cloned = doc.clone();
      cloned.set("Root.Key", "NewValue");

      // Original should be unchanged
      expect(doc.get("Root.Key")).toBe("Value");
      expect(cloned.get("Root.Key")).toBe("NewValue");
    });

    it("should clear document", () => {
      const doc = new KvDocument();
      doc.loadFromString(`"Root" { "Key" "Value" }`);

      doc.clear();
      expect(doc.getData()).toEqual({});
    });
  });

  describe("real-world usage", () => {
    it("should handle gameinfo.gi structure", () => {
      const doc = new KvDocument();
      doc.loadFromString(`
"GameInfo"
{
    "game"    "citadel"
    "title"   "Citadel"
    "FileSystem"
    {
        "SearchPaths"
        {
            "Game"    "citadel"
            "Game"    "core"
        }
    }
}
`);

      // Read values
      expect(doc.get("GameInfo.game")).toBe("citadel");
      expect(doc.get("GameInfo.title")).toBe("Citadel");

      // Modify value
      doc.set("GameInfo.game", "my_mod");

      // Add new value
      doc.set("GameInfo.version", "1.0.0");

      // Verify changes
      expect(doc.get("GameInfo.game")).toBe("my_mod");
      expect(doc.get("GameInfo.version")).toBe("1.0.0");

      // Verify structure is preserved
      const data = doc.getData();
      expect(data).toHaveProperty("GameInfo");
      expect(
        (data.GameInfo as Record<string, unknown>).FileSystem,
      ).toBeDefined();
    });
  });
});
