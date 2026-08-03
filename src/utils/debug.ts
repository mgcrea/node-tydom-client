import console from "console";
import createDebug from "debug";
import { name } from "./../../package.json";

export const debug = createDebug(name);

export default debug;

export const REDACTED = "[redacted]";

/**
 * JSON fields whose value is a secret.
 *
 * `pwd` is the one that matters in practice: every alarm arm, disarm and zone
 * command carries the user's PIN in the request body.
 */
const SECRET_JSON_FIELD = /("(?:pwd|password|passwd|pin|token|secret|apiKey)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi;

/** Request headers that carry credentials, matched at a CRLF or line start. */
const SECRET_HEADER = /(^|\r\n|\n)((?:proxy-)?authorization|cookie|set-cookie)(\s*:\s*)[^\r\n]*/gi;

/**
 * Strip credentials out of anything about to be logged.
 *
 * Debug output is a support artefact — the README asks users to attach it to
 * bug reports — so a raw request dump containing an alarm PIN turns "please
 * send me your log" into "please send me the code that disarms your house".
 *
 * Deliberately conservative: it redacts values, never keys, so a log still
 * shows that a PIN was sent and where.
 */
export const redactSecrets = (input: string): string =>
  input.replace(SECRET_JSON_FIELD, `$1"${REDACTED}"`).replace(SECRET_HEADER, `$1$2$3${REDACTED}`);

export const dir = (...args: unknown[]): void => {
  console.dir(args.length > 1 ? args : args[0], { colors: true, depth: 10 });
};

export const toBinaryString = (buffer: Buffer): string =>
  buffer
    .reduce((soFar, byte) => {
      return `${soFar} 0b${(byte >>> 0).toString(2).padStart(8, "0")}`;
    }, "")
    .trim();

export const toHexString = (buffer: Buffer): string =>
  buffer
    .reduce((soFar, byte) => {
      return `${soFar} 0x${(byte >>> 0).toString(16).padStart(2, "0")}`;
    }, "")
    .trim();
