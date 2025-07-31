# Change Log

All notable changes to the "claude-auto-responder" extension will be documented in this file.

## [0.3.0] - 2025-07-27

### 🔧 Improved
- **Status Bar Animation**: Enhanced animations for Auto Mode and wait periods:
  - `[⇉  ] Claude Auto` for normal operation.
  - `$(alert) [⇉  ] Wait Xs` during 5-second wait for dialog responses.
- **Log File Management**: Improved `.claude-output.log` handling:
  - Automatically rotates to keep only the last 100 lines.
  - Ensures log file is hidden on Windows.
- **Terminal Cleanup**: Automatically cleans up terminal and log files when Auto Mode is disabled or terminal is closed.

### 🐛 Fixed
- **Terminal Monitoring**: Resolved issues with terminal monitoring when switching between terminals.
- **File Monitoring**: Fixed edge cases where `.claude-output.log` changes were not detected in real-time.
- **Windows Compatibility**: Addressed issues with hidden file attributes and PowerShell command execution.

## [0.2.0] - 2025-07-26

### 🔧 Improved
- **Notification System**: Changed destructive command warnings from modal popups to VS Code warning notifications (yellow)
- **Node Version Management**: Added support to ignore local node version managers (nodenv, nvm, etc.) and use global Node.js version
- **Log Management**: Implemented log file rotation to keep only last 100 lines in `.claude-output.log`

### ✨ Added
- **Command Palette**: Added "Claude Auto Responder: Start Claude Terminal" command for manual terminal startup
- **Unified Naming**: All command palette entries now start with "Claude Auto Responder:" to avoid confusion with official Claude extension

### 📖 Documentation
- **README Updates**: Added important warnings about:
  - Wait time variability (not exactly 5 seconds)
  - Experimental/unstable nature of the extension
  - Requirement to use extension commands to start Claude for monitoring to work
  - Script command requirement for terminal monitoring

### 🔧 Technical
- Enhanced terminal startup logic with better node environment isolation
- Improved log file management with automatic cleanup and rotation
- Better command organization in package.json

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