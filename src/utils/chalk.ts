import * as chalk from "kolorist";

export const chalkString = (s: unknown): string => chalk.green(`'${String(s)}'`);
export const chalkKeyword = (s: unknown): string => chalk.blue(String(s));
export const chalkJson = (s: unknown): string => chalk.gray(JSON.stringify(s));
export const chalkStringArray = (a: unknown[]): string => `[ ${a.map(chalkString).join(", ")} ]`;
export const chalkNumber = (n: unknown): string => chalk.yellow(String(n));
export const chalkBoolean = (b: unknown): string => chalk.yellow(b ? "true" : "false");
export const chalkDate = (d: Date): string => chalk.magenta(d.toISOString());
