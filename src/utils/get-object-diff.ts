import _ from 'lodash';

/**
 * Checks the difference of two objects and return an array of the keys that differ
 * @param a: object
 * @param b?: object
 * @returns object Object with only diff keys
 */
export default function getObjectDiff(a: object, b: object) {
  if (a === undefined) {
    throw new Error('Source is undefined');
  }

  let diffArray: string[] = [];

  if (b === undefined) {
    diffArray = Object.keys(a);
  } else {
    diffArray = _.reduce(
      a,
      (result: string[], value, key) =>
        _.isEqual(value, b[key as keyof typeof b]) ? result : result.concat(String(key)),
      [] as string[],
    );
  }

  return diffArray.reduce((result, key) => {
    return { ...result, [key]: a[key as keyof typeof a] };
  }, {} as any);
}
