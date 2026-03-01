# services/api docs index

## Project

- [README](../README.md)
- [AGENTS](../AGENTS.md)

## API v1 Design (MC-24)

### Shared (all modules)

- [Architecture](./ARCHITECTURE.md) — modular design, package-by-feature, layers, DI, routing
- [API Contracts](./API_CONTRACTS.md) — response envelope, error model, pagination/filter/sort, all module endpoints
- [Auth](./AUTH.md) — v1 actor-identity headers, future auth plan
- [Operational Notes](./OPERATIONAL.md) — idempotency, concurrency, logging, audit hooks, deferred items

### Planning module

- [Status Transitions](./STATUS_TRANSITIONS.md) — status derivation, overrides, blocking, side effects

## Reference

- [Entity Model v1](../../../docs/ENTITY_MODEL_V1.md)
- [Workflow Logic v1](../../../docs/WORKFLOW_LOGIC_V1.md)

### Testing

- [Test Strategy](./TEST_STRATEGY.md) — test pyramid, structure, fixtures, patterns, coverage goals
