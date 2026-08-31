// src/test/vitest-axe.d.ts
// Type augmentation for the vitest-axe matcher under vitest 3.
//
// vitest-axe 0.1.0 ships an `extend-expect.d.ts` that augments the vitest 1.x
// `Vi.Assertion` namespace, which no longer exists on vitest 3 (the assertion
// interface now lives in @vitest/expect). Without this augmentation,
// `expect(...).toHaveNoViolations()` would typecheck as unknown/error.

declare module '@vitest/expect' {
  interface Assertion<T = any> {
    toHaveNoViolations(): void;
  }
}

export {};
