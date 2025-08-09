# Change Log

All notable changes to the "claude-auto-responder" extension will be documented in this file.

## [0.9.0] - 2025-08-09

### ✨ Added
- **Unified Dashboard Notifications**: Compact emoji-based status display replacing multiple individual notifications
- **Enhanced UI Indicators**: Mode indicators (▶️/🔄/⏸️) and status flags (🆖⏩⬇️ℹ️) for quick visual feedback

### 🔧 Improved
- **Performance Optimization**: Removed excessive debug logging and fixed 10-second hangup issues that caused extension freezing
- **Terminal State Detection**: Accurate detection of terminal disconnect status in notifications
- **Settings UI**: Added emoji indicators in VS Code settings descriptions for easy identification
- **Notification Management**: Streamlined notification system without disposal errors

### 🐛 Fixed
- **Idle Detection Stability**: Added 500ms cooldown and 2-failure threshold to prevent rapid continuous mode resets
- **Countdown Timer Issues**: Fixed continuous mode timer not starting and premature resets during log activity
- **Pattern Recognition**: Improved idle prompt detection to avoid false positives with text-containing prompts
- **Memory Management**: Removed unused notification disposal that caused runtime errors
- **Status Bar Updates**: Fixed animation and countdown display refresh issues

## [0.8.0] - 2025-08-08

### ✨ Added
- **Continuous Mode**: New 3-state toggle system (Off → Auto → Continuous → Off) for uninterrupted long-term operations
- **Intelligent Idle Detection**: Automatically detects when Claude shows empty prompt box (`╭─ > ╰─`) and waits for user input
- **Auto-Continue Command**: Sends `Continue.` command after configurable timeout to resume Claude's work seamlessly
- **Enhanced Status Bar**: Dynamic display shows `[   ⇉   ] Claude Continuous` with 2x faster animation for continuous mode
- **Command Palette Integration**: `Claude Auto Responder: Toggle Continuous Mode` with auto-settings enablement

### ⚙️ New Settings
- `enableContinuousMode`: Enable continuous mode functionality (default: OFF for safety)
- `continuousTimeoutMinutes`: Configurable idle timeout from 1-180 minutes (default: 30 minutes)

### 🔧 Improved
- **Smart Toggle Logic**: Three-state button cycling with automatic skip when continuous mode is disabled
- **One-Command Activation**: Command palette automatically enables settings and activates continuous mode
- **Conflict Prevention**: Automatic validation ensures continuous timeout is longer than auto-response delay
- **Timer Management**: Output changes reset idle timer to prevent premature Continue commands
- **State Persistence**: Continuous mode setting survives VS Code restarts

### 🛡️ Safety Features
- **Validation Warnings**: Notifies users when timeout settings conflict and auto-adjusts to safe values
- **Proper Cleanup**: Continuous monitoring stops cleanly when modes change or extension deactivates
- **Idle Pattern Recognition**: Precise 3-line empty prompt detection to avoid false triggers

### 🛠️ Technical
- **Output Monitoring**: Enhanced file watching with continuous timer reset on log changes
- **Memory Management**: Proper timeout cleanup and state management across mode transitions
- **TypeScript Compliance**: Full type safety for animation frame management and configuration

### 📋 Usage Scenarios
- **Long Development Sessions**: Automatically continue multi-step code refactoring or feature implementation
- **Batch Processing**: Keep Claude working through large file modifications without manual intervention
- **Extended Analysis**: Allow Claude to work through complex problem-solving sessions autonomously

## [0.7.0] - 2025-08-08

### ✨ Added
- **"Yes, and don't ask again" Support**: Enhanced pattern recognition to prioritize "Yes, and don't ask again this session" dialogs for '2' response
- **Configurable Countdown Timer**: New setting `autoResponseDelaySeconds` (1-300 seconds, default: 5) for customizable wait times
- **Enhanced Logging System**: Improved `.claude-skipped-questions.log` to capture actual Claude dialog content from `.claude-output.log`
- **Text Cleaning Pipeline**: Automatic removal of NUL characters, ESC sequences, and ANSI color codes from log files

### ⚙️ New Settings
- `autoResponseDelaySeconds`: Number of seconds to wait before sending auto-response (1-300 seconds, default: 5)
- `enableDontAskAgain`: Enable auto-response for 'Yes, and don't ask again this session' with '2' (default: ON)
- `logSkippedQuestions`: Log skipped questions and responses to `.claude-skipped-questions.log` (default: ON)
- `ignoreDestructiveCommandsDetection`: Ignore destructive command detection and proceed with auto-response (default: OFF)
- `customBlacklist`: Custom list of destructive command patterns to detect (regex supported, default: empty)

### 🔧 Improved
- **Priority-based Pattern Matching**: "Yes, and don't ask again this session" now checked before "Do you want to" to ensure correct response
- **Dynamic Status Bar**: Wait animation now shows actual countdown seconds: `Wait 5s` → `Wait 4s` → ... → `Wait 1s`
- **Log Content Quality**: `.claude-skipped-questions.log` now contains full Claude dialog boxes with commands and proposals
- **Response Precision**: Eliminated unnecessary newline characters in manual responses for cleaner terminal interaction

### 🛠️ Technical
- **Dialog Extraction**: `extractDialogFromLog()` function retrieves last `╭─` dialog section from `.claude-output.log`
- **Text Sanitization**: `cleanLogText()` removes control characters while preserving dialog formatting
- **Configuration Schema**: Complete VS Code settings integration with proper descriptions and defaults
- **Pattern Recognition**: Fixed condition ordering to prevent generic "Do you want to" from overriding specific "don't ask again" patterns

### 🗑️ Removed
- **Shift+Tab Shortcut**: Completely removed deprecated Shift+Tab toggle functionality and related settings

### 📋 Example Log Output
```
[2025-08-08T08:12:33.698Z] Auto-response: Yes (1)
╭─ Claude wants to create a new file ─╮
│ Do you want to proceed?             │
│ > Create: src/utils/helper.ts       │
│ 1. Yes                              │
│ 2. No                               │
╰─────────────────────────────────────╯
================================================================================
```

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