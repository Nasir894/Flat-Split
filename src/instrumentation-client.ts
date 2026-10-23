// Runs before the app starts. Older iPhones (iPhone 6S and 7 stop at iOS 15 / Safari 15) lack a few
// newer array helpers that our UI libraries call, so add them where missing. Syntax is handled by
// the "browserslist" targets in package.json; these cover built-in functions syntax lowering can't.

type Compare<T> = ((a: T, b: T) => number) | undefined;

const define = (target: object, name: string, value: unknown) => {
  if (!(name in target)) Object.defineProperty(target, name, { value, writable: true, configurable: true });
};

define(Array.prototype, "toSorted", function <T>(this: T[], compare?: Compare<T>) {
  return [...this].sort(compare);
});
define(Array.prototype, "toReversed", function <T>(this: T[]) {
  return [...this].reverse();
});
define(Array.prototype, "toSpliced", function <T>(this: T[], start: number, deleteCount?: number, ...items: T[]) {
  const copy = [...this];
  if (arguments.length === 1) copy.splice(start);
  else copy.splice(start, deleteCount ?? 0, ...items);
  return copy;
});
define(Array.prototype, "with", function <T>(this: T[], index: number, value: T) {
  const copy = [...this];
  const i = index < 0 ? copy.length + index : index;
  if (i < 0 || i >= copy.length) throw new RangeError("Invalid index");
  copy[i] = value;
  return copy;
});
define(Promise, "withResolvers", function <T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
});
