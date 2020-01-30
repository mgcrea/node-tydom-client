import {AssertionError} from 'assert';

// function assert(value: unknown): asserts value {
//   if (value === undefined) {
//     throw new Error('value must be defined');
//   }
// }

// export const assert = (value: unknown, message?: string): asserts value => {
//   if (!value) {
//     throw new AssertionError({message});
//   }
// };

// export const assert: (value: unknown, message?: string) => asserts value = (value: unknown, message?: string) => {
//   if (!value) {
//     throw new AssertionError({message});
//   }
// };

export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new AssertionError({message});
  }
}
