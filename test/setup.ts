import { warn } from "node:console";
import { inspect } from "node:util";
import { afterAll, afterEach, beforeAll, expect } from "vitest";
import { server } from "./msw-server";

// Any request a test did not explicitly stub is a bug in the test, not
// something to quietly let through to a real Tydom gateway.
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

declare global {
  var d: Console["warn"];
  var dd: Console["warn"];
}

globalThis.d = (...args: unknown[]) => {
  warn(inspect(args.length > 1 ? args : args[0], { colors: true, depth: 10 }));
};
globalThis.dd = (...args: unknown[]) => {
  globalThis.d(...args);
  // Deliberate: `dd` is "dump and die", called from inside a test to print a
  // value and then fail it on the spot. The expect is outside a test body only
  // because the helper is defined here.
  // oxlint-disable-next-line vitest/no-standalone-expect
  expect(1).toEqual(2);
};
