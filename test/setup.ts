/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable no-var */

import {warn} from 'console';
import {inspect} from 'util';

declare global {
  var d: Console['warn'];
  var dd: Console['warn'];
}

globalThis.d = (...args: unknown[]) => warn(inspect(args.length > 1 ? args : args[0], {colors: true, depth: 10}));
globalThis.dd = (...args: unknown[]) => {
  global.d(...args);
  expect(1).toEqual(2);
};
