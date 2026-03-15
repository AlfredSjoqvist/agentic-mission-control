# OpenClaw + Telegram Setup for FireSight

## Prerequisites
- Node >= 22
- A Telegram account
- FireSight server running on localhost:3001

## Step 1: Install OpenClaw
```bash
npm install -g openclaw@latest
```

## Step 2: Create Telegram Bot
1. Open Telegram, search for `@BotFather`
2. Send `/newbot`
3. Name it: `FireSight Commander`
4. Username: `firesight_cmd_bot` (or whatever is available)
5. Copy the bot token

## Step 3: Get Your Telegram User ID
1. Open Telegram, search for `@userinfobot`
2. Send `/start`
3. Copy your user ID number

## Step 4: Add Keys to .env
Add to your project `.env`:
```
TELEGRAM_BOT_TOKEN="your-bot-token-here"
TELEGRAM_USER_ID="your-user-id-here"
```

## Step 5: Initialize OpenClaw Workspace
```bash
cd openclaw
openclaw init
```

When prompted, point to the config.yaml in this directory.

Or manually copy files:
```bash
cp AGENTS.md ~/.openclaw/workspace/AGENTS.md
cp -r skills/ ~/.openclaw/workspace/skills/
cp config.yaml ~/.openclaw/config.yaml
```

## Step 6: Start Everything
Terminal 1 — FireSight server:
```bash
cd server && npm run dev
```

Terminal 2 — OpenClaw gateway:
```bash
openclaw
```

## Step 7: Test
1. Open Telegram
2. Message your bot: `status`
3. You should get back fire status from the simulation
4. Try: `go defensive`
5. Try: `evacuate zone OR-1`

## Testing Without OpenClaw
You can test the command API directly with curl:
```bash
# Send a command
curl -X POST http://localhost:3001/api/command \
  -H "Content-Type: application/json" \
  -d '{"command": "strategy defensive", "source": "test"}'

# Get status
curl http://localhost:3001/api/status

# Get current strategy
curl http://localhost:3001/api/strategy

# Subscribe to strategy changes (SSE)
curl http://localhost:3001/api/strategy/stream
```

## Demo Flow
1. Start simulation in browser (map view)
2. Open Telegram on phone
3. Text: "status" → see fire data
4. Text: "go defensive" → watch agents change behavior in browser
5. Text: "evacuate OR-2" → bot asks for confirmation → confirm → evacuation triggers
6. Text: "stop everything" → bot asks confirmation → full safety stop
