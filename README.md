# Claude Auto Responder for VS Code

A VS Code extension that automates interactions with Claude CLI by automatically responding to confirmation dialogs, streamlining your development workflow.
Now you can safely take a nap or do the dishes while your code finishes itself.*

\*Auto-diaper-change feature not yet implemented.

## Features

### Automatic Response
- Automatically detects dialogs enclosed in `╭─` boxes
- `"Do you want to"` pattern → Sends `1` (Yes) automatically
- `"Yes, and don't ask again this session"` pattern → Sends `2` automatically (configurable)
- **Configurable Delay**: Wait time can be set from 1-300 seconds (default: 5 seconds)

### Continuous Mode
- **Intelligent Idle Detection**: Detects empty prompt boxes (`╭─ > ╰─`) when Claude waits for input
- **Auto-Continue**: Automatically sends `Continue.` after configurable timeout (default: 30 minutes)  
- **Uninterrupted Workflow**: Enables truly autonomous long-term operations without manual intervention
- **3-State Toggle**: Off → Auto → Continuous → Off cycling

###  Safety Features  
- **Destructive Command Detection**: Detects `rm -rf`, fork bombs, database operations, etc. and cancels auto-response
- **VS Code Notification**: Shows warning notification (not modal popup) when dangerous commands are detected
- ** Experimental**: This extension is in early development and may be unstable

### User Interface
- **Animated Status Bar**: 
  - `[⇉  ] Claude Auto` (auto mode)
  - `[05:30] Claude Continuous` (continuous mode with countdown timer)
- **Unified Dashboard Notifications**: Compact emoji-based status display
  - Mode indicators: ▶️ (Auto) / 🔄 (Continuous) / ⏸️ (Off)
  - Status flags: ⚠️⚠️⚠️ (Ignore Destructive detection) / ⏩ (Don't ask) / ⬇️ (Buffer refresh) / ℹ️ (Logging)
  - `[⇉  ] Wait Xs` (configurable countdown period)
- **3-State Toggle**: Click status bar to cycle through Off → Auto → Continuous → Off

### System Integration
- **Sleep Prevention**: Prevents automatic sleep during Auto Mode
  - macOS: `caffeinate`
  - Windows: `powercfg` 
  - Linux: `systemd-inhibit` / `xset`
- **Node Version Management**: Ignores local `nodenv`, `nvm`, etc. and uses global Node.js version

## Installation

### From VS Code Marketplace
Install directly from the VS Code Marketplace:

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/kurokawamomo.claude-auto-responder)](https://marketplace.visualstudio.com/items?itemName=kurokawamomo.claude-auto-responder)

**[Install from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=kurokawamomo.claude-auto-responder)**

### Prerequisites
- VS Code 1.74.0 or higher
- Claude CLI (`claude` command available)
- **Smart Startup**: Automatically tries `claude --continue` first, falls back to `claude` if no conversation exists
- **Important**: Claude CLI must be started via `script` command for terminal monitoring to work

### Development Installation
1. Clone this repository
2. Open in VS Code
3. Press F5 to launch debug mode
4. Test the extension in the new window

## Usage

### Basic Usage

1. **Enable Auto Mode**
   - Click `[✽]` in the status bar
   - Or `Ctrl+Shift+P` → `Claude Auto Mode: Toggle`

2. **Start Claude CLI**
   - Auto-start option appears when Auto Mode is enabled
   - Or manually start via `Ctrl+Shift+P` → `Claude Auto Responder: Start Claude Terminal`
   - **Requirement**: Must use the extension's command to start Claude for monitoring to work

3. **Automatic Response**
   - When a dialog appears, automatically waits (configurable delay)
   - Status bar changes to `Wait Xs` animation with countdown
   - Automatically sends appropriate response (`1` or `2`)

### Manual Trigger

If automatic detection doesn't work:
- `Ctrl+Shift+P` → `Claude Auto Responder: Trigger Auto-Response`
- Copy dialog text for analysis

## Command Reference

| Command | Description | Shortcut |
|---------|-------------|----------|
| `Claude Auto Responder: Toggle Auto Mode` | Toggle Auto Mode on/off | - |
| `Claude Auto Responder: Start Claude Terminal` | Start Claude CLI with monitoring | - |
| `Claude Auto Responder: Send Yes (1)` | Manually send "1" | - |
| `Claude Auto Responder: Send Yes and Don't Ask (2)` | Manually send "2" | - |
| `Claude Auto Responder: Trigger Auto-Response` | Manually trigger dialog detection | - |
| `Claude Auto Responder: Toggle Debug Mode` | Toggle debug mode | - |
| `Claude Auto Responder: Toggle Continuous Mode` | Toggle Continuous Mode with auto-settings | - |

## Configuration

### VS Code Settings
Access via `Ctrl+,` → Search "Claude Auto Responder":

#### Core Settings
- `autoResponseDelaySeconds` (default: 5): Number of seconds to wait before sending auto-response (1-300 seconds)
- `enableDontAskAgain` (default: ON): Enable auto-response for 'Yes, and don't ask again this session' with '2'

#### Continuous Mode
- `enableContinuousMode` (default: OFF): Enable continuous mode for autonomous long-term operations
- `continuousTimeoutMinutes` (default: 30): Minutes to wait before sending 'Continue.' in continuous mode (1-180 minutes)

#### Logging & Monitoring  
- `logSkippedQuestions` (default: ON): Log skipped questions and responses to `.claude-skipped-questions.log`
- `enableTerminalBufferRefresh` (default: ON): Periodically refresh terminal buffer with arrow down key every 60 seconds

#### Safety Features
- `ignoreDestructiveCommandsDetection` (default: OFF): Ignore destructive command detection and proceed with auto-response
- `customBlacklist` (default: empty): Custom list of destructive command patterns to detect (regex supported)

### Debug Mode
For detailed log output:
- `Ctrl+Shift+P` → `Claude Auto Responder: Toggle Debug Mode`
- Check logs in VS Code's "Output" → "Extension Host"

### Log Files
Terminal output is recorded in:
- **Terminal Output**: `.claude-output.log` (auto-rotates at 100 lines, cleaned for readability)
- **Response Log**: `.claude-skipped-questions.log` (contains actual Claude dialog content and responses)
- **Fallback**: `/tmp/claude-output-[timestamp].log`
- **Note**: Files are automatically cleaned up when extension deactivates

## Technical Specifications

### Architecture
- **File-based Monitoring**: Uses `script` command to log terminal output to file
- **Real-time Detection**: Monitors file changes for immediate pattern analysis
- **Low-level Input**: Sends characters individually to handle dialog boxes

### OS Support
- **macOS**: `script -q [file] bash -c "claude --continue || claude"` + `caffeinate`
- **Linux**: `script -q -c "claude --continue || claude" [file]` + `systemd-inhibit`
- **Windows**: `(claude --continue; if (!$?) { claude }) | Tee-Object` + `powercfg`

### Destructive Command Detection Patterns
```regex
/rm\s+-rf/i
/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/i  // fork bomb
/dd\s+if=\/dev\/zero\s+of=\/dev\/sda/i
/mv\s+\/\s/i
/>\s*\/etc\/passwd/i
/mkfs\./i
/drop\s+database\s+/i  // database operations
/delete\s+from\s+\w+\s*;?\s*$/i  // DELETE without WHERE
```

## Troubleshooting

### Claude CLI Won't Start
1. Check if Claude CLI is installed: `claude --version`
2. Verify `claude` command is in PATH

### Auto-detection Not Working
1. Enable Debug Mode and check logs
2. Verify `.claude-output.log` file is created
3. Try manual trigger (`Claude Auto Responder: Trigger Auto-Response`)
4. **Important**: Ensure Claude was started via extension command, not manually

### Dialog Not Recognized
1. Copy dialog text
2. Use `Claude Auto Responder: Trigger Auto-Response` → `Analyze` for manual analysis

## Security

### Destructive Command Protection
- Cancels auto-response for proposals containing dangerous commands
- Shows VS Code warning notification (not modal popup)
- Requires manual confirmation for safety

### Privacy
- Terminal output saved only to local files
- Automatically deleted when extension deactivates
- No external server communication

## License

MIT License - See [LICENSE](LICENSE) file for details
