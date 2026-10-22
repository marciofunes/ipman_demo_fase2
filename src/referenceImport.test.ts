import { describe, it, expect } from "vitest";
import { readReference } from "./referenceImport";
import { mockData, validateReference } from "./data";
const file = (text: string, name = "reference.json") =>
  ({ name, size: text.length, text: async () => text }) as File;
describe("reference file boundary", () => {
  it("accepts a schema-valid JSON reference without modifying the original", async () => {
    const v = await readReference(
      file(JSON.stringify({ pns: mockData.references[0].pns })),
    );
    expect(Object.keys(v.pns)).toHaveLength(3);
    expect(v.pns["265258072"].fields).toHaveLength(17);
  });
  it("rejects invalid JSON, oversized input and unsupported extension", async () => {
    await expect(readReference(file("{"))).rejects.toThrow();
    await expect(
      readReference({ ...file("{}"), size: 2 * 1024 * 1024 }),
    ).rejects.toThrow();
    await expect(readReference(file("{}", "test.exe"))).rejects.toThrow();
  });
  it("rejects null fields and duplicate field ids without throwing", () => {
    const pn = { client: "VW", family: "ESP", fields: [null] };
    expect(validateReference({ pns: { "265258072": pn } })).toBe(false);
    pn.fields = [];
    expect(validateReference({ pns: { "265258072": pn } })).toBe(false);
    const f = { id: "a", value: "HR", use: "Gravação" };
    expect(
      validateReference({ pns: { "265258072": { ...pn, fields: [f, f] } } }),
    ).toBe(false);
  });
});
