import { AssertionError } from "assert";

export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new AssertionError({ message });
  }
}
