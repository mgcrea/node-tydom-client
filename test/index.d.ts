declare module NodeJS {
  interface Global {
    d: (obj: any) => void;
    t: number;
  }
}
