import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const email = process.env.MODERATION_E2E_MEMBER_EMAIL?.trim();
const otp = process.env.MODERATION_E2E_MEMBER_OTP?.trim();
if (!email || !/^\d{6}$/u.test(otp ?? "")) {
  throw new Error("The staging HNS owner Privy fixture is unavailable.");
}
const result = spawnSync("bun", ["run", "test:e2e:hns-mainnet-route"], {
  cwd: root,
  env: { ...process.env, E2E_PRIVY_EMAIL: email, E2E_PRIVY_OTP: otp },
  stdio: "inherit",
  timeout: 240_000,
});
if (result.error || result.status !== 0) process.exitCode = 1;
