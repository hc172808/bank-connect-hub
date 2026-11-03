declare module "bun:test" {
  export function describe(name: string, body: () => void): void;
  export function test(name: string, body: () => void | Promise<void>): void;
  export function beforeAll(body: () => void | Promise<void>): void;
  export function afterAll(body: () => void | Promise<void>): void;
  export function expect(value: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    not: { toBe(expected: unknown): void };
  };
}