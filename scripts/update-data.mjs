import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
import { prepare } from "./prepare-data.mjs";
const offline = process.argv.includes("--offline");
const stage = `data/staging/${Date.now()}`;
const raw = offline ? "data/raw" : `${stage}/raw`;
await fs.mkdir(stage, { recursive: true });
await fs.mkdir(raw, { recursive: true });
async function json(url, body) {
  const r = await fetch(url, {
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw Error(`${url}: ${r.status}`);
  return r.json();
}
if (!offline) {
  for (const [name, id] of [
    ["heritage", 530],
    ["address", 60562],
    ["quarters", 64068],
  ]) {
    const meta = await json(`https://data.mos.ru/api/v2/odata/datasets/${id}`);
    const statuses = await json(
      "https://data.mos.ru/api/v2/odataExports/status",
      { datasetId: id, format: "JSON" },
    );
    const file = statuses.find(
      (s) =>
        s.status === "finished" &&
        s.versionNum === meta.actualData.versionNum &&
        s.releaseNum === meta.release.releaseNum,
    );
    if (!file)
      throw Error(
        `No ready export for ${id}. Previous snapshot preserved; retry later.`,
      );
    const r = await fetch(
      `https://data.mos.ru/api/v2/odata/MEDIA/getFile?id=${file.fileId}`,
      { signal: AbortSignal.timeout(300000) },
    );
    if (!r.ok) throw Error(`Download ${id}: ${r.status}`);
    await pipeline(
      Readable.fromWeb(r.body),
      createWriteStream(`${raw}/${name}.zip`),
    );
    await fs.writeFile(
      `${raw}/${name}-meta.json`,
      JSON.stringify(meta, null, 2),
    );
    await fs.writeFile(
      `${raw}/${name}-export.json`,
      JSON.stringify(statuses, null, 2),
    );
    console.log(
      `Downloaded ${id}, version ${file.versionNum}.${file.releaseNum}`,
    );
  }
  const heritage = execFileSync("unzip", ["-p", `${raw}/heritage.zip`], {
    maxBuffer: 100 * 1024 * 1024,
  });
  await fs.writeFile(`${stage}/heritage.json`, heritage);
  const extraction = JSON.parse(
    execFileSync(
      "python3",
      [
        "scripts/extract-address.py",
        `${stage}/heritage.json`,
        `${raw}/address.zip`,
        `${raw}/addresses-matched.json`,
      ],
      { encoding: "utf8", maxBuffer: 100000 },
    ),
  );
  const addressMeta = JSON.parse(
    await fs.readFile(`${raw}/address-meta.json`, "utf8"),
  );
  if (extraction.sourceRecords !== addressMeta.release.cntObjects)
    throw Error("Address registry count mismatch");
  console.log(extraction);
}
const report = await prepare(raw, `${stage}/prepared`);
const snapshot = `v${report.sources[0].version}-${report.sources[0].release}-${Date.now()}`;
await fs.mkdir("public/data/snapshots", { recursive: true });
await fs.rename(`${stage}/prepared`, `public/data/snapshots/${snapshot}`);
if (!offline) {
  await fs.mkdir("data/raw", { recursive: true });
  for (const file of await fs.readdir(raw))
    await fs.copyFile(`${raw}/${file}`, `data/raw/${file}`);
}
await fs.writeFile(
  `${stage}/manifest.json`,
  JSON.stringify({ snapshot, report }, null, 2),
);
// The previous manifest and published snapshot are untouched until every validation passes.
await fs.rename(`${stage}/manifest.json`, "public/data/manifest.json");
console.log(JSON.stringify(report.counts, null, 2));
