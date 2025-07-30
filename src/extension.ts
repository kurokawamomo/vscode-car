import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

let statusBarItem: vscode.StatusBarItem;
let isAutoModeEnabled: boolean = false;
let context: vscode.ExtensionContext;
// Remove claudeProcess variable as we're using regular terminal now
let terminal: vscode.Terminal | null = null;
let outputBuffer: string = '';
let lastProcessedOutput: string = '';
let pendingTimeout: NodeJS.Timeout | null = null;
let lastAutoResponse: number = 0;
let statusAnimationInterval: NodeJS.Timeout | null = null;
let waitAnimationInterval: NodeJS.Timeout | null = null;
let animationFrame: number = 0;
let outputLogPath: string = '';
let fileWatcher: vscode.FileSystemWatcher | null = null;
let isWaitingForDialog: boolean = false;
let debugMode: boolean = false;
let caffeineProcess: any = null;

function debugLog(message: string, ...args: any[]) {
  if (debugMode) {
    console.log(`[Claude Auto] ${message}`, ...args);
  }
}

function errorLog(message: string, ...args: any[]) {
  console.error(`[Claude Auto Error] ${message}`, ...args);
}

export function activate(ext: vscode.ExtensionContext) {
  context = ext;
  
  // Get stored state
  isAutoModeEnabled = context.globalState.get('claudeAutoMode', false);
  debugMode = context.globalState.get('claudeDebugMode', false);
  
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'claude-auto-responder.toggle';
  updateStatusBar();
  statusBarItem.show();
  
  // Register commands
  const toggleDisposable = vscode.commands.registerCommand('claude-auto-responder.toggle', () => {
    toggleAutoMode();
  });
  
  const startClaudeDisposable = vscode.commands.registerCommand('claude-auto-responder.startClaude', () => {
    startClaude();
  });
  
  const sendYesDisposable = vscode.commands.registerCommand('claude-auto-responder.sendYes', () => {
    console.log('sendYes command executed');
    sendResponse('1');
  });
  
  const sendYesNoAskDisposable = vscode.commands.registerCommand('claude-auto-responder.sendYesNoAsk', () => {
    console.log('sendYesNoAsk command executed');
    sendResponse('2');
  });
  
  // Removed detectAndRespond and testDetection commands for cleaner UI
  
  // Add manual trigger command
  const triggerAutoResponseDisposable = vscode.commands.registerCommand('claude-auto-responder.triggerAutoResponse', () => {
    debugLog('triggerAutoResponse command executed');
    triggerManualDetection();
  });
  
  // Add debug toggle command
  const toggleDebugDisposable = vscode.commands.registerCommand('claude-auto-responder.toggleDebug', () => {
    debugMode = !debugMode;
    context.globalState.update('claudeDebugMode', debugMode);
    const status = debugMode ? 'enabled' : 'disabled';
    vscode.window.showInformationMessage(`Claude Debug Mode ${status}`);
    console.log(`Claude Auto Debug Mode: ${status}`);
  });
  
  context.subscriptions.push(toggleDisposable);
  context.subscriptions.push(startClaudeDisposable);
  context.subscriptions.push(sendYesDisposable);
  context.subscriptions.push(sendYesNoAskDisposable);
  context.subscriptions.push(triggerAutoResponseDisposable);
  context.subscriptions.push(toggleDebugDisposable);
  context.subscriptions.push(statusBarItem);
  
  // Auto-start Claude if auto mode is enabled
  if (isAutoModeEnabled) {
    startClaude();
  }
}

function toggleAutoMode() {
  isAutoModeEnabled = !isAutoModeEnabled;
  context.globalState.update('claudeAutoMode', isAutoModeEnabled);
  updateStatusBar();
  
  const status = isAutoModeEnabled ? 'enabled' : 'disabled';
  vscode.window.showInformationMessage(`Claude Auto Mode ${status}`);
  
  // Enable/disable sleep prevention
  if (isAutoModeEnabled) {
    startSleepPrevention();
    
    // If enabling and Claude isn't running, offer to start it
    if (!terminal) {
      vscode.window.showInformationMessage(
        'Would you like to start Claude CLI?',
        'Yes', 'No'
      ).then(selection => {
        if (selection === 'Yes') {
          startClaude();
        }
      });
    }
  } else {
    stopSleepPrevention();
    clearState();
  }
}

function startSleepPrevention() {
  if (caffeineProcess) {
    return; // Already running
  }
  
  const os = require('os');
  const { spawn } = require('child_process');
  
  try {
    if (os.platform() === 'darwin') {
      // macOS: use caffeinate
      caffeineProcess = spawn('caffeinate', ['-d'], { stdio: 'ignore' });
      console.log('Started caffeinate for sleep prevention');
    } else if (os.platform() === 'win32') {
      // Windows: use powercfg
      caffeineProcess = spawn('powercfg', ['-change', '-standby-timeout-ac', '0'], { stdio: 'ignore' });
      console.log('Started Windows sleep prevention');
    } else {
      // Linux: use systemd-inhibit or xset
      try {
        caffeineProcess = spawn('systemd-inhibit', ['--what=idle', '--who=Claude Auto Responder', '--why=Monitoring Claude CLI', 'sleep', '86400'], { stdio: 'ignore' });
        console.log('Started systemd-inhibit for sleep prevention');
      } catch (error) {
        // Fallback to xset
        caffeineProcess = spawn('xset', ['s', 'off', '-dpms'], { stdio: 'ignore' });
        console.log('Started xset for sleep prevention');
      }
    }
    
    caffeineProcess.on('error', (error: Error) => {
      debugLog('Sleep prevention error:', error);
      caffeineProcess = null;
    });
    
  } catch (error) {
    debugLog('Failed to start sleep prevention:', error);
  }
}

function stopSleepPrevention() {
  if (caffeineProcess) {
    caffeineProcess.kill();
    caffeineProcess = null;
    console.log('Stopped sleep prevention');
    
    // Restore normal power settings on Windows
    const os = require('os');
    if (os.platform() === 'win32') {
      try {
        const { spawn } = require('child_process');
        spawn('powercfg', ['-change', '-standby-timeout-ac', '30'], { stdio: 'ignore' });
      } catch (error) {
        debugLog('Failed to restore Windows power settings:', error);
      }
    }
  }
}

function updateStatusBar() {
  const terminalStatus = terminal ? ' (Running)' : '';
  
  if (isAutoModeEnabled) {
    startStatusAnimation();
    statusBarItem.tooltip = `Claude Auto Mode: ON${terminalStatus} (Click to toggle)`;
  } else {
    stopStatusAnimation();
    statusBarItem.text = `[✽] ${terminalStatus}`;
    statusBarItem.tooltip = `Claude Auto Mode: OFF${terminalStatus} (Click to toggle)`;
  }
}

function startStatusAnimation() {
  stopStatusAnimation(); // Clear any existing animation
  
  const terminalStatus = terminal ? ' (Running)' : '';
  const frames = [
    `[⇉  ] Claude Auto${terminalStatus}`,
    `[ ⇉ ] Claude Auto${terminalStatus}`,
    `[  ⇉] Claude Auto${terminalStatus}`
  ];
  
  animationFrame = 0;
  statusBarItem.text = frames[animationFrame];
  
  statusAnimationInterval = setInterval(() => {
    animationFrame = (animationFrame + 1) % frames.length;
    statusBarItem.text = frames[animationFrame];
  }, 500);
}

function stopStatusAnimation() {
  if (statusAnimationInterval) {
    clearInterval(statusAnimationInterval);
    statusAnimationInterval = null;
  }
}

function startWaitAnimation() {
  if (isWaitingForDialog) {
    return; // Already in wait animation
  }
  
  isWaitingForDialog = true;
  stopStatusAnimation(); // Stop normal animation
  
  const frames = [
    `[⇉  ] Wait to Proceed!`,
    `[ ⇉ ] Wait to Proceed!`,
    `[  ⇉] Wait to Proceed!`
  ];
  
  let waitFrame = 0;
  statusBarItem.text = frames[waitFrame];
  
  waitAnimationInterval = setInterval(() => {
    waitFrame = (waitFrame + 1) % frames.length;
    statusBarItem.text = frames[waitFrame];
  }, 200);
}

function stopWaitAnimation() {
  if (waitAnimationInterval) {
    clearInterval(waitAnimationInterval);
    waitAnimationInterval = null;
  }
  
  isWaitingForDialog = false;
  
  // Resume normal status animation if auto mode is enabled
  if (isAutoModeEnabled) {
    startStatusAnimation();
  }
}

function startClaude() {
  if (terminal) {
    vscode.window.showInformationMessage('Claude terminal is already running');
    return;
  }

  try {
    // Setup output log file
    setupOutputLogging();
    
    // Create regular terminal for user interaction
    terminal = vscode.window.createTerminal({
      name: 'Claude CLI (Auto Mode)',
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    });
    
    terminal.show();
    
    // Start Claude with output logging
    // Use different approach based on OS and ignore local node version managers
    const os = require('os');
    
    // Set PATH to prioritize global node version and ignore local version managers
    const globalNodeSetup = 'export NODENV_VERSION="" NODEENV_VERSION="" NVM_DIR="" NODE_VERSION_PREFIX=""';
    
    if (os.platform() === 'darwin') {
      // macOS: use script command with global node setup
      terminal.sendText(`${globalNodeSetup} && script -q "${outputLogPath}" claude --continue`);
    } else if (os.platform() === 'win32') {
      // Windows: use PowerShell with Tee-Object for logging
      terminal.sendText(`$env:NODENV_VERSION=""; $env:NODE_VERSION_PREFIX=""; claude --continue | Tee-Object -FilePath "${outputLogPath}"`);
    } else {
      // Linux: use script command with different syntax and global node setup
      terminal.sendText(`${globalNodeSetup} && script -q -c "claude --continue" "${outputLogPath}"`);
    }
    
    // Start file monitoring
    startFileMonitoring();
    
    // Update status bar
    updateStatusBar();

    vscode.window.showInformationMessage('Started Claude CLI with file-based auto-monitoring.');
    
  } catch (error) {
    console.error('Failed to start Claude:', error);
    vscode.window.showErrorMessage(`Failed to start Claude: ${error}`);
  }
}

function setupOutputLogging() {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  
  // Use workspace folder if available, otherwise temp directory
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.tmpdir();
  
  // Platform-specific hidden file naming
  let filename: string;
  if (os.platform() === 'win32') {
    filename = 'claude-output.log'; // Will be made hidden after creation
  } else {
    filename = '.claude-output.log'; // Unix-style hidden file
  }
  
  outputLogPath = path.join(workspaceFolder, filename);
  
  console.log('Output log path:', outputLogPath);
  
  // Clear any existing log file and ensure it exists
  try {
    // Ensure directory exists
    const dir = path.dirname(outputLogPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Create/clear the log file
    fs.writeFileSync(outputLogPath, '', 'utf8');
    console.log('Created/cleared output log file successfully');
    
    // Set hidden attribute on Windows
    if (os.platform() === 'win32') {
      setWindowsHiddenAttribute(outputLogPath);
    }
    
    // Test file is readable
    const testContent = fs.readFileSync(outputLogPath, 'utf8');
    debugLog('File is readable, initial length:', testContent.length);
    
  } catch (error) {
    console.error('Error setting up log file:', error);
    // Fallback to a different location
    outputLogPath = path.join(os.tmpdir(), `claude-output-${Date.now()}.log`);
    console.log('Trying fallback path:', outputLogPath);
    
    try {
      fs.writeFileSync(outputLogPath, '', 'utf8');
      console.log('Fallback log file created successfully');
      
      // Set hidden attribute on Windows for fallback too
      if (os.platform() === 'win32') {
        setWindowsHiddenAttribute(outputLogPath);
      }
    } catch (fallbackError) {
      console.error('Fallback file creation failed:', fallbackError);
      outputLogPath = ''; // Disable file monitoring
    }
  }
}

function setWindowsHiddenAttribute(filePath: string) {
  try {
    const { exec } = require('child_process');
    exec(`attrib +H "${filePath}"`, (error: any) => {
      if (error) {
        debugLog('Could not set hidden attribute:', error);
      } else {
        debugLog('Set hidden attribute for Windows file');
      }
    });
  } catch (error) {
    debugLog('Failed to set Windows hidden attribute:', error);
  }
}

function startFileMonitoring() {
  if (!outputLogPath) {
    console.log('No valid log path, skipping file monitoring');
    return;
  }
  
  console.log('Starting file-based monitoring for:', outputLogPath);
  
  try {
    // Create file watcher
    fileWatcher = vscode.workspace.createFileSystemWatcher(outputLogPath);
    
    // Watch for file changes
    fileWatcher.onDidChange(() => {
      if (isAutoModeEnabled) {
        console.log('File changed, analyzing...');
        readAndAnalyzeLogFile();
      }
    });
    
    context.subscriptions.push(fileWatcher);
    
    console.log('File monitoring started successfully');
    
    // Also set up periodic checking as backup
    const checkInterval = setInterval(() => {
      if (isAutoModeEnabled && outputLogPath) {
        readAndAnalyzeLogFile();
      } else if (!isAutoModeEnabled) {
        clearInterval(checkInterval);
      }
    }, 2000); // Check every 2 seconds
    
  } catch (error) {
    console.error('Error starting file monitoring:', error);
  }
}

async function readAndAnalyzeLogFile() {
  if (!outputLogPath) {
    return;
  }
  
  try {
    const fs = require('fs');
    
    // Check if file exists before reading
    if (!fs.existsSync(outputLogPath)) {
      debugLog('Log file does not exist yet');
      return;
    }
    
    const content = fs.readFileSync(outputLogPath, 'utf8');
    
    if (content.length === 0) {
      debugLog('Log file is empty');
      return;
    }
    
    // Keep only last 100 lines to manage file size
    const lines = content.split('\n');
    const trimmedLines = lines.slice(-100);
    const trimmedContent = trimmedLines.join('\n');
    
    debugLog('Read log file content length:', content.length);
    debugLog('Last 200 chars:', JSON.stringify(trimmedContent.slice(-200)));
    
    // Only process if content has changed
    if (trimmedContent !== outputBuffer) {
      outputBuffer = trimmedContent;
      
      // If original content was more than 100 lines, rotate the log file
      if (lines.length > 100) {
        try {
          fs.writeFileSync(outputLogPath, trimmedContent, 'utf8');
          debugLog('Rotated log file to keep last 100 lines');
        } catch (error) {
          debugLog('Failed to rotate log file:', error);
        }
      }
      
      checkForPrompts(''); // Trigger pattern check
    }
    
  } catch (error) {
    errorLog('Error reading log file:', error);
  }
}

// File monitoring is now used instead of alternative monitoring

// Monitoring is now handled directly in the pseudoterminal

function triggerManualDetection() {
  if (!terminal || !isAutoModeEnabled) {
    vscode.window.showWarningMessage('Auto mode is disabled or no terminal found');
    return;
  }
  
  console.log('Manual detection triggered - analyzing current terminal state');
  
  // Start wait animation immediately
  startWaitAnimation();
  
  // Try to analyze terminal content using multiple methods
  analyzeTerminalContent().then((dialogType) => {
    if (dialogType) {
      console.log(`Detected dialog type: ${dialogType}`);
      const response = dialogType === 'do_you_want' ? '1' : '2';
      autoSendResponse(response);
    } else {
      console.log('No dialog pattern detected, defaulting to "1"');
      autoSendResponse('1');
    }
    stopWaitAnimation();
  }).catch((error) => {
    console.log('Error analyzing terminal content:', error);
    // Fallback to "1"
    autoSendResponse('1');
    stopWaitAnimation();
  });
}

async function analyzeTerminalContent(): Promise<string | null> {
  console.log('Attempting to analyze terminal content...');
  
  // Method 1: Try to use clipboard (if user has copied terminal content)
  try {
    const clipboardContent = await vscode.env.clipboard.readText();
    console.log('Clipboard content:', clipboardContent);
    
    if (clipboardContent && clipboardContent.includes('╭─')) {
      console.log('Found dialog pattern in clipboard');
      return analyzeDialogPattern(clipboardContent);
    }
  } catch (error) {
    console.log('Could not read clipboard:', error);
  }
  
  // Method 2: Ask user to copy terminal content
  const action = await vscode.window.showInformationMessage(
    'Please select and copy the dialog text, then click "Analyze"',
    'Analyze', 'Skip'
  );
  
  if (action === 'Analyze') {
    try {
      const copiedContent = await vscode.env.clipboard.readText();
      console.log('User copied content:', copiedContent);
      return analyzeDialogPattern(copiedContent);
    } catch (error) {
      console.log('Could not read user copied content:', error);
    }
  }
  
  return null;
}

function analyzeDialogPattern(content: string): string | null {
  const lowerContent = content.toLowerCase();
  
  console.log('Analyzing dialog pattern in content:', content.substring(0, 200));
  
  // Check for destructive commands first
  if (hasDestructiveCommand(content)) {
    vscode.window.showWarningMessage(
      '⚠️ Destructive command detected! Auto-response cancelled.'
    );
    return null;
  }
  
  // Check for "Yes, and don't ask again this session"
  if (lowerContent.includes("yes, and don't ask again this session")) {
    console.log('Detected "don\'t ask again" pattern');
    return 'dont_ask_again';
  }
  
  // Check for "Do you want to" pattern
  if (lowerContent.includes('do you want to')) {
    console.log('Detected "do you want to" pattern');
    return 'do_you_want';
  }
  
  console.log('No specific pattern detected');
  return null;
}

// Removed detectAndAutoRespond function - functionality replaced by triggerManualDetection

function sendResponse(response: string) {
  console.log(`sendResponse called with: ${response}`);
  console.log(`terminal exists: ${!!terminal}`);
  console.log(`terminal name: ${terminal?.name}`);
  console.log(`isAutoModeEnabled: ${isAutoModeEnabled}`);
  
  // Check active terminal
  const activeTerminal = vscode.window.activeTerminal;
  console.log(`active terminal exists: ${!!activeTerminal}`);
  console.log(`active terminal name: ${activeTerminal?.name}`);
  console.log(`are they the same terminal: ${terminal === activeTerminal}`);
  
  // Try sending to active terminal if it's different from our stored terminal
  const targetTerminal = activeTerminal || terminal;
  
  if (targetTerminal) {
    console.log(`Sending "${response}" to terminal: ${targetTerminal.name}`);
    
    // Use the working method: Send as individual keystrokes
    response.split('').forEach((char, index) => {
      setTimeout(() => {
        targetTerminal.sendText(char, false);
      }, index * 50);
    });
    setTimeout(() => {
      targetTerminal.sendText('\n', false);
    }, response.length * 50 + 100);
    
    // Update last auto-response timestamp
    lastAutoResponse = Date.now();
    
    console.log(`Successfully sent response: ${response} to terminal: ${targetTerminal.name}`);
    vscode.window.showInformationMessage(`Response sent: ${response} to ${targetTerminal.name}`);
  } else {
    console.log('No terminal found');
    vscode.window.showErrorMessage('No active terminal found. Please open a terminal first.');
  }
}

// Terminal output monitoring is handled in startMonitoring function

function checkForPrompts(output: string) {
  // Add to buffer
  outputBuffer += output;
  
  // Keep buffer manageable (last 10000 characters)
  if (outputBuffer.length > 10000) {
    outputBuffer = outputBuffer.slice(-10000);
  }

  console.log('Checking output for prompts. Buffer length:', outputBuffer.length);

  // Check for box pattern (╭─)
  const hasBox = /╭─/.test(outputBuffer);
  
  if (hasBox) {
    console.log('Found box pattern (╭─), checking for response patterns...');
    
    const lowerOutput = outputBuffer.toLowerCase();
    
    // Check if the box contains "Do you want to" or "Yes, and don't ask again"
    const hasDoYouWant = lowerOutput.includes('do you want to');
    const hasDontAskAgain = lowerOutput.includes("yes, and don't ask again this session");
    
    if (hasDoYouWant || hasDontAskAgain) {
      console.log('Found actionable dialog pattern, starting 5-second wait...');
      
      // Start wait animation only for actionable dialogs
      startWaitAnimation();
      
      // Clear any existing timeout
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        pendingTimeout = null;
      }
      
      // Set timeout to check for auto-response after 5 seconds
      pendingTimeout = setTimeout(() => {
        checkForAutoResponse();
      }, 5000);
    } else {
      console.log('Box pattern found but no actionable dialog detected');
    }
  }
}

function checkForAutoResponse() {
  console.log('Checking for auto-response after 5-second wait...');
  
  // Stop wait animation
  stopWaitAnimation();
  
  if (!isAutoModeEnabled || !terminal) {
    console.log('Auto mode disabled or no terminal');
    return;
  }

  const lowerOutput = outputBuffer.toLowerCase();
  console.log('Analyzing buffer content for patterns...');
  
  // Check for "Do you want to" pattern
  if (lowerOutput.includes('do you want to')) {
    console.log('Found "Do you want to" pattern, sending response "1"');
    
    // Check for destructive commands first
    if (hasDestructiveCommand(outputBuffer)) {
      vscode.window.showWarningMessage(
        '⚠️ Destructive command detected! Auto-response cancelled. Please review the proposal manually.'
      );
      clearState();
      return;
    }
    
    // Use the working low-level input method
    autoSendResponse('1');
    clearState();
    return;
  }
  
  // Check for "Yes, and don't ask again this session"
  if (lowerOutput.includes("yes, and don't ask again this session")) {
    console.log('Found "don\'t ask again" pattern, sending response "2"');
    
    // Check for destructive commands first
    if (hasDestructiveCommand(outputBuffer)) {
      vscode.window.showWarningMessage(
        '⚠️ Destructive command detected! Auto-response cancelled. Please review the proposal manually.'
      );
      clearState();
      return;
    }
    
    // Use the working low-level input method
    autoSendResponse('2');
    clearState();
    return;
  }
  
  console.log('No recognized prompt pattern found in buffer');
}

function autoSendResponse(response: string) {
  if (!terminal) return;
  
  console.log(`Auto-sending response: ${response}`);
  
  // Use the working method: Send as individual keystrokes
  response.split('').forEach((char, index) => {
    setTimeout(() => {
      terminal!.sendText(char, false);
    }, index * 50);
  });
  setTimeout(() => {
    terminal!.sendText('\n', false);
  }, response.length * 50 + 100);
  
  // Update last auto-response timestamp
  lastAutoResponse = Date.now();
  
  vscode.window.showInformationMessage(`Auto-response sent: ${response}`);
}

function hasDestructiveCommand(text: string): boolean {
  const destructivePatterns = [
    // File system operations
    /rm\s+-rf/i,
    /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/i, // fork bomb
    /dd\s+if=\/dev\/zero\s+of=\/dev\/sda/i,
    /mv\s+\/\s/i,
    />\s*\/etc\/passwd/i,
    />\s*\/etc\/shadow/i,
    />\s*\/etc\/hosts/i,
    /mkfs\./i,
    /format\s+c:/i,
    
    // Database destructive operations
    /drop\s+database\s+/i,
    /drop\s+table\s+/i,
    /drop\s+schema\s+/i,
    /truncate\s+table\s+/i,
    /delete\s+from\s+\w+\s*;?\s*$/i, // DELETE without WHERE clause
    /update\s+\w+\s+set\s+.*\s*;?\s*$/i, // UPDATE without WHERE clause
    /alter\s+table\s+\w+\s+drop\s+/i,
    /create\s+or\s+replace\s+/i,
    
    // MySQL specific
    /mysqldump\s+.*--single-transaction.*--routines.*--triggers/i,
    /mysql\s+.*-e\s+["']drop/i,
    
    // PostgreSQL specific
    /psql\s+.*-c\s+["']drop/i,
    /pg_dump\s+.*--clean/i,
    /dropdb\s+/i,
    /createdb\s+.*--template.*template0/i
  ];
  
  return destructivePatterns.some(pattern => pattern.test(text));
}

function clearState() {
  outputBuffer = '';
  lastProcessedOutput = '';
  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
  // Stop wait animation when clearing state
  stopWaitAnimation();
}

export function deactivate() {
  // Clear any pending timeouts
  clearState();
  
  // Stop animations
  stopStatusAnimation();
  stopWaitAnimation();
  
  // Stop sleep prevention
  stopSleepPrevention();
  
  // Cleanup file watcher
  if (fileWatcher) {
    fileWatcher.dispose();
    fileWatcher = null;
  }
  
  // Cleanup log file
  if (outputLogPath) {
    try {
      const fs = require('fs');
      fs.unlinkSync(outputLogPath);
      console.log('Cleaned up log file');
    } catch (error) {
      console.log('Could not clean up log file:', error);
    }
  }
  
  if (statusBarItem) {
    statusBarItem.dispose();
  }
  
  if (terminal) {
    terminal.dispose();
  }
}