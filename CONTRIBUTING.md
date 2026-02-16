# Contributing

## Development Setup

```sh
git clone https://github.com/chiemerieokorie/notifications.git
cd notifications
npm i
npm run dev
```

`npm run dev` starts three parallel processes:
- **Backend**: `convex dev` with component typecheck
- **Frontend**: Vite dev server for the example app
- **Build watcher**: Rebuilds `src/` on file changes

## Architecture Overview

```
src/
├── component/          # Runs inside the component sandbox
│   ├── schema.ts       # Component-owned tables
│   ├── lib.ts          # Core queries, mutations, actions
│   ├── channels/       # Channel adapters (push, email, SMS)
│   └── convex.config.ts
├── client/             # Runs in the consumer's function context
│   └── index.ts        # createNotificationsApi(), createNotification()
├── react/              # Frontend hooks and components
│   └── index.ts
└── test.ts             # Test registration utility

example/                # Example app that uses the component
├── convex/
│   ├── convex.config.ts    # app.use(notifications)
│   ├── example.ts          # Usage patterns
│   └── example.test.ts     # Integration tests
└── src/
    └── App.tsx             # React UI
```

**Component code** (`src/component/`) runs in an isolated sandbox with its own tables. It cannot access the consumer's database directly.

**Client code** (`src/client/`) runs in the consumer's function context. It bridges the consumer's auth and data with the component's functions via `ctx.runQuery()` / `ctx.runMutation()`.

## Adding a Channel Adapter

1. Create `src/component/channels/<name>.ts`
2. Implement the channel interface:
   ```ts
   export interface ChannelAdapter {
     render(template: ChannelTemplate, data: Record<string, unknown>): RenderedMessage;
     dispatch(ctx: ActionCtx, address: string, message: RenderedMessage): Promise<void>;
   }
   ```
3. Register the adapter in the channel registry
4. Add resolver type to the config interface in `src/client/index.ts`
5. Add template type to `createNotification()` channels
6. Run `npm run build:codegen`

## Adding a Component Function

1. Add the function in `src/component/lib.ts` (or a new file in `src/component/`)
2. Use `args` and `returns` validators on every function
3. Use `internalQuery`/`internalMutation` for functions only called by the component
4. Add a client wrapper in `src/client/index.ts` if it needs auth injection
5. Run `npm run build:codegen`

## Testing

Tests use **Vitest** with **convex-test** in edge-runtime environment. Test files are colocated with their source:

```sh
npm run test           # Run all tests with typecheck
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
npm run test:debug     # Node inspector
npm run check:package  # Validate exports + type resolution (publint + attw)
npm run test:consumer  # Consumer integration test (tarball install + tsc + vitest)
npm run test:all       # All of the above
```

### Writing Tests

```ts
import { test, expect, vi } from "vitest";
import { initConvexTest } from "./setup.test";

test("description", async () => {
  vi.useFakeTimers();
  const t = initConvexTest();

  // Use t.run() to execute functions
  const result = await t.run(async (ctx) => {
    // ... test logic
  });

  expect(result).toBeDefined();
});
```

Each test directory has a `setup.test.ts` that initializes `convexTest()` and registers the component. Always use fake timers for deterministic results.

### Consumer Integration Tests

The `consumer-test/` directory is a standalone project that installs the package from an `npm pack` tarball with its own `node_modules`. This catches type and export issues that only surface for real consumers (the example app resolves source types via Vite aliases, masking `dist/` problems).

It validates:
- All `package.json` exports resolve at runtime
- TypeScript types compile under both Bundler and Node16 moduleResolution
- The `ComponentApi` boundary types work correctly (IDs are `string`, not `Id<"table">`)
- The full consumer API pattern compiles: `Notifications` class, `createNotification`, `api()`, `send()`

The `consumer-test/convex/_generated/` files are hand-crafted to match `npx convex codegen` output for `convex@1.31.7`. If you update the `convex` dependency version, update these files to match.

## Quality Checks

Before submitting a PR, ensure all checks pass:

```sh
npm run typecheck      # TypeScript (main + example + example/convex)
npm run lint           # ESLint
npm run test           # Vitest + typecheck
npm run check:package  # publint + attw export validation
npm run test:consumer  # Consumer integration test
```

Or run everything at once:

```sh
npm run test:all       # All tests + package checks + consumer tests
```

These same checks run in CI via `.github/workflows/test.yml`.

## Commit Conventions

- Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)
- Keep commits atomic (one logical change per commit)
- Do not include AI-generated footers or co-author attributions

## PR Process

1. Create a feature branch from `main`
2. Make your changes with tests
3. Run all quality checks locally
4. Open a PR with a clear description of what changed and why
5. CI must pass before merge
