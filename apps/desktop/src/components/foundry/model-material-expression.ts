export interface MaterialExpressionInputs {
  time: number;
  attributes: Readonly<Record<string, number>>;
}
type Expression = (input: MaterialExpressionInputs) => number[];
const map2 = (a: number[], b: number[], fn: (a: number, b: number) => number) =>
  Array.from({ length: Math.max(a.length, b.length) }, (_, i) =>
    fn(a[i % a.length], b[i % b.length]),
  );
type BinaryOperation = (a: number, b: number) => number;
const binary = new Map<string, BinaryOperation>(
  Object.entries({
    "+": (a, b) => a + b,
    "-": (a, b) => a - b,
    "*": (a, b) => a * b,
    "/": (a, b) => (b === 0 ? 0 : a / b),
    "%": (a, b) => (b === 0 ? 0 : a % b),
    "<": (a, b) => +(a < b),
    ">": (a, b) => +(a > b),
    "<=": (a, b) => +(a <= b),
    ">=": (a, b) => +(a >= b),
    "==": (a, b) => +(a === b),
    "!=": (a, b) => +(a !== b),
    "&&": (a, b) => +(!!a && !!b),
    "||": (a, b) => +(!!a || !!b),
  } satisfies Record<string, BinaryOperation>),
);
const levels = [
  ["||"],
  ["&&"],
  ["==", "!="],
  ["<", ">", "<=", ">="],
  ["+", "-"],
  ["*", "/", "%"],
];
type UnaryOperation = (n: number) => number;
const unary = new Map<string, UnaryOperation>(
  Object.entries({
    sin: Math.sin,
    cos: Math.cos,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    sqrt: (n) => Math.sqrt(Math.max(0, n)),
    frac: (n) => n - Math.floor(n),
    saturate: (n) => Math.max(0, Math.min(1, n)),
  } satisfies Record<string, UnaryOperation>),
);
/** A bounded, non-evaluating preview parser. Native compilation remains authoritative. */
export function compileMaterialExpression(source: string): Expression | null {
  if (source.length > 1024) return null;
  const tokens =
    source
      .match(
        /\s+|\$?[a-zA-Z_][a-zA-Z_0-9]*|(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?|<=|>=|==|!=|&&|\|\||[+\-*/%<>()!,?:]/g,
      )
      ?.filter((t) => !/^\s+$/.test(t)) ?? [];
  if (tokens.join("") !== source.replace(/\s+/g, "")) return null;
  let pos = 0,
    depth = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];
  const expect = (token: string) => {
    if (eat() !== token) throw new Error("syntax");
  };
  function conditional(): Expression {
    if (++depth > 32) throw new Error("depth");
    let left = parse(0);
    if (peek() === "?") {
      eat();
      const yes = conditional();
      expect(":");
      const no = conditional();
      const condition = left;
      left = (input) => (condition(input)[0] ? yes(input) : no(input));
    }
    depth--;
    return left;
  }
  function parse(level: number): Expression {
    if (level === levels.length) return primary();
    let left = parse(level + 1);
    while (levels[level].includes(peek())) {
      const op = eat(),
        right = parse(level + 1),
        previous = left;
      left = (input) => map2(previous(input), right(input), binary.get(op)!);
    }
    return left;
  }
  function primary(): Expression {
    const token = eat();
    if (token === "-" || token === "+" || token === "!") {
      const inner = primary();
      return (input) =>
        inner(input).map((n) => (token === "-" ? -n : token === "!" ? +!n : n));
    }
    if (token === "(") {
      const value = conditional();
      expect(")");
      return value;
    }
    if (token === undefined) throw new Error("end");
    if (/^[\d.]/.test(token)) {
      const n = Number(token);
      if (!Number.isFinite(n)) throw new Error("number");
      return () => [n];
    }
    if (/^\$?[a-zA-Z_]/.test(token)) {
      if (peek() !== "(") return (input) => [input.attributes[token] ?? 0];
      eat();
      const args: Expression[] = [];
      if (peek() !== ")") {
        args.push(conditional());
        while (peek() === ",") {
          eat();
          args.push(conditional());
        }
      }
      expect(")");
      if (token === "time" && args.length === 0) return (input) => [input.time];
      const operation = unary.get(token);
      if (operation && args.length === 1)
        return (input) => args[0](input).map(operation);
      if (/^float[234]$/.test(token)) {
        const width = Number(token.at(-1));
        if (args.length !== 1 && args.length !== width)
          throw new Error("vector");
        return (input) => {
          const values = args.flatMap((a) => a(input));
          return Array.from(
            { length: width },
            (_, i) => values[i % values.length],
          );
        };
      }
      if (["min", "max", "pow"].includes(token) && args.length === 2)
        return (input) =>
          map2(
            args[0](input),
            args[1](input),
            token === "min" ? Math.min : token === "max" ? Math.max : Math.pow,
          );
      if ((token === "clamp" || token === "lerp") && args.length === 3)
        return (input) => {
          const a = args[0](input),
            b = args[1](input),
            c = args[2](input);
          return Array.from(
            { length: Math.max(a.length, b.length, c.length) },
            (_, i) =>
              token === "clamp"
                ? Math.max(
                    b[i % b.length],
                    Math.min(c[i % c.length], a[i % a.length]),
                  )
                : a[i % a.length] +
                  (b[i % b.length] - a[i % a.length]) * c[i % c.length],
          );
        };
    }
    throw new Error("unsupported");
  }
  try {
    const expression = conditional();
    if (pos !== tokens.length) return null;
    return expression;
  } catch {
    return null;
  }
}
