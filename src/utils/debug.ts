import console from "console";
import createDebug from "debug";
import { name } from "./../../package.json";

export const debug = createDebug(name);

export default debug;

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
