import { validateReference, type Reference } from "./data";
export async function readReference(
  file: File,
): Promise<{ pns: Reference["pns"] }> {
  if (file.size > 1024 * 1024) throw new Error("Reference file exceeds 1 MiB");
  let candidate: unknown;
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const rows = await readSheet(file, 1);
    const expected = ["pn", "client", "family", "field", "value", "use"];
    if (!rows.length || rows[0].map(String).join("|") !== expected.join("|"))
      throw new Error("Invalid columns");
    const pns: Reference["pns"] = {};
    for (const row of rows.slice(1)) {
      if (row.every((v) => v === null)) continue;
      if (row.length !== 6 || row.some((v) => v === null))
        throw new Error("Missing value");
      const [pn, client, family, id, value, use] = row.map(String);
      if (!pns[pn]) pns[pn] = { client, family, fields: [] };
      if (pns[pn].client !== client || pns[pn].family !== family)
        throw new Error("Inconsistent PN");
      pns[pn].fields.push({ id, value, use });
    }
    candidate = { pns };
  } else if (file.name.toLowerCase().endsWith(".json"))
    candidate = JSON.parse(await file.text());
  else throw new Error("Unsupported extension");
  if (!validateReference(candidate)) throw new Error("Invalid reference");
  return candidate;
}
