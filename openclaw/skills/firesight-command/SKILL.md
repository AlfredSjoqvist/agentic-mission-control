---
name: firesight-command
description: Send ICS wildfire strategy commands to the FireSight simulation backend
requires:
  bins:
    - curl
  env:
    - FIRESIGHT_API_URL
---

# FireSight Command

Send structured ICS commands to the FireSight wildfire simulation.

## Usage

When you need to send a command to the FireSight backend, use curl:

```bash
curl -s -X POST "${FIRESIGHT_API_URL}/api/command" \
  -H "Content-Type: application/json" \
  -d '{"command": "COMMAND_HERE", "source": "telegram", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
```

## Status Queries

```bash
# Overall status
curl -s "${FIRESIGHT_API_URL}/api/status"

# Specific agent status
curl -s "${FIRESIGHT_API_URL}/api/status/hotshots"

# Fire prediction
curl -s "${FIRESIGHT_API_URL}/api/predict/30"

# Evacuation zone status
curl -s "${FIRESIGHT_API_URL}/api/evac-status"

# Wind conditions
curl -s "${FIRESIGHT_API_URL}/api/wind"

# Crew fatigue levels
curl -s "${FIRESIGHT_API_URL}/api/crews"
```

## Response Handling

The API returns JSON. Parse the `status` field:
- `"ok"` — command accepted and applied
- `"confirm_required"` — safety-critical command needs user confirmation before re-sending with `"confirmed": true`
- `"error"` — command not recognized or invalid

For `confirm_required` responses, ask the user to confirm, then re-send:
```bash
curl -s -X POST "${FIRESIGHT_API_URL}/api/command" \
  -H "Content-Type: application/json" \
  -d '{"command": "COMMAND_HERE", "source": "telegram", "confirmed": true, "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
```
