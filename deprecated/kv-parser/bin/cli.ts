#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import type { DocumentDiff } from "../src/ast";
import { ASTParser } from "../src/ast-parser";
import { ASTSerializer } from "../src/ast-serializer";
import { DiffApplicator } from "../src/diff-applicator";
import { DiffGenerator } from "../src/diff-generator";
import { parseKvFile, serializeKv } from "../src/parser";
import { Tokenizer } from "../src/tokenizer";
import type { KeyValuesObject } from "../src/types";

const logo = `
${chalk.cyan("╔═══════════════════════════════════════╗")}
${chalk.cyan("║")}  ${chalk.bold.white("KeyValues Parser CLI")}              ${chalk.cyan("║")}
${chalk.cyan("║")}  ${chalk.gray("Valve VDF Format Parser")}          ${chalk.cyan("║")}
${chalk.cyan("╚═══════════════════════════════════════╝")}
`;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function printSuccess(message: string) {
  console.log(chalk.green("✓"), message);
}

function printError(message: string) {
  console.error(chalk.red("✗"), message);
}

function printInfo(message: string) {
  console.log(chalk.blue("ℹ"), message);
}

function printKeyValue(key: string, value: string | number) {
  console.log(chalk.gray("  •"), chalk.cyan(`${key}:`), chalk.white(value));
}

function countKeys(
  obj: KeyValuesObject,
  depth = 0,
): { total: number; maxDepth: number } {
  let total = 0;
  let maxDepth = depth;

  for (const value of Object.values(obj)) {
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = countKeys(value, depth + 1);
      total += nested.total;
      maxDepth = Math.max(maxDepth, nested.maxDepth);
    } else if (Array.isArray(value)) {
      total += value.length;
    } else {
      total += 1;
    }
  }

  return { total, maxDepth };
}

// Parse command
async function parseCommand(
  filePath: string,
  options: { output?: string; json?: boolean; pretty?: boolean },
) {
  try {
    console.log(logo);

    const absolutePath = resolve(filePath);
    printInfo(`Parsing file: ${chalk.white(filePath)}`);

    const startTime = performance.now();
    const result = parseKvFile(absolutePath);
    const endTime = performance.now();
    const parseTime = (endTime - startTime).toFixed(2);

    const fileStats = Bun.file(absolutePath);
    const fileSize = fileStats.size;

    printSuccess(`Parsed successfully in ${chalk.yellow(`${parseTime}ms`)}`);

    const stats = countKeys(result);
    printKeyValue("File size", formatBytes(fileSize));
    printKeyValue("Total keys", stats.total);
    printKeyValue("Max depth", stats.maxDepth);

    if (options.output) {
      const outputPath = resolve(options.output);
      const outputContent = options.json
        ? JSON.stringify(result, null, options.pretty ? 2 : 0)
        : serializeKv(result);

      writeFileSync(outputPath, outputContent, "utf-8");
      printSuccess(`Saved to: ${chalk.white(outputPath)}`);
    } else {
      console.log(chalk.gray("\n─────────────────────────────────────────\n"));
      if (options.json) {
        console.log(JSON.stringify(result, null, options.pretty ? 2 : 0));
      } else {
        console.log(result);
      }
    }
  } catch (error) {
    printError(
      `Failed to parse file: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

// Validate command
async function validateCommand(filePath: string) {
  try {
    console.log(logo);

    const absolutePath = resolve(filePath);
    printInfo(`Validating file: ${chalk.white(filePath)}`);

    const startTime = performance.now();
    const result = parseKvFile(absolutePath);
    const endTime = performance.now();
    const parseTime = (endTime - startTime).toFixed(2);

    const stats = countKeys(result);

    printSuccess(`File is valid KeyValues format!`);
    printKeyValue("Parse time", `${parseTime}ms`);
    printKeyValue("Total keys", stats.total);
    printKeyValue("Max depth", stats.maxDepth);
  } catch (error) {
    printError(
      `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

// Format command
async function formatCommand(
  filePath: string,
  options: { output?: string; indent?: number },
) {
  try {
    console.log(logo);

    const absolutePath = resolve(filePath);
    printInfo(`Formatting file: ${chalk.white(filePath)}`);

    const result = parseKvFile(absolutePath);
    const formatted = serializeKv(result, {
      indentSize: options.indent ?? 4,
      quoteAllStrings: false,
    });

    if (options.output) {
      const outputPath = resolve(options.output);
      writeFileSync(outputPath, formatted, "utf-8");
      printSuccess(`Formatted and saved to: ${chalk.white(outputPath)}`);
    } else {
      console.log(chalk.gray("\n─────────────────────────────────────────\n"));
      console.log(formatted);
    }
  } catch (error) {
    printError(
      `Failed to format file: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

// Convert command (KV to JSON or JSON to KV)
async function convertCommand(
  filePath: string,
  options: { output?: string; to: "json" | "kv"; pretty?: boolean },
) {
  try {
    console.log(logo);

    const absolutePath = resolve(filePath);
    printInfo(`Converting file: ${chalk.white(filePath)}`);

    let result: string;

    if (options.to === "json") {
      // KV to JSON
      const parsed = parseKvFile(absolutePath);
      result = JSON.stringify(parsed, null, options.pretty ? 2 : 0);
    } else {
      // JSON to KV
      const content = readFileSync(absolutePath, "utf-8");
      const parsed = JSON.parse(content);
      result = serializeKv(parsed);
    }

    if (options.output) {
      const outputPath = resolve(options.output);
      writeFileSync(outputPath, result, "utf-8");
      printSuccess(`Converted and saved to: ${chalk.white(outputPath)}`);
    } else {
      console.log(chalk.gray("\n─────────────────────────────────────────\n"));
      console.log(result);
    }
  } catch (error) {
    printError(
      `Failed to convert file: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

// Stats command
async function statsCommand(filePath: string) {
  try {
    console.log(logo);

    const absolutePath = resolve(filePath);
    printInfo(`Analyzing file: ${chalk.white(filePath)}`);

    const startTime = performance.now();
    const result = parseKvFile(absolutePath);
    const endTime = performance.now();

    const fileStats = Bun.file(absolutePath);
    const stats = countKeys(result);

    console.log(chalk.cyan("\n📊 File Statistics\n"));
    printKeyValue("File path", absolutePath);
    printKeyValue("File size", formatBytes(fileStats.size));
    printKeyValue("Parse time", `${(endTime - startTime).toFixed(2)}ms`);

    console.log(chalk.cyan("\n📈 Structure Statistics\n"));
    printKeyValue("Total keys", stats.total);
    printKeyValue("Max depth", stats.maxDepth);
    printKeyValue("Root keys", Object.keys(result).length);

    // Count value types
    let stringCount = 0;
    let numberCount = 0;
    let objectCount = 0;
    let arrayCount = 0;

    function analyzeValues(obj: KeyValuesObject) {
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) {
          arrayCount++;
        } else if (typeof value === "object") {
          objectCount++;
          analyzeValues(value);
        } else if (typeof value === "number") {
          numberCount++;
        } else {
          stringCount++;
        }
      }
    }

    analyzeValues(result);

    console.log(chalk.cyan("\n📋 Value Types\n"));
    printKeyValue("Strings", stringCount);
    printKeyValue("Numbers", numberCount);
    printKeyValue("Objects", objectCount);
    printKeyValue("Arrays (duplicate keys)", arrayCount);
  } catch (error) {
    printError(
      `Failed to analyze file: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

// AST command
async function astCommand(
  filePath: string,
  options: {
    output?: string;
    json?: boolean;
    pretty?: boolean;
    preserveComments?: boolean;
    preserveWhitespace?: boolean;
    roundTrip?: boolean;
  },
) {
  try {
    console.log(logo);

    const absolutePath = resolve(filePath);
    printInfo(`Parsing AST from: ${chalk.white(filePath)}`);

    // Read file content
    const content = readFileSync(absolutePath, "utf-8");

    // Tokenize
    const startTokenize = performance.now();
    const tokenizer = new Tokenizer(content, {
      preserveComments: options.preserveComments ?? true,
      preserveWhitespace: options.preserveWhitespace ?? true,
    });
    const tokens = tokenizer.tokenize();
    const endTokenize = performance.now();

    // Parse AST
    const parseResult = ASTParser.parse(content, {
      preserveComments: options.preserveComments ?? true,
      preserveWhitespace: options.preserveWhitespace ?? true,
    });
    const endParse = performance.now();

    printSuccess(
      `Tokenized ${chalk.yellow(tokens.length)} tokens in ${chalk.yellow(`${(endTokenize - startTokenize).toFixed(2)}ms`)}`,
    );
    printSuccess(
      `Parsed AST in ${chalk.yellow(`${(endParse - startTokenize).toFixed(2)}ms`)}`,
    );

    console.log(chalk.cyan("\n🌳 AST Statistics\n"));
    printKeyValue("Total tokens", tokens.length);
    printKeyValue("AST nodes", countASTNodes(parseResult.ast));
    printKeyValue("Document children", parseResult.ast.children.length);
    printKeyValue(
      "Preserves comments",
      options.preserveComments ? "Yes" : "No",
    );
    printKeyValue(
      "Preserves whitespace",
      options.preserveWhitespace ? "Yes" : "No",
    );

    // Test round-trip if requested
    if (options.roundTrip) {
      console.log(chalk.cyan("\n🔄 Testing AST Round-Trip\n"));

      const startSerialize = performance.now();
      const serialized = ASTSerializer.serialize(parseResult.ast);
      const endSerialize = performance.now();

      const isIdentical = serialized === content;
      printKeyValue(
        "Serialization time",
        `${(endSerialize - startSerialize).toFixed(2)}ms`,
      );
      printKeyValue("Original size", formatBytes(content.length));
      printKeyValue("Serialized size", formatBytes(serialized.length));
      printKeyValue(
        "Perfect fidelity",
        isIdentical ? "✓ Exact match" : "✗ Differs",
      );

      if (isIdentical) {
        printSuccess(
          chalk.bold("Perfect round-trip! Output is byte-for-byte identical."),
        );
      } else {
        printError(chalk.bold("Round-trip produced different output."));
        console.log(chalk.yellow("\nDifferences:"));
        console.log(
          chalk.gray(
            `Original length: ${content.length}, Serialized length: ${serialized.length}`,
          ),
        );
      }
    }

    // Output results
    if (options.output) {
      const outputPath = resolve(options.output);
      let outputContent: string;

      if (options.json) {
        outputContent = JSON.stringify(
          parseResult.ast,
          null,
          options.pretty ? 2 : 0,
        );
      } else {
        outputContent = ASTSerializer.serialize(parseResult.ast);
      }

      writeFileSync(outputPath, outputContent, "utf-8");
      printSuccess(`Saved to: ${chalk.white(outputPath)}`);
    } else if (options.json) {
      console.log(chalk.gray("\n─────────────────────────────────────────\n"));
      console.log(
        JSON.stringify(parseResult.ast, null, options.pretty ? 2 : 0),
      );
    }
  } catch (error) {
    printError(
      `AST parsing failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

function countASTNodes(node: unknown): number {
  if (typeof node !== "object" || node === null) {
    return 0;
  }

  let count = 1;

  if ("children" in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      count += countASTNodes(child);
    }
  }

  if ("key" in node) {
    count += countASTNodes(node.key);
  }

  if ("value" in node) {
    count += countASTNodes(node.value);
  }

  return count;
}

// Diff command
async function diffCommand(
  sourceFile: string,
  targetFile: string,
  options: {
    output?: string;
    format?: "default" | "unified" | "json";
    pretty?: boolean;
  },
) {
  try {
    console.log(logo);

    const sourceAbsPath = resolve(sourceFile);
    const targetAbsPath = resolve(targetFile);

    printInfo(`Comparing files:`);
    console.log(chalk.gray("  Source:"), chalk.white(sourceFile));
    console.log(chalk.gray("  Target:"), chalk.white(targetFile));

    // Parse both files
    const startTime = performance.now();
    const sourceData = parseKvFile(sourceAbsPath);
    const targetData = parseKvFile(targetAbsPath);
    const endTime = performance.now();

    printSuccess(
      `Parsed both files in ${chalk.yellow(`${(endTime - startTime).toFixed(2)}ms`)}`,
    );

    // Generate diff
    const startDiff = performance.now();
    const diff = DiffGenerator.generateDataDiff(sourceData, targetData);
    const endDiff = performance.now();

    printSuccess(
      `Generated diff in ${chalk.yellow(`${(endDiff - startDiff).toFixed(2)}ms`)}`,
    );

    // Get statistics
    const stats = DiffGenerator.getStats(diff);

    console.log(chalk.cyan("\n📊 Diff Statistics\n"));
    printKeyValue("Total changes", stats.total);
    printKeyValue("Added", chalk.green(`+${stats.added}`));
    printKeyValue("Removed", chalk.red(`-${stats.removed}`));
    printKeyValue("Modified", chalk.yellow(`~${stats.modified}`));

    // Format output
    let output: string;
    if (options.format === "json") {
      output = JSON.stringify(diff, null, options.pretty ? 2 : 0);
    } else if (options.format === "unified") {
      output = DiffGenerator.generateUnifiedDiff(diff, sourceFile, targetFile);
    } else {
      output = DiffGenerator.formatDiff(diff);
    }

    if (options.output) {
      const outputPath = resolve(options.output);
      writeFileSync(outputPath, output, "utf-8");
      printSuccess(`Saved diff to: ${chalk.white(outputPath)}`);
    } else {
      console.log(chalk.gray("\n─────────────────────────────────────────\n"));
      if (options.format === "unified") {
        // Color the unified diff
        for (const line of output.split("\n")) {
          if (line.startsWith("+")) {
            console.log(chalk.green(line));
          } else if (line.startsWith("-")) {
            console.log(chalk.red(line));
          } else if (line.startsWith("@")) {
            console.log(chalk.cyan(line));
          } else {
            console.log(line);
          }
        }
      } else if (options.format === "json") {
        console.log(output);
      } else {
        // Color the default format
        for (const line of output.split("\n")) {
          if (line.startsWith("+")) {
            console.log(chalk.green(line));
          } else if (line.startsWith("-")) {
            console.log(chalk.red(line));
          } else if (line.startsWith("~")) {
            console.log(chalk.yellow(line));
          } else {
            console.log(line);
          }
        }
      }
    }

    if (stats.total === 0) {
      console.log(chalk.gray("\n"));
      printSuccess(chalk.bold("Files are identical!"));
    }
  } catch (error) {
    printError(
      `Diff generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

// Apply diff command
async function applyDiffCommand(
  sourceFile: string,
  diffFile: string,
  options: { output?: string; validate?: boolean },
) {
  try {
    console.log(logo);

    const sourceAbsPath = resolve(sourceFile);
    const diffAbsPath = resolve(diffFile);

    printInfo(`Applying diff:`);
    console.log(chalk.gray("  Source:"), chalk.white(sourceFile));
    console.log(chalk.gray("  Diff:"), chalk.white(diffFile));

    // Parse source file
    const sourceData = parseKvFile(sourceAbsPath);
    printSuccess("Parsed source file");

    // Load diff
    const diffContent = readFileSync(diffAbsPath, "utf-8");
    let diff: DocumentDiff;

    try {
      diff = JSON.parse(diffContent);
    } catch {
      printError("Diff file must be in JSON format");
      process.exit(1);
    }

    // Validate diff if requested
    if (options.validate) {
      const validation = DiffApplicator.validateDiff(sourceData, diff);
      if (!validation.valid) {
        printError("Diff validation failed:");
        for (const error of validation.errors) {
          console.log(chalk.red("  •"), error);
        }
        process.exit(1);
      }
      printSuccess("Diff validation passed");
    }

    // Apply diff
    const startApply = performance.now();
    const result = DiffApplicator.applyToData(sourceData, diff);
    const endApply = performance.now();

    printSuccess(
      `Applied diff in ${chalk.yellow(`${(endApply - startApply).toFixed(2)}ms`)}`,
    );

    const stats = DiffGenerator.getStats(diff);
    console.log(chalk.cyan("\n📊 Applied Changes\n"));
    printKeyValue("Total changes", stats.total);
    printKeyValue("Added", chalk.green(`+${stats.added}`));
    printKeyValue("Removed", chalk.red(`-${stats.removed}`));
    printKeyValue("Modified", chalk.yellow(`~${stats.modified}`));

    // Serialize result
    const serialized = serializeKv(result);

    if (options.output) {
      const outputPath = resolve(options.output);
      writeFileSync(outputPath, serialized, "utf-8");
      printSuccess(`Saved result to: ${chalk.white(outputPath)}`);
      printKeyValue("Output size", formatBytes(serialized.length));
    } else {
      console.log(chalk.gray("\n─────────────────────────────────────────\n"));
      console.log(serialized);
    }
  } catch (error) {
    printError(
      `Failed to apply diff: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

// CLI setup
yargs(hideBin(process.argv))
  .scriptName("kv-parser")
  .usage("$0 <command> [options]")
  .command(
    "parse <file>",
    "Parse a KeyValues file",
    (yargs) => {
      return yargs
        .positional("file", {
          describe: "Path to the KeyValues file",
          type: "string",
          demandOption: true,
        })
        .option("output", {
          alias: "o",
          describe: "Output file path",
          type: "string",
        })
        .option("json", {
          alias: "j",
          describe: "Output as JSON",
          type: "boolean",
          default: false,
        })
        .option("pretty", {
          alias: "p",
          describe: "Pretty print output",
          type: "boolean",
          default: true,
        });
    },
    async (argv) => {
      await parseCommand(argv.file, {
        output: argv.output,
        json: argv.json,
        pretty: argv.pretty,
      });
    },
  )
  .command(
    "validate <file>",
    "Validate a KeyValues file",
    (yargs) => {
      return yargs.positional("file", {
        describe: "Path to the KeyValues file",
        type: "string",
        demandOption: true,
      });
    },
    async (argv) => {
      await validateCommand(argv.file);
    },
  )
  .command(
    "format <file>",
    "Format a KeyValues file",
    (yargs) => {
      return yargs
        .positional("file", {
          describe: "Path to the KeyValues file",
          type: "string",
          demandOption: true,
        })
        .option("output", {
          alias: "o",
          describe: "Output file path",
          type: "string",
        })
        .option("indent", {
          alias: "i",
          describe: "Indentation size",
          type: "number",
          default: 4,
        });
    },
    async (argv) => {
      await formatCommand(argv.file, {
        output: argv.output,
        indent: argv.indent,
      });
    },
  )
  .command(
    "convert <file>",
    "Convert between KeyValues and JSON",
    (yargs) => {
      return yargs
        .positional("file", {
          describe: "Path to the input file",
          type: "string",
          demandOption: true,
        })
        .option("to", {
          alias: "t",
          describe: "Target format",
          choices: ["json", "kv"] as const,
          demandOption: true,
        })
        .option("output", {
          alias: "o",
          describe: "Output file path",
          type: "string",
        })
        .option("pretty", {
          alias: "p",
          describe: "Pretty print JSON output",
          type: "boolean",
          default: true,
        });
    },
    async (argv) => {
      await convertCommand(argv.file, {
        to: argv.to,
        output: argv.output,
        pretty: argv.pretty,
      });
    },
  )
  .command(
    "stats <file>",
    "Show statistics about a KeyValues file",
    (yargs) => {
      return yargs.positional("file", {
        describe: "Path to the KeyValues file",
        type: "string",
        demandOption: true,
      });
    },
    async (argv) => {
      await statsCommand(argv.file);
    },
  )
  .command(
    "ast <file>",
    "Parse and display Abstract Syntax Tree",
    (yargs) => {
      return yargs
        .positional("file", {
          describe: "Path to the KeyValues file",
          type: "string",
          demandOption: true,
        })
        .option("output", {
          alias: "o",
          describe: "Output file path",
          type: "string",
        })
        .option("json", {
          alias: "j",
          describe: "Output AST as JSON",
          type: "boolean",
          default: false,
        })
        .option("pretty", {
          alias: "p",
          describe: "Pretty print JSON output",
          type: "boolean",
          default: true,
        })
        .option("preserve-comments", {
          describe: "Preserve comments in AST",
          type: "boolean",
          default: true,
        })
        .option("preserve-whitespace", {
          describe: "Preserve whitespace in AST",
          type: "boolean",
          default: true,
        })
        .option("round-trip", {
          alias: "r",
          describe: "Test AST round-trip (parse → serialize → compare)",
          type: "boolean",
          default: false,
        });
    },
    async (argv) => {
      await astCommand(argv.file, {
        output: argv.output,
        json: argv.json,
        pretty: argv.pretty,
        preserveComments: argv.preserveComments,
        preserveWhitespace: argv.preserveWhitespace,
        roundTrip: argv.roundTrip,
      });
    },
  )
  .command(
    "diff <source> <target>",
    "Generate diff between two KeyValues files",
    (yargs) => {
      return yargs
        .positional("source", {
          describe: "Path to the source file",
          type: "string",
          demandOption: true,
        })
        .positional("target", {
          describe: "Path to the target file",
          type: "string",
          demandOption: true,
        })
        .option("output", {
          alias: "o",
          describe: "Save diff to file",
          type: "string",
        })
        .option("format", {
          alias: "f",
          describe: "Output format",
          choices: ["default", "unified", "json"] as const,
          default: "default" as const,
        })
        .option("pretty", {
          alias: "p",
          describe: "Pretty print JSON output",
          type: "boolean",
          default: true,
        });
    },
    async (argv) => {
      await diffCommand(argv.source, argv.target, {
        output: argv.output,
        format: argv.format,
        pretty: argv.pretty,
      });
    },
  )
  .command(
    "apply-diff <source> <diff>",
    "Apply a diff to a KeyValues file",
    (yargs) => {
      return yargs
        .positional("source", {
          describe: "Path to the source file",
          type: "string",
          demandOption: true,
        })
        .positional("diff", {
          describe: "Path to the diff file (JSON format)",
          type: "string",
          demandOption: true,
        })
        .option("output", {
          alias: "o",
          describe: "Output file path",
          type: "string",
        })
        .option("validate", {
          alias: "v",
          describe: "Validate diff before applying",
          type: "boolean",
          default: true,
        });
    },
    async (argv) => {
      await applyDiffCommand(argv.source, argv.diff, {
        output: argv.output,
        validate: argv.validate,
      });
    },
  )
  .demandCommand(1, "You need to specify a command")
  .help()
  .alias("h", "help")
  .version("1.0.0")
  .alias("v", "version")
  .epilogue(
    "For more information, visit: https://github.com/deadlock-mod-manager/deadlock-mod-manager",
  )
  .parse();
