/**
 * Minimal type declarations for `bun:test` v1.x
 *
 * This file provides ambient module declarations for the Bun test runner so
 * TypeScript / the IDE can type-check test files (`*.test.ts`) without
 * requiring the `bun-types` package as a dependency.
 *
 * Reference: https://bun.sh/docs/cli/test
 *
 * Notes:
 *  - Only the surface used by the novel-weaver plugin is typed; extensions
 *    (snapshot, concurrent, etc.) can be added later as needed.
 *  - The file is a module (exports `BunTestMarker`) so the `declare global`
 *    block below is honored by TypeScript.
 */

declare module "bun:test" {
  // ----- internal helpers --------------------------------------------------

  export type AnyFn = (...args: any[]) => any

  export type Mock<T extends AnyFn = AnyFn> = T & {
    mock: {
      calls: any[]
      results: any[]
    }
    mockReturnValue(value: ReturnType<T>): this
    mockResolvedValue(value: Awaited<ReturnType<T>>): this
    mockImplementation(fn: T): this
    mockClear(): this
    mockReset(): this
    mockRestore(): this
  }

  type DescribeFn = (name: string, fn: () => void) => void
  type TestFn = (name: string, fn: () => void | Promise<void>) => Promise<void> | void
  type LifecycleFn = (fn: () => void | Promise<void>) => void
  type EachTestFn = <T extends readonly any[]>(
    items: readonly T[],
  ) => (name: string, fn: (...args: T) => void | Promise<void>) => void

  // ----- suite + test control ---------------------------------------------

  export const describe: DescribeFn & {
    skip: DescribeFn
    only: DescribeFn
    each: EachTestFn
  }

  export const test: TestFn & {
    skip: TestFn
    only: TestFn
    todo: (name: string) => void
    each: EachTestFn
    if: (condition: boolean) => TestFn
    skipIf: (condition: boolean) => TestFn
  }

  export const it: typeof test

  export const beforeAll: LifecycleFn
  export const afterAll: LifecycleFn
  export const beforeEach: LifecycleFn
  export const afterEach: LifecycleFn

  // ----- assertions -------------------------------------------------------

  export interface Matchers<T> {
    toBe(expected: any): void
    toEqual(expected: any): void
    toStrictEqual(expected: any): void
    toBeNull(): void
    toBeUndefined(): void
    toBeDefined(): void
    toBeTruthy(): void
    toBeFalsy(): void
    toBeNaN(): void
    toBeGreaterThan(n: number): void
    toBeGreaterThanOrEqual(n: number): void
    toBeLessThan(n: number): void
    toBeLessThanOrEqual(n: number): void
    toBeCloseTo(n: number, precision?: number): void
    toContain(item: any): void
    toContainEqual(item: any): void
    toHaveLength(n: number): void
    toHaveProperty(path: string | string[], value?: any): void
    toMatchObject(obj: any): void
    toMatch(expected: string | RegExp): void
    toThrow(msg?: string | RegExp): void
    toHaveBeenCalled(): void
    toHaveBeenCalledTimes(n: number): void
    toHaveBeenCalledWith(...args: any[]): void
    toHaveBeenLastCalledWith(...args: any[]): void
    toHaveBeenNthCalledWith(n: number, ...args: any[]): void
    not: Matchers<T>
    rejects: Matchers<Promise<any>>
    resolves: Matchers<Promise<any>>
  }

  export function expect<T>(actual: T): Matchers<T>

  // ----- mocks -------------------------------------------------------------

  export function mock<T extends AnyFn = AnyFn>(implementation?: T): Mock<T>

  export function spyOn<T extends object, M extends AnyFn>(
    obj: T,
    method: keyof T,
  ): Mock<M>

  // bun:test provides mock.module via the global `mock` import; expose the
  // type so test files can `import { mock } from "bun:test"` and call
  // `mock.module(path, factory)`.
  export namespace mock {
    function module(
      path: string,
      factory: () => Record<string, any> | ((...args: any[]) => any),
    ): void
  }
}

// `jest` global alias — Bun exposes `jest` as a compatibility shim for
// existing Jest-style suites. Declared as a global because the test runner
// injects it at runtime.
export {}

declare global {
  // eslint-disable-next-line no-var
  var jest: {
    fn: typeof import("bun:test").mock
    spyOn: typeof import("bun:test").spyOn
    mock: typeof import("bun:test").mock
  }
}
