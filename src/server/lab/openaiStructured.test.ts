import { describe, expect, it } from "vitest";
import { responseSchemaName } from "./openaiStructured";

describe("responseSchemaName", () => {
  it("keeps dynamic structured-output names within OpenAI's limit", () => {
    const name = responseSchemaName(`reactions_${"segment_".repeat(12)}`);

    expect(name).toHaveLength(64);
    expect(name).toMatch(/^[a-z0-9_-]+$/);
  });
});
