import crypto from 'crypto';

export const md5 = (data: crypto.BinaryLike): Buffer =>
  crypto
    .createHash('md5')
    .update(data)
    .digest();

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
export const getRequestCounter = () => {
  requestCounterValue += 1;
  const nc = requestCounterValue + '';
  return ('00000000' + nc).substr(nc.length);
};
