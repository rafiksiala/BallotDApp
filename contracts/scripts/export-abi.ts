import fs from "fs";
import path from "path";

async function main() {
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "Ballot.sol",
    "Ballot.json"
  );

  const raw = fs.readFileSync(artifactPath, "utf-8");
  const artifact = JSON.parse(raw);

  const outDir = path.join(__dirname, "..", "..", "shared", "contract-metadata");
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, "Ballot.abi.json"), JSON.stringify(artifact.abi, null, 2));
  console.log("✅ ABI exported to shared/contract-metadata/Ballot.abi.json");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
