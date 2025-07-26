# Change Log

All notable changes to the "claude-auto-responder" extension will be documented in this file.

## [0.1.0] - 2025-07-26

### Added
- Initial release of Claude Auto Responder extension
- Automatic response to Claude CLI prompts in VS Code terminal
- Auto mode toggle with Option+Shift+Tab hotkey
- Command palette integration for manual control
- Safety checks for destructive commands (rm -rf, fork bombs, etc.)
- Debug mode for troubleshooting
- Status bar indicator for auto mode state
- Manual trigger commands for "Yes" (1) and "Yes, don't ask again" (2) responses
- Terminal output monitoring for Claude CLI prompts
- Cross-platform compatibility (macOS, Windows, Linux)

### Features
- **Auto Mode**: Automatically responds to Claude CLI prompts
- **Safety First**: Blocks automatic responses to potentially destructive commands
- **Manual Override**: Manual trigger commands when auto mode is disabled
- **Visual Feedback**: Status bar shows current mode (Auto/Manual)
- **Keyboard Shortcuts**: Quick toggle with Option+Shift+Tab
- **Debug Support**: Toggle debug mode for development and troubleshooting

### Technical Details
- Built with TypeScript and VS Code Extension API
- Uses terminal monitoring for Claude CLI output detection
- Implements pattern matching for prompt recognition
- Includes safety regex patterns for command validation