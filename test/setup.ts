import console from 'console';
import {inspect} from 'util';

global.d = (...args) => console.dir(args.length > 1 ? args : args[0], {colors: true, depth: 10});
global.t = Date.now();
