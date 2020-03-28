// @ts-ignore
import {name} from './../../package.json';
import createDebug from 'debug';

const debug = createDebug(name);

export default debug;

export const dir = (...args: unknown[]) => {
  console.dir(...args, {colors: true, depth: 10});
};
