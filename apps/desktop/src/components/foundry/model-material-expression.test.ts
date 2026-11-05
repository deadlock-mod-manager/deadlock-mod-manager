import { test, expect } from "bun:test";
import { compileMaterialExpression } from "./model-material-expression";
test("health and ability expressions respond to explicit simulated inputs", () => {
  const glow = compileMaterialExpression("(1 - saturate($ent_health)) * 10");
  expect(glow?.({ time: 0, attributes: { $ent_health: 0.2 } })).toEqual([8]);
  const color = compileMaterialExpression(
    "$ability_active ? float3(1,0,0) : float3(1,1,1)",
  );
  expect(color?.({ time: 0, attributes: { $ability_active: 1 } })).toEqual([
    1, 0, 0,
  ]);
  expect(color?.({ time: 0, attributes: { $ability_active: 0 } })).toEqual([
    1, 1, 1,
  ]);
  const pulse = compileMaterialExpression("5 + 5 * sin(3 * time())");
  expect(pulse?.({ time: Math.PI / 6, attributes: {} })[0]).toBeCloseTo(10);
});
test("preview parser refuses executable text and unsupported or deeply nested expressions", () => {
  expect(compileMaterialExpression("window.location = 1")).toBeNull();
  expect(compileMaterialExpression("unknown(time())")).toBeNull();
  expect(
    compileMaterialExpression("(".repeat(40) + "1" + ")".repeat(40)),
  ).toBeNull();
  expect(compileMaterialExpression("time())")).toBeNull();
});
