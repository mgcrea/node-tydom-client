export const asyncWait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const calculateDelay = ({ attemptCount }: { attemptCount: number }): number =>
  Math.min(1000 * Math.pow(2, Math.max(1, attemptCount)) + Math.random() * 100, Math.pow(2, 31) - 1);
