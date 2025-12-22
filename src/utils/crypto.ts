import crypto from "crypto";

export const md5Sync = (data: crypto.BinaryLike): Buffer => crypto.createHash("md5").update(data).digest();
export const md5 = (data: crypto.BinaryLike): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    try {
      const hash = crypto.createHash("md5");
      hash.on("readable", () => {
        resolve(hash.read() as Buffer);
      });
      hash.write(data);
      hash.end();
    } catch (err) {
      reject(err as Error);
    }
  });

export const getRandomBytes = async (size = 256): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(size, (err, buf) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(buf);
    });
  });
};

let requestCounterValue = 0;
export const getRequestCounter = (): string => {
  requestCounterValue += 1;
  const nc = requestCounterValue.toString();
  return ("00000000" + nc).slice(nc.length);
};
