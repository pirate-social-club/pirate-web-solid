import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapToolEnvironment } from "./context.mjs";

test("pre-import Git bootstrap preserves HOME/XDG/DBus/CA and excludes injected operator values", () => {
  const input = { PATH: "/fixture/path", HOME: "/fixture/home", XDG_CONFIG_HOME: "/fixture/config", XDG_RUNTIME_DIR: "/fixture/runtime",
    DBUS_SESSION_BUS_ADDRESS: "unix:path=/fixture/bus", NODE_EXTRA_CA_CERTS: "/fixture/ca", HTTPS_PROXY: "http://proxy.invalid",
    HNS_PRODUCTION_POSTGRES_ADMIN_URL: "dummy-owner-url", HNS_PRODUCTION_POSTGRES_RUNTIME_URL: "dummy-runtime-url",
    CONTROL_PLANE_POSTGRES_ADMIN_URL: "dummy-owner-alias", CLOUDFLARE_API_TOKEN: "dummy-injected-token",
    INFISICAL_TOKEN: "dummy-folder-token", NODE_OPTIONS: "--require=/fixture/forbidden" };
  const projected = bootstrapToolEnvironment(input);
  assert.equal(projected.HOME, input.HOME); assert.equal(projected.XDG_CONFIG_HOME, input.XDG_CONFIG_HOME);
  assert.equal(projected.DBUS_SESSION_BUS_ADDRESS, input.DBUS_SESSION_BUS_ADDRESS); assert.equal(projected.NODE_EXTRA_CA_CERTS, input.NODE_EXTRA_CA_CERTS);
  assert.equal(projected.HTTPS_PROXY, input.HTTPS_PROXY); assert.equal(projected.GIT_OPTIONAL_LOCKS, "0");
  assert.ok(!JSON.stringify(projected).includes("dummy-")); assert.equal(projected.NODE_OPTIONS, undefined);
});
