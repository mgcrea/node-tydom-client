import console from 'console';
import {inspect} from 'util';

global.d = (obj: any) => console.log(`\t${inspect(obj, {depth: 10, colors: true})}\n`);
global.t = Date.now();
