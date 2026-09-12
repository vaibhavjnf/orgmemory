import { describe, expect, it } from "vitest";
import { planTickTools, runtimeToolLabel } from "../src/runtime.js";

describe("hosted Hermes loop plan", () => {
  it("follows through fetch on active work and Composio on blocked work", () => {
    expect(planTickTools("intake")).toEqual(["suggest", "prompt_trace", "remember"]);
    expect(planTickTools("active")).toEqual(["suggest", "fetch", "prompt_trace", "remember"]);
    expect(planTickTools("blocked")).toEqual(["suggest", "composio", "prompt_trace", "remember"]);
    expect(planTickTools("review")).toEqual(["suggest", "mirror", "prompt_trace", "remember"]);
    expect(planTickTools("sealed")).toEqual(["prompt_trace", "remember"]);
  });

  it("labels hosted tools without OpenClaw names", () => {
    expect(runtimeToolLabel("remember")).toBe("Hosted memory");
    expect(runtimeToolLabel("composio")).toBe("Composio");
  });
});
