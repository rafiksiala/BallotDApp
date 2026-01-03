import { ethers } from "hardhat";

async function main() {
  const now = Math.floor(Date.now() / 1000);

  // Fenêtres longues pour avoir le temps de tester tranquillement
  const regStart = now + 60;        // 1 min
  const regDuration = 30 * 60;      // 30 min
  const voteDuration = 30 * 60;     // 30 min

  const Ballot = await ethers.getContractFactory("Ballot");
  const ballot = await Ballot.deploy(
    ["Alice", "Bob", "Charlie"],
    regStart,
    regDuration,
    voteDuration
  );

  await ballot.waitForDeployment();

  const address = await ballot.getAddress();
  console.log("✅ Ballot deployed to:", address);
  console.log("Params:", { regStart, regDuration, voteDuration });

  // Très important: récupérer tx hash + block de déploiement
  const deployTx = ballot.deploymentTransaction();
  console.log("Deploy tx hash:", deployTx?.hash);

  const receipt = await deployTx?.wait();
  console.log("Deployed in block:", receipt?.blockNumber);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
