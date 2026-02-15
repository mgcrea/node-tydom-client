export const debounce = (fn: () => void, ms: number) => {
  let timer: NodeJS.Timeout | undefined;
  const debounced = () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
  };
  return debounced;
};
