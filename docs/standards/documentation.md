# Documentation Standard

Every project follows a consistent documentation structure. No exceptions.

---

## The Doc Trio (Required on Every Project)

Every project or standalone component must have from its first commit:

```
project-root/
├── README.md       # For humans: what it is, how to run it, architecture overview
├── AGENTS.md       # For AI agents: context, scope, required reading, rules
└── docs/
    └── INDEX.md    # Table of contents for all docs in this project
```

### README.md
- Product/project description
- Repository structure overview
- Getting started / setup instructions
- Links to documentation and AGENTS.md

### AGENTS.md
- Project context and scope
- Required reading before making changes
- Project-specific rules and constraints
- Links to docs/INDEX.md and parent navigation

### docs/INDEX.md
- Table listing every doc file in `docs/` with a brief description
- Navigation links: up to README, AGENTS, and parent project if nested

---

## Hierarchy and Navigation

Documentation follows a strict **top-down drill-down**:

```
Root README/AGENTS
    ↓
Shared docs (docs/INDEX.md)
    ↓
Project README/AGENTS
    ↓
Project docs (project/docs/INDEX.md)
    ↓
Specific documentation files
```

### Navigation Rules
- Every doc file links **up** to its parent INDEX or README
- Every INDEX links **down** to its children
- No orphaned files — every .md must be linked from at least one other file

---

## When to Create New Documentation

**Do create docs when:**
- A new project or component is started (doc trio mandatory)
- A non-obvious architectural decision is made
- A complex feature needs explanation beyond code comments
- Setup/deployment requires specific steps

**Don't create docs when:**
- The code is self-explanatory
- A doc would just restate what's in a README
- It would go stale faster than it provides value

**Component-level AGENTS.md:** Create one when a subdirectory has unique rules, required reading, or domain knowledge that differs from the parent. Not every folder needs one.

---

## Doc Quality Rules

- Keep docs scannable: headers, bullets, tables. No walls of prose.
- Lead with the most important information.
- Include concrete examples where they help.
- Date or version-stamp docs that may go stale.
- Prefer updating existing docs over creating new ones.
