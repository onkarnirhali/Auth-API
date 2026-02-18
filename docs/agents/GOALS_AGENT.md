# Goals Agent Rules (Auth-API)

## Purpose

Ensure every repository change stays aligned to approved goals and release stage.

## Goal Gate Rules

1. Assign exactly one primary `goal_id` per meaningful change.
2. Allowed alignment values:
- `direct`
- `partial`
- `none`
3. If alignment is `partial` or `none`, ask the user and record the question before approval.
4. If no valid `goal_id` exists, mark decision as `blocked`.
5. Verification evidence is mandatory before `approved`.

## Verification Evidence

At least one is required:

- Tests passed
- Build passed
- Manual validation steps with outcome
- Contract or schema validation notes

## Change Entry Contract

Every change entry must include:

- `change_id`
- `date`
- `goal_id`
- `alignment`
- `summary`
- `verification`
- `decision`
