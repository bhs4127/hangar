# Client registry

Index of all clients. One row per client, linking to the full record in this directory.
The intake pipeline maps incoming requests to clients by matching the request's source
identifier against the `channels` table in these records (CLAUDE.md rule 7) — a client
without registered channels is unreachable by the pipeline.

To add a client: follow [playbooks/onboard-client.md](../playbooks/onboard-client.md) —
copy [_example-client.md](_example-client.md) to `<slug>.md`, fill it, add a row here.

| Client | Slug | Vertical | Spoke repo | Domain | Status | Record |
|---|---|---|---|---|---|---|
| *(no clients yet — your first onboarding adds the first row)* | | | | | | |

Status values: `template` · `test` · `onboarding` · `building` · `live` · `paused` · `departed`

*(The record template lives at [_example-client.md](_example-client.md) — a fictional
taqueria, filled in end to end so you can see what a complete record looks like. Copy it
for each new client. Spoke repo URLs and the Cloudflare account come from `FLEET.md`.)*
