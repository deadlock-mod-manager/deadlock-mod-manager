# Deadlock Mod Manager - Discord Bot

A Discord bot that provides status monitoring and basic commands for the Deadlock Mod Manager community.

## Configuration

The bot requires several environment variables to function:

### Required

- `BOT_TOKEN` - Discord bot token
- `BOT_ENABLED` - Set to `true` to enable the bot

### Status Monitoring (Optional)

- `STATUS_ENABLED` - Enable/disable status monitoring
- `STATUS_CHANNEL_ID` - Discord channel ID for status updates
- `STATUS_URL` - URL of the status page to monitor
- `STATUS_SELECTOR` - CSS selector for the main content area
- `STATUS_INTERVAL_MIN` - Update interval in minutes (minimum 1 minute)
- `STATUS_MESSAGE_ID` - Existing message ID to update (optional)
- `STATUS_PIN` - Pin status messages (requires Manage Messages permission)

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Run compiled version
pnpm start
```
