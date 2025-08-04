# Change Log

All notable changes to the "claude-auto-responder" extension will be documented in this file.

## [0.6.0] - 2025-08-04

### ✨ Added
- **Smart Claude CLI Startup**: Automatically falls back to `claude` command when `claude --continue` fails with "No conversation found to continue"
- **Cross-Platform Fallback**: Works on macOS, Windows, and Linux with platform-specific shell commands

### 🔧 Improved
- **Seamless First Run**: No manual intervention needed when starting Claude CLI for the first time
- **Robust Startup Logic**: Uses `claude --continue || claude` pattern to handle both scenarios gracefully

### 🛠️ Technical
- **macOS/Linux**: Uses `bash -c "claude --continue || claude"` with script command
- **Windows**: Uses PowerShell `(claude --continue; if (!$?) { claude })` syntax
- **Error Handling**: Graceful fallback when no previous conversation exists

## [0.5.0] - 2025-08-04

### ✨ Added
- **Terminal Buffer Refresh**: Added periodic arrow down key to refresh terminal buffer every 60 seconds
- **Configurable Buffer Refresh**: New VS Code setting `enableTerminalBufferRefresh` to control terminal buffer refresh (default: ON)

### 🔧 Improved
- **Log Update Performance**: Resolves `script -q` log file update delays by periodically triggering terminal display updates
- **Settings Flexibility**: Users can disable terminal buffer refresh if not needed in their environment

### ⚙️ New Settings
- `enableTerminalBufferRefresh`: Enable periodic arrow down key to refresh terminal buffer every 60 seconds

### 🛠️ Technical
- Terminal buffer refresh helps ensure `script -q` command properly updates log files in real-time
- Uses `\u001b[B` (arrow down) escape sequence that doesn't interfere with Claude CLI input
- Configurable via VS Code settings panel under "Claude Auto Responder"

## [0.4.0] - 2025-07-26

### 🎯 Major Features

- **VS Code Settings Integration**: Added comprehensive settings panel accessible via `Ctrl+,` → "Claude Auto Responder"
- **Comprehensive Action Logging**: All responses (auto and manual) are now logged to `.claude-skipped-questions.log` with timestamps
- **Shift+Tab Quick Skip**: Optional hotkey to instantly send "Yes, and don't ask again" (configurable in settings)


### ⚙️ New Settings
- `enableShiftTabSkip`: Enable Shift+Tab to skip confirmation dialogs
- `logSkippedQuestions`: Log all actions to file (default: ON)
- `ignoreDestructiveCommandsDetection`: Override destructive command warnings (shows warning)
- `customBlacklist`: Custom regex patterns to block auto-response

### 🔧 Improved
- **Status Bar Enhancements**:
  - Fast countdown animation: `$(alert) [⇉  ] Wait 5s` → `Wait 4s` → ... → `Wait 0s`
  - Smart terminal status: `[⇉] Click to Start Claude Terminal` when no terminal
  - Simplified disabled mode: `[✽] Click to Start Claude Terminal`
- **Wait Animation Fixes**: Resolved "Wait 0s" stuck animation issues
- **Terminal Management**: Clicking status bar when no terminal automatically starts Claude CLI

### 🛡️ Safety & Logging
- **Audit Trail**: Complete log of all automated decisions for transparency
- **Destructive Command Override**: Option to proceed with warnings for advanced users
- **Custom Pattern Blocking**: User-defined regex patterns for additional safety
- **Enhanced Logging**: Records question content, response type, and timestamp

### 🐛 Fixed
- **Animation Persistence**: Wait countdown properly stops after completion
- **Response Execution**: Ensures "Send Yes: 1" always executes after countdown
- **State Management**: Auto Mode toggling no longer breaks ongoing operations
- **Terminal State**: Proper cleanup when terminals are manually closed

### 📋 Logging Examples
```
[2025-07-26T10:30:15.123Z] Auto-response: Yes (1)
[Question content here]
================================================================================

[2025-07-26T10:35:22.456Z] Manual response: Yes, and don't ask again (2)
[Question content here]
================================================================================
```

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