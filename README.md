# Claude Auto Responder for VS Code

A VS Code extension that automates interactions with Claude CLI by automatically responding to confirmation dialogs, streamlining your development workflow.
Now you can safely take a nap or do the dishes while your code finishes itself.*

\*Auto-diaper-change feature not yet implemented.

## 🚀 Features

### 🤖 Automatic Response
- Automatically detects dialogs enclosed in `╭─` boxes
- `"Do you want to"` pattern → Sends `1` (Yes) automatically
- `"Yes, and don't ask again this session"` pattern → Sends `2` automatically
- 5-second wait period allows for manual intervention

### 🛡️ Safety Features
- **Destructive Command Detection**: Detects `rm -rf`, fork bombs, database operations, etc. and cancels auto-response
- **Manual Confirmation**: Warns users when dangerous commands are detected

### 🎨 User Interface
- **Animated Status Bar**: 
  - `[⇉  ] Claude Auto` (normal operation)
  - `[⇉  ] Wait to Proceed!` (5-second wait period)
- **One-Click Toggle**: Click status bar to enable/disable Auto Mode

### ⚡ System Integration
- **Sleep Prevention**: Prevents automatic sleep during Auto Mode
  - macOS: `caffeinate`
  - Windows: `powercfg`
  - Linux: `systemd-inhibit` / `xset`

## 📦 Installation

### Prerequisites
- VS Code 1.74.0 or higher
- Claude CLI (`claude --continue` command available)

### Installation Steps
1. Clone this repository
2. Open in VS Code
3. Press F5 to launch debug mode
4. Test the extension in the new window

## 🎯 Usage

### Basic Usage

1. **Enable Auto Mode**
   - Click `[✽]` in the status bar
   - Or `Ctrl+Shift+P` → `Claude Auto Mode: Toggle`
   - Or `Option+Shift+Tab` (macOS)

2. **Start Claude CLI**
   - Auto-start option appears when Auto Mode is enabled
   - Or manually start via `Ctrl+Shift+P` → commands

3. **Automatic Response**
   - When a dialog appears, automatically waits 5 seconds
   - Status bar changes to `Wait to Proceed!` animation
   - Automatically sends appropriate response

### Manual Trigger

If automatic detection doesn't work:
- `Ctrl+Shift+P` → `Claude: Trigger Auto-Response`
- Copy dialog text for analysis

## 🎛️ Command Reference

| Command | Description | Shortcut |
|---------|-------------|----------|
| `Claude Auto Mode: Toggle` | Toggle Auto Mode on/off | `Option+Shift+Tab` |
| `Claude: Send Yes (1)` | Manually send "1" | - |
| `Claude: Send Yes and Don't Ask (2)` | Manually send "2" | - |
| `Claude: Trigger Auto-Response` | Manually trigger dialog detection | - |
| `Claude: Toggle Debug Mode` | Toggle debug mode | - |

## ⚙️ Configuration

### Debug Mode
For detailed log output:
- `Ctrl+Shift+P` → `Claude: Toggle Debug Mode`
- Check logs in VS Code's "Output" → "Extension Host"

### Log Files
Terminal output is recorded in:
- Workspace: `.claude-output.log`
- Fallback: `/tmp/claude-output-[timestamp].log`

## 🔧 Technical Specifications

### Architecture
- **File-based Monitoring**: Uses `script` command to log terminal output to file
- **Real-time Detection**: Monitors file changes for immediate pattern analysis
- **Low-level Input**: Sends characters individually to handle dialog boxes

### OS Support
- **macOS**: `script -q [file] [command]` + `caffeinate`
- **Linux**: `script -q -c "[command]" [file]` + `systemd-inhibit`
- **Windows**: Basic support + `powercfg`

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

## 🐛 Troubleshooting

### Claude CLI Won't Start
1. Check if Claude CLI is installed: `claude --version`
2. Verify `claude` command is in PATH

### Auto-detection Not Working
1. Enable Debug Mode and check logs
2. Verify `.claude-output.log` file is created
3. Try manual trigger (`Claude: Trigger Auto-Response`)

### Dialog Not Recognized
1. Copy dialog text
2. Use `Claude: Trigger Auto-Response` → `Analyze` for manual analysis

## 🔒 Security

### Destructive Command Protection
- Cancels auto-response for proposals containing dangerous commands
- Shows modal warning to user
- Requires manual confirmation

### Privacy
- Terminal output saved only to local files
- Automatically deleted when extension deactivates
- No external server communication

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details
