import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { debug } from 'console';

let statusBarItem: vscode.StatusBarItem;
let isAutoModeEnabled: boolean = false;
let context: vscode.ExtensionContext;
// Remove claudeProcess variable as we're using regular terminal now
let terminal: vscode.Terminal | null = null;
let outputBuffer: string = '';
let lastProcessedOutput: string = '';
let pendingTimeout: NodeJS.Timeout | null = null;
let lastFileReadTime: number = 0;
const FILE_READ_THROTTLE_MS = 500; // Throttle file reads to max once per 500ms
let lastFileWatchTime: number = 0;
const FILE_WATCH_THROTTLE_MS = 1000; // Throttle file watch events to max once per 1000ms
let lastAutoResponse: number = 0;
let statusAnimationInterval: NodeJS.Timeout | null = null;
let waitAnimationInterval: NodeJS.Timeout | null = null;
let countdownInterval: NodeJS.Timeout | null = null;
let animationFrame: number = 0;
let outputLogPath: string = '';
let fileWatcher: vscode.FileSystemWatcher | null = null;
let isWaitingForDialog: boolean = false;
let debugMode: boolean = false;
let caffeineProcess: any = null;
let lastActivityTime = Date.now();
let idleCheckInterval: NodeJS.Timeout | null = null;
let isCaffeinePaused = false;

// Continuous mode response monitoring
let isContinuousPaused = false;
let continuousPauseReason: 'fast' | 'limit' | null = null;
let fastResponseCount = 0;
let lastContinueTime = 0;

// Constants for continuous mode
const IDLE_CHECK_COOLDOWN_MS = 500;
const MAX_CONSECUTIVE_FAILURES = 2;
const COUNTDOWN_UPDATE_INTERVAL_MS = 1000;

// Continuous mode variables
let continuousTimeout: NodeJS.Timeout | null = null;
let lastOutputChange: number = 0;
let isContinuousMode: boolean = false;
let continuousCountdownInterval: NodeJS.Timeout | null = null;
let continuousEndTime: number = 0;
let consecutiveIdleCheckFailures: number = 0;
let lastFailureTime: number = 0;
let continuousCheckInterval: NodeJS.Timeout | null = null;

// Dashboard notification system (removed unused variable)

function debugLog(message: string, ...args: any[]) {
  if (debugMode) {
    console.log(`[Claude Auto] ${message}`, ...args);
  }
}

function errorLog(message: string, ...args: any[]) {
  console.error(`[Claude Auto Error] ${message}`, ...args);
}

function showDashboardNotification() {
  // Note: VS Code notifications are promises and cannot be dismissed programmatically
  // The notification will auto-close when a new one is shown
  
  const config = getConfiguration();
  
  // Build dashboard content with compact emoji format
  let modeIcon: string;
  if (!isAutoModeEnabled) {
    modeIcon = "⏸️"; // Paused
  } else if (isContinuousMode) {
    modeIcon = "🔄"; // Continuous
  } else {
    modeIcon = "▶️"; // Playing/Auto
  }
  
  // Check if terminal is actually running (not just exists)
  const isTerminalRunning: boolean = !!(terminal && terminal.exitStatus === undefined);
  let terminalStatus = isTerminalRunning ? "✅" : "Terminal Disconnected ❌";
  
  // First line: Mode and Terminal status
  let line1 = `${terminalStatus} Mode: ${modeIcon}`;
  
  // Second line: Wait and Continue times
  let line2 = `${config.autoResponseDelaySeconds}s`;
  if (isContinuousMode) {
    line2 += `/${config.continuousTimeoutMinutes}m`;
  }
  
  // Third line: Status flags with emojis
  let statusFlags: string[] = [];
  
  // 🆖 = Detect destructive
  statusFlags.push(config.ignoreDestructiveCommandsDetection ? "⚠️⚠️⚠️" : "");
  
  // ⏩ = Don't ask again  
  statusFlags.push(config.enableDontAskAgain ? "⏩" : "");
  
  // ⬇️ = Buffer refresh
  statusFlags.push(config.enableTerminalBufferRefresh ? "⬇️" : "");
  
  // ℹ️ = Log - Check asynchronously to prevent blocking
  let line3 = statusFlags.length ? `🛠️(${statusFlags.filter(v=>v).join(" ")})` : ``;
  
  // Use async file check to prevent blocking
  if (outputLogPath) {
    const fs = require('fs').promises;
    fs.access(outputLogPath).then(() => {
      // Log file exists, add flag
      line3 = statusFlags.length ? `🛠️(${statusFlags.filter(v=>v).join(" ")} ℹ️)` : `🛠️(ℹ️)`;
      showNotificationWithContent(line1, line2, line3, isTerminalRunning);
    }).catch(() => {
      // Log file doesn't exist, show without log flag
      showNotificationWithContent(line1, line2, line3, isTerminalRunning);
    });
  } else {
    showNotificationWithContent(line1, line2, line3, isTerminalRunning);
  }
}

function showNotificationWithContent(line1: string, line2: string, line3: string, isTerminalRunning: boolean) {
  // Build notification message
  const message = `${line1}${isTerminalRunning ? `\n${line2}\n${line3}` : ``}`;
  
  // Show notification with dashboard info
  vscode.window.showInformationMessage(message, "Settings").then(selection => {
    if (selection === "Settings") {
      vscode.commands.executeCommand('workbench.action.openSettings', 'claudeAutoResponder');
    }
  });
}

function getConfiguration() {
  const config = vscode.workspace.getConfiguration('claudeAutoResponder');
  return {
    logSkippedQuestions: config.get<boolean>('logSkippedQuestions', true),
    ignoreDestructiveCommandsDetection: config.get<boolean>('ignoreDestructiveCommandsDetection', false),
    customBlacklist: config.get<string[]>('customBlacklist', []),
    enableTerminalBufferRefresh: config.get<boolean>('enableTerminalBufferRefresh', true),
    autoResponseDelaySeconds: config.get<number>('autoResponseDelaySeconds', 5),
    enableDontAskAgain: config.get<boolean>('enableDontAskAgain', true),
    enableContinuousMode: config.get<boolean>('enableContinuousMode', false),
    continuousTimeoutMinutes: config.get<number>('continuousTimeoutMinutes', 30),
    idleSleepPreventionMinutes: config.get<number>('idleSleepPreventionMinutes', 10),
    // Hidden settings - only configurable via JSON editing
    shortResponseThreshold: config.get<number>('shortResponseThreshold', 50),
    shortResponseLimit: config.get<number>('shortResponseLimit', 10),
    enableFastResponsePause: config.get<boolean>('enableFastResponsePause', true),
    fastResponseTimeoutSeconds: config.get<number>('fastResponseTimeoutSeconds', 5), // Changed from 3 to 5
    fastResponseLimit: config.get<number>('fastResponseLimit', 5),
    enableUsageLimitAutoSwitch: config.get<boolean>('enableUsageLimitAutoSwitch', false)
  };
}

export function activate(ext: vscode.ExtensionContext) {
  context = ext;
  
  // Get stored state
  isAutoModeEnabled = context.globalState.get('claudeAutoMode', false);
  isContinuousMode = context.globalState.get('claudeContinuousMode', false);
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
  
  // Add resume continuous command
  const resumeContinuousDisposable = vscode.commands.registerCommand('claude-auto-responder.resumeContinuous', () => {
    if (isContinuousPaused) {
      console.log('Manual resume of continuous mode requested');
      resumeContinuousMode();
      vscode.window.showInformationMessage('Continuous mode resumed manually');
    } else {
      vscode.window.showInformationMessage('Continuous mode is not paused');
    }
  });
  
  // Add continuous mode toggle command
  const toggleContinuousDisposable = vscode.commands.registerCommand('claude-auto-responder.toggleContinuous', () => {
    const config = getConfiguration();
    if (!config.enableContinuousMode) {
      // Auto-enable continuous mode in settings when user tries to use it
      vscode.workspace.getConfiguration('claudeAutoResponder').update('enableContinuousMode', true, vscode.ConfigurationTarget.Global)
        .then(() => {
          vscode.window.showInformationMessage('Continuous mode has been enabled in settings and activated.');
          // Directly activate continuous mode
          isAutoModeEnabled = true;
          isContinuousMode = true;
          activateContinuousMode();
        });
      return;
    }
    
    if (!isAutoModeEnabled) {
      // If off, enable Auto mode first
      isAutoModeEnabled = true;
      isContinuousMode = false;
    } else if (!isContinuousMode) {
      // If Auto, switch to Continuous
      isContinuousMode = true;
    } else {
      // If Continuous, switch to Off
      isAutoModeEnabled = false;
      isContinuousMode = false;
    }
    
    activateContinuousMode();
  });
  
  function activateContinuousMode() {
    context.globalState.update('claudeAutoMode', isAutoModeEnabled);
    context.globalState.update('claudeContinuousMode', isContinuousMode);
    updateStatusBar();
    
    let status = 'Off';
    if (isAutoModeEnabled && isContinuousMode) {
      status = 'Continuous';
    } else if (isAutoModeEnabled) {
      status = 'Auto';
    }
    
    showDashboardNotification();
    
    // Handle sleep prevention and monitoring
    if (isAutoModeEnabled) {
      startSleepPrevention();
      startIdleMonitoring();
      
      if (outputLogPath) {
        startFileMonitoring();
      }
      
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
      
      // Start continuous monitoring if in continuous mode
      if (isContinuousMode) {
        startContinuousMonitoring();
      }
    } else {
      stopSleepPrevention();
      stopIdleMonitoring();
      stopContinuousMonitoring();
      clearState();
    }
  }
  
  context.subscriptions.push(toggleDisposable);
  context.subscriptions.push(startClaudeDisposable);
  context.subscriptions.push(sendYesDisposable);
  context.subscriptions.push(sendYesNoAskDisposable);
  context.subscriptions.push(triggerAutoResponseDisposable);
  context.subscriptions.push(toggleDebugDisposable);
  context.subscriptions.push(resumeContinuousDisposable);
  context.subscriptions.push(toggleContinuousDisposable);
  context.subscriptions.push(statusBarItem);
  
  // Auto-start Claude if auto mode is enabled
  if (isAutoModeEnabled) {
    startClaude();
  }
}

function toggleAutoMode() {
  // 3-state toggle: Off -> Auto -> Continuous -> Off
  if (!isAutoModeEnabled && !isContinuousMode) {
    // Off -> Auto
    isAutoModeEnabled = true;
    isContinuousMode = false;
  } else if (isAutoModeEnabled && !isContinuousMode) {
    // Auto -> Continuous
    const config = getConfiguration();
    if (config.enableContinuousMode) {
      isAutoModeEnabled = true;
      isContinuousMode = true;
    } else {
      // Skip continuous if disabled, go to Off
      isAutoModeEnabled = false;
      isContinuousMode = false;
    }
  } else {
    // Continuous -> Off
    isAutoModeEnabled = false;
    isContinuousMode = false;
  }
  
  // Use async state updates to prevent blocking
  Promise.all([
    context.globalState.update('claudeAutoMode', isAutoModeEnabled),
    context.globalState.update('claudeContinuousMode', isContinuousMode)
  ]).then(() => {
    updateStatusBar();
    
    let status = 'disabled';
    if (isAutoModeEnabled && isContinuousMode) {
      status = 'continuous';
    } else if (isAutoModeEnabled) {
      status = 'auto';
    }
    
    // Defer dashboard notification to next tick to prevent blocking
    setTimeout(() => {
      showDashboardNotification();
    }, 0);
    
    debugLog(`Claude Mode: ${status}, outputLogPath: ${outputLogPath}, terminal: ${terminal ? terminal.name : 'none'}`);
    
    // Enable/disable sleep prevention and continuous monitoring
    if (isAutoModeEnabled) {
      startSleepPrevention();
      startIdleMonitoring();
      
      // Reload log file if auto mode is resumed
      if (outputLogPath) {
        startFileMonitoring();
      }

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
      
      // Start continuous monitoring if in continuous mode
      if (isContinuousMode) {
        startContinuousMonitoring();
      }
    } else {
      stopSleepPrevention();
      stopIdleMonitoring();
      clearState();
    }
  }).catch(error => {
    console.error('Failed to update extension state:', error);
    // Fallback to synchronous updates
    updateStatusBar();
  });
}

function startSleepPrevention() {
  if (caffeineProcess) {
    console.log('Sleep prevention already running, skipping start');
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
  
  console.log('startSleepPrevention completed, isContinuousPaused:', isContinuousPaused);
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

function updateActivityTime() {
  lastActivityTime = Date.now();
  
  // Only resume caffeinate if it was paused due to idle AND we're not in continuous pause
  if (isCaffeinePaused && isAutoModeEnabled && !isContinuousPaused) {
    console.log('Activity detected - resuming sleep prevention');
    isCaffeinePaused = false;
    startSleepPrevention();
  }
  
  // Do NOT automatically resume continuous mode here - let it stay paused
}

function checkIdleTimeout() {
  if (!isAutoModeEnabled || !caffeineProcess || isCaffeinePaused) {
    return;
  }
  
  const config = getConfiguration();
  const idleTimeoutMs = config.idleSleepPreventionMinutes * 60 * 1000;
  const idleTime = Date.now() - lastActivityTime;
  
  if (idleTime >= idleTimeoutMs) {
    console.log(`Idle for ${config.idleSleepPreventionMinutes} minutes - pausing sleep prevention`);
    isCaffeinePaused = true;
    stopSleepPrevention();
    
    // Show notification
    vscode.window.showInformationMessage(
      `Claude Auto Responder: Sleep prevention paused due to ${config.idleSleepPreventionMinutes} minutes of inactivity`
    );
  }
}

function startIdleMonitoring() {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
  }
  
  // Check every minute
  idleCheckInterval = setInterval(() => {
    checkIdleTimeout();
  }, 60000);
  
  // Initial check
  checkIdleTimeout();
}

function stopIdleMonitoring() {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
  isCaffeinePaused = false;
}

function updateStatusBar() {
  if (isAutoModeEnabled) {
    if (terminal) {
      startStatusAnimation();
      const mode = isContinuousMode ? 'Continuous' : 'Auto';
      statusBarItem.tooltip = `Claude ${mode} Mode: ON (Running) (Click to toggle)`;
    } else {
      stopStatusAnimation();
      statusBarItem.text = `[⇉] Click to Start Claude Terminal`;
      const mode = isContinuousMode ? 'Continuous' : 'Auto';
      statusBarItem.tooltip = `Claude ${mode} Mode: ON (No terminal) - Click to start Claude CLI`;
    }
  } else {
    stopStatusAnimation();
    statusBarItem.text = `[✽] Click to Start Claude Terminal`;
    statusBarItem.tooltip = `Claude Mode: OFF - Click to start Claude CLI`;
  }
}

function startStatusAnimation() {
  stopStatusAnimation(); // Clear any existing animation
  
  // Defensive check to ensure statusBarItem exists
  if (!statusBarItem) {
    console.error('StatusBarItem not initialized');
    return;
  }
  
  const terminalStatus = terminal ? ' (Running)' : '';
  const modeName = isContinuousMode ? 'Continuous' : 'Auto';
  
  let frames: string[];
  
  // PRIORITY: Wait animation takes precedence over everything else
  if (isWaitingForDialog) {
    // Wait animation is handled separately in startWaitAnimation, don't override here
    return;
  }
  
  if (isContinuousMode) {
    // Check if continuous mode is paused
    if (isContinuousPaused) {
      const pauseLabel = continuousPauseReason === 'limit' ? 'Limit' : 'Pause';
      frames = [
        `[${pauseLabel}] Claude ${modeName}${terminalStatus}`,
        `[${pauseLabel}] Claude ${modeName}${terminalStatus}`
      ];
    } else if (continuousEndTime > 0) {
      // Continuous mode shows countdown timer
      const remainingMs = Math.max(0, continuousEndTime - Date.now());
      const totalMinutes = Math.floor(remainingMs / 60000);
      const totalSeconds = Math.floor((remainingMs % 60000) / 1000);
      const timeStr = `${String(totalMinutes).padStart(2, '0')}:${String(totalSeconds).padStart(2, '0')}`;
      
      frames = [
        `[${timeStr}] Claude ${modeName}${terminalStatus}`,
        `[${timeStr}] Claude ${modeName}${terminalStatus}`
      ];
    } else {
      // No countdown active, show normal animation
      frames = [
        `[  ⇉  ] Claude ${modeName}${terminalStatus}`,
        `[   ⇉ ] Claude ${modeName}${terminalStatus}`,
        `[    ⇉] Claude ${modeName}${terminalStatus}`,
        `[⇉    ] Claude ${modeName}${terminalStatus}`,
        `[ ⇉   ] Claude ${modeName}${terminalStatus}`
      ];
    }
  } else {
    // Auto mode has normal spacing
    frames = [
      `[⇉  ] Claude ${modeName}${terminalStatus}`,
      `[ ⇉ ] Claude ${modeName}${terminalStatus}`,
      `[  ⇉] Claude ${modeName}${terminalStatus}`
    ];
  }
  
  animationFrame = 0;
  statusBarItem.text = frames[animationFrame];
  
  // Determine animation speed based on mode and state
  let intervalSpeed: number;
  if (isWaitingForDialog) {
    intervalSpeed = 500; // Slower when waiting for dialog
  } else if (isContinuousMode && continuousEndTime > 0) {
    intervalSpeed = 1000; // Update countdown every second
  } else if (isContinuousPaused) {
    intervalSpeed = 2000; // Slower animation when paused
  } else {
    intervalSpeed = 800; // Normal animation speed
  }
  
  // Add error handling to prevent animation crashes
  try {
    statusAnimationInterval = setInterval(() => {
      if (!statusBarItem) {
        clearInterval(statusAnimationInterval!);
        statusAnimationInterval = null;
        return;
      }
      
      animationFrame = (animationFrame + 1) % frames.length;
      statusBarItem.text = frames[animationFrame];
    }, intervalSpeed);
  } catch (error) {
    console.error('Failed to start status animation:', error);
    // Fallback to static display
    if (statusBarItem) {
      statusBarItem.text = `[⇉] Claude ${modeName}${terminalStatus}`;
    }
  }
}

function stopStatusAnimation() {
  if (statusAnimationInterval) {
    clearInterval(statusAnimationInterval);
    statusAnimationInterval = null;
  }
}

function startWaitAnimation() {
  console.log(`🟡 startWaitAnimation called, current mode: ${isContinuousMode ? 'Continuous' : 'Auto'}, isWaitingForDialog: ${isWaitingForDialog}`);
  
  if (isWaitingForDialog) {
    console.log('⚠️ Already in wait animation, skipping');
    return; // Already in wait animation
  }
  
  const config = getConfiguration();
  
  isWaitingForDialog = true;
  stopStatusAnimation(); // Stop normal animation
  console.log('🟡 Entering Wait mode for', config.autoResponseDelaySeconds, 'seconds');
  console.log('🟡 Wait animation starting, statusBarItem.text will be set to Wait frames');
  let countdown = config.autoResponseDelaySeconds;
  let waitFrame = 0;
  
  const frames = [
    `[ ⇉  ] Wait ${countdown}s`,
    `[  ⇉ ] Wait ${countdown}s`,
    `[   ⇉] Wait ${countdown}s`
  ];
  
  statusBarItem.text = frames[waitFrame];
  
  // Fast animation with countdown
  waitAnimationInterval = setInterval(() => {
    waitFrame = (waitFrame + 1) % frames.length;
    
    // Update frames with current countdown
    const updatedFrames = [
      `[ ⇉  ] Wait ${countdown}s`,
      `[  ⇉ ] Wait ${countdown}s`,
      `[   ⇉] Wait ${countdown}s`
    ];
    
    statusBarItem.text = updatedFrames[waitFrame];
  }, 100); // Faster animation (100ms instead of 200ms)
  
  // Countdown timer (every second)
  countdownInterval = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      countdown = 0; // Ensure it doesn't go negative
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }
  }, 1000);
}

function stopWaitAnimation() {
  if (waitAnimationInterval) {
    clearInterval(waitAnimationInterval);
    waitAnimationInterval = null;
  }
  
  if (countdownInterval) {
    clearInterval(countdownInterval as NodeJS.Timeout);
    countdownInterval = null;
  }
  
  isWaitingForDialog = false;
  
  // Resume normal status animation if auto mode is enabled
  if (isAutoModeEnabled) {
    startStatusAnimation();
  }
}

function startClaude() {
  // If terminal already exists, stop current monitoring and restart
  if (terminal) {
    vscode.window.showInformationMessage('Stopping existing Claude terminal and starting new one...');
    
    // Stop existing monitoring
    if (fileWatcher) {
      fileWatcher.dispose();
      fileWatcher = null;
    }
    
    // Cleanup existing log file
    if (outputLogPath) {
      try {
        const fs = require('fs');
        if (fs.existsSync(outputLogPath)) {
          fs.unlinkSync(outputLogPath);
        }
      } catch (error) {
        debugLog('Could not clean up existing log file:', error);
      }
    }
    
    // Dispose existing terminal
    terminal.dispose();
    terminal = null;
    
    // Clear state but preserve sleep prevention if auto mode is still enabled
    clearState();
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
    
    // Listen for terminal close events to clear the terminal reference
    const terminalCloseDisposable = vscode.window.onDidCloseTerminal((closedTerminal) => {
      if (closedTerminal === terminal) {
        console.log('Claude terminal was closed, clearing reference');
        cleanupTerminal();
      }
    });
    
    // Add to subscriptions so it gets disposed when extension deactivates
    context.subscriptions.push(terminalCloseDisposable);
    
    // Also check terminal status periodically as backup
    const terminalCheckInterval = setInterval(() => {
      if (terminal) {
        // Check if terminal still exists in the active terminals
        const activeTerminals = vscode.window.terminals;
        const terminalExists = activeTerminals.some(t => t === terminal);
        
        if (!terminalExists) {
          console.log('Claude terminal no longer exists, cleaning up');
          clearInterval(terminalCheckInterval);
          cleanupTerminal();
        }
      } else {
        clearInterval(terminalCheckInterval);
      }
    }, 2000); // Check every 2 seconds
    
    // Start Claude with output logging
    // Use different approach based on OS and ignore local node version managers
    const os = require('os');
    
    // Set PATH to prioritize global node version and ignore local version managers
    const globalNodeSetup = 'export NODENV_VERSION="" NODEENV_VERSION="" NVM_DIR="" NODE_VERSION_PREFIX=""';
    
    if (os.platform() === 'darwin') {
      // macOS: use script command with global node setup
      // Try --continue first, fallback to regular claude if no conversation found
      terminal.sendText(`${globalNodeSetup} && script -q "${outputLogPath}" bash -c "claude --continue || claude"`);
    } else if (os.platform() === 'win32') {
      // Windows: use PowerShell with Tee-Object for logging
      terminal.sendText(`$env:NODENV_VERSION=""; $env:NODE_VERSION_PREFIX=""; (claude --continue; if (!$?) { claude }) | Tee-Object -FilePath "${outputLogPath}"`);
    } else {
      // Linux: use script command with different syntax and global node setup
      terminal.sendText(`${globalNodeSetup} && script -q -c "claude --continue || claude" "${outputLogPath}"`);
    }
    
    // Start file monitoring (this will also handle continuous monitoring)
    startFileMonitoring();
    
    // Update status bar
    updateStatusBar();

    showDashboardNotification();
    
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
        // Throttle file watch events to prevent excessive calls
        const now = Date.now();
        if (now - lastFileWatchTime < FILE_WATCH_THROTTLE_MS) {
          return; // Skip this event, too soon after last watch event
        }
        lastFileWatchTime = now;
        
        // File changed - analyze with throttling
        readAndAnalyzeLogFile();
        
        // Check for timing-based fast response detection
        // Only check if enough time has passed for a real response
        if (lastContinueTime > 0 && Date.now() - lastContinueTime > 100) {
          checkResponseTiming();
        }
        
        // Check for usage limit in log content
        checkUsageLimit();
      }
    });
    
    context.subscriptions.push(fileWatcher);
    
    console.log('File monitoring started successfully');
    
    // Add lightweight backup check in case FileWatcher fails
    const backupCheckInterval = setInterval(() => {
      if (isAutoModeEnabled && outputLogPath) {
        // Only do backup check if FileWatcher hasn't triggered recently
        const now = Date.now();
        if (now - lastFileWatchTime > FILE_WATCH_THROTTLE_MS * 2) {
          readAndAnalyzeLogFile();
        }
      } else if (!isAutoModeEnabled) {
        clearInterval(backupCheckInterval);
      }
    }, 10000); // Backup check every 10 seconds

    // Set up periodic terminal buffer refresh with arrow down key (every 60 seconds)
    const terminalRefreshInterval = setInterval(() => {
      const config = getConfiguration();
      if (isAutoModeEnabled && terminal && config.enableTerminalBufferRefresh) {
        debugLog('Sending arrow down key to refresh terminal buffer');
        terminal.sendText('\u001b[B', false); // Arrow down key
      } else if (!isAutoModeEnabled) {
        clearInterval(terminalRefreshInterval);
      }
    }, 60000); // Every 60 seconds

    // UNIFIED CONTINUOUS MONITORING: Always check for continuous conditions when auto mode is enabled
    if (continuousCheckInterval) {
      clearInterval(continuousCheckInterval);
    }
    
    continuousCheckInterval = setInterval(() => {
      if (isAutoModeEnabled && outputLogPath) {
        // Silent continuous checking
        checkForIdlePromptInLog().catch(() => {
          // Ignore errors silently
        });
        
        // Check for timing-based detection and usage limit
        if (lastContinueTime > 0 && Date.now() - lastContinueTime > 100) {
          checkResponseTiming();
        }
        checkUsageLimit();
      } else if (!isAutoModeEnabled) {
        if (continuousCheckInterval) {
          clearInterval(continuousCheckInterval);
          continuousCheckInterval = null;
        }
      }
    }, 3000); // Check every 3 seconds - reduced frequency for better performance
    
    // Do initial check immediately
    if (isAutoModeEnabled) {
      // Silent: Initial continuous check
      setTimeout(() => {
        checkForIdlePromptInLog().catch(() => {
          // Ignore errors silently
        });
      }, 100);
    }
  } catch (error) {
    console.error('Error starting file monitoring:', error);
  }
}

async function readAndAnalyzeLogFile() {
  if (!outputLogPath) {
    return;
  }
  
  // Throttle file reads to prevent performance issues
  const now = Date.now();
  if (now - lastFileReadTime < FILE_READ_THROTTLE_MS) {
    return; // Skip this read, too soon after last read
  }
  lastFileReadTime = now;
  
  try {
    const fs = require('fs').promises;
    
    // Check if file exists asynchronously
    try {
      await fs.access(outputLogPath);
    } catch {
      return; // File doesn't exist
    }
    
    const content = await fs.readFile(outputLogPath, 'utf8');
    
    if (content.length === 0) {
      return;
    }
    
    // Keep only last 100 lines to manage file size
    const lines = content.split('\n');
    const trimmedLines = lines.slice(-100);
    const trimmedContent = trimmedLines.join('\n');
    
    // Only process if content has changed
    if (trimmedContent !== outputBuffer) {
      outputBuffer = cleanLogText(trimmedContent);
      
      // Update last output change time for continuous mode
      if (isContinuousMode) {
        lastOutputChange = Date.now();
      }
      
      // If original content was more than 100 lines, rotate the log file asynchronously
      if (lines.length > 100) {
        try {
          await fs.writeFile(outputLogPath, cleanLogText(trimmedContent), 'utf8');
        } catch (error) {
          // Silent: log rotation failed
        }
      }
      
      // Trigger pattern check for dialogs (both Auto and Continuous modes)
      // Continuous mode needs this for Wait animation, but won't trigger auto-response
      checkForPrompts(outputBuffer);
    }
    
  } catch (error) {
    // Silent: ignore file read errors to prevent spam
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
    
    // Log the manual response action
    const responseType = response === '1' ? 'Yes (1)' : response === '2' ? 'Yes, and don\'t ask again (2)' : response;
    // Extract the dialog box from output.log for logging
    const dialogContent = extractDialogFromLog();
    logSkippedQuestion(dialogContent, `Manual response: ${responseType}`);
    
    // Send response without newline for manual responses
    targetTerminal.sendText(response, false);
    
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
  // Removed frequent debug logging for performance
  
  // Add to buffer
  outputBuffer += output;
  
  // Keep buffer manageable (last 10000 characters)
  if (outputBuffer.length > 10000) {
    outputBuffer = outputBuffer.slice(-10000);
  }

  // Check for box pattern (╭─)
  const hasBox = /╭─/.test(outputBuffer);
  
  if (hasBox) {
    const lowerOutput = outputBuffer.toLowerCase();
    
    // Check if the box contains "Do you want to" or "Yes, and don't ask again"
    const hasDoYouWant = lowerOutput.includes('do you want to');
    const hasDontAskAgain = lowerOutput.includes("yes, and don't ask again this session");
    
    if (hasDoYouWant || hasDontAskAgain) {
      console.log('✅ Found actionable dialog pattern, starting wait animation...');
      console.log(`📊 Current state - isContinuousMode: ${isContinuousMode}, isWaitingForDialog: ${isWaitingForDialog}`);
      
      // Start wait animation for actionable dialogs (both Auto and Continuous modes)
      startWaitAnimation();
      
      // Only set timeout if there isn't one already pending
      if (!pendingTimeout) {
        const config = getConfiguration();
        const delayMs = config.autoResponseDelaySeconds * 1000;
        console.log(`⏱️ Setting ${config.autoResponseDelaySeconds}-second timeout for response check...`);
        // Set timeout to check for auto-response after configured delay
        pendingTimeout = setTimeout(() => {
          checkForAutoResponse();
        }, delayMs);
      } else {
        console.log('⏭️ Timeout already pending, not setting new one');
      }
    }
  }
  // Removed frequent logging for patterns not found
}

function checkForAutoResponse() {
  console.log('🔍 checkForAutoResponse: Starting auto-response check...');
  console.log(`🔍 Mode state: isContinuousMode=${isContinuousMode}, isAutoModeEnabled=${isAutoModeEnabled}`);
  
  // Stop wait animation first
  stopWaitAnimation();
  
  // Continuous mode also needs to auto-respond to dialogs
  
  if (!isAutoModeEnabled || !terminal) {
    console.log('Auto mode disabled or no terminal');
    clearState();
    return;
  }

  const lowerOutput = outputBuffer.toLowerCase();
  console.log('Analyzing buffer content for patterns...');
  
  // Check for "Yes, and don't ask again this session" FIRST (more specific)
  console.log('Checking for "don\'t ask again" pattern in output');
  const config = getConfiguration();
  if (config.enableDontAskAgain && lowerOutput.includes("yes, and don't ask again this session")) {
    console.log('Found "don\'t ask again" pattern, sending response "2"');
    
    // Check for destructive commands first
    if (hasDestructiveCommand(outputBuffer, config)) {
      if (config.ignoreDestructiveCommandsDetection) {
        vscode.window.showWarningMessage(
          '⚠️ Destructive command detected but ignored by settings! Proceeding with auto-response.'
        );
        // Log the skipped question if enabled
        if (config.logSkippedQuestions) {
          logSkippedQuestion(outputBuffer, 'Destructive command ignored');
        }
      } else {
        vscode.window.showWarningMessage(
          '⚠️ Destructive command detected! Auto-response cancelled. Please review the proposal manually.'
        );
        // Clear only the timeout, not the entire state
        if (pendingTimeout) {
          clearTimeout(pendingTimeout);
          pendingTimeout = null;
        }
        return;
      }
    }
    
    // Clear state before sending response
    clearState();
    
    // Use the working low-level input method
    autoSendResponse('2');
    return;
  }
  
  // Check for "Do you want to" pattern SECOND (less specific)
  if (lowerOutput.includes('do you want to')) {
    console.log('Found "Do you want to" pattern, sending response "1"');
    
    // Check for destructive commands first
    const config = getConfiguration();
    if (hasDestructiveCommand(outputBuffer, config)) {
      if (config.ignoreDestructiveCommandsDetection) {
        vscode.window.showWarningMessage(
          '⚠️ Destructive command detected but ignored by settings! Proceeding with auto-response.'
        );
        // Log the skipped question if enabled
        if (config.logSkippedQuestions) {
          logSkippedQuestion(outputBuffer, 'Destructive command ignored');
        }
      } else {
        vscode.window.showWarningMessage(
          '⚠️ Destructive command detected! Auto-response cancelled. Please review the proposal manually.'
        );
        // Clear only the timeout, not the entire state
        if (pendingTimeout) {
          clearTimeout(pendingTimeout);
          pendingTimeout = null;
        }
        return;
      }
    }
    
    // Clear state before sending response
    clearState();
    
    // Use the working low-level input method
    autoSendResponse('1');
    return;
  }
  
  console.log('No recognized prompt pattern found in buffer');
  
  // Clear state even if no pattern found to prevent stuck animations
  clearState();
}

function autoSendResponse(response: string) {
  if (!terminal) return;
  
  console.log(`Auto-sending response: ${response}`);
  updateActivityTime(); // User activity detected
  
  // Log the auto-response action
  const responseType = response === '1' ? 'Yes (1)' : response === '2' ? 'Yes, and don\'t ask again (2)' : response;
  // Extract the dialog box from output.log for logging
  const dialogContent = extractDialogFromLog();
  logSkippedQuestion(dialogContent, `Auto-response: ${responseType}`);
  
  // Use the working method: Send as individual keystrokes
  response.split('').forEach((char, index) => {
    setTimeout(() => {
      terminal!.sendText(char, false);
    }, index * 50);
  });
  // Enter key removed - not needed
  
  // Update last auto-response timestamp
  lastAutoResponse = Date.now();
  
  vscode.window.showInformationMessage(`Auto-response sent: ${response}`);
}

function logSkippedQuestion(questionText: string, reason: string) {
  const config = getConfiguration();
  if (!config.logSkippedQuestions) {
    return;
  }
  
  try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.tmpdir();
    const logPath = path.join(workspaceFolder, '.claude-skipped-questions.log');
    
    // Clean the text: remove NUL, ESC sequences, and color codes
    const cleanedText = cleanLogText(questionText);
    
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${reason}\n${cleanedText}\n${'='.repeat(80)}\n\n`;
    
    fs.appendFileSync(logPath, logEntry, 'utf8');
    debugLog('Logged skipped question to:', logPath);
  } catch (error) {
    debugLog('Failed to log skipped question:', error);
  }
}

function extractDialogFromLog(): string {
  if (!outputLogPath) {
    return outputBuffer; // Fallback to current buffer
  }
  
  try {
    const fs = require('fs');
    if (!fs.existsSync(outputLogPath)) {
      return outputBuffer;
    }
    
    const content = fs.readFileSync(outputLogPath, 'utf8');
    
    // Find the last occurrence of ╭─ (dialog box start)
    const dialogStart = content.lastIndexOf('╭─');
    if (dialogStart === -1) {
      return outputBuffer; // No dialog found
    }
    
    // Extract from the last ╭─ to the end
    const dialogSection = content.substring(dialogStart);
    
    // Return the dialog content without cleaning (for logging purposes)
    return dialogSection;
  } catch (error) {
    console.error('Failed to extract dialog from log:', error);
    return outputBuffer;
  }
}

function cleanLogText(text: string): string {
  return text
    // Remove NUL characters (0x00)
    .replace(/\x00/g, '')
    // Remove ESC character (0x1B) and ANSI escape sequences
    .replace(/\x1b/g, '')
    .replace(/\[[0-9;]*[mGKHJC]/g, '')
    .replace(/\[[0-9;]*[A-Za-z]/g, '')
    // Remove specific sequences like [2m│
    .replace(/\[[0-9]+m[│┌┐└┘├┤┬┴┼]/g, '')
    // Remove other control characters except newlines and tabs
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function startContinuousCountdownForIdlePrompt() {
  if (!isContinuousMode) return;
  
  const config = getConfiguration();
  
  // Validate timeout is longer than auto-response delay to prevent conflicts
  const minTimeoutMinutes = Math.ceil(config.autoResponseDelaySeconds / 60) + 1;
  let timeoutMinutes = config.continuousTimeoutMinutes;
  
  if (timeoutMinutes * 60 <= config.autoResponseDelaySeconds) {
    timeoutMinutes = minTimeoutMinutes;
    console.warn(`Continuous timeout (${config.continuousTimeoutMinutes} min) is too short. Using minimum ${minTimeoutMinutes} minutes.`);
    vscode.window.showWarningMessage(
      `Continuous timeout adjusted to ${minTimeoutMinutes} minutes to prevent conflicts with auto-response delay.`
    );
  }
  
  const timeoutMs = timeoutMinutes * 60 * 1000;
  
  // Clear any existing timeout first, but preserve countdown state
  if (continuousTimeout) {
    clearTimeout(continuousTimeout);
    continuousTimeout = null;
  }
  
  // Set new countdown
  lastOutputChange = Date.now();
  continuousEndTime = Date.now() + timeoutMs;
  
  continuousTimeout = setTimeout(() => {
    sendContinueCommand();
  }, timeoutMs);
  
  // Start countdown display update
  startContinuousCountdown();
}

function startContinuousMonitoring() {
  // This function now only manages continuous-specific state
  if (!isContinuousMode) return;
  console.log('Continuous monitoring active - unified check already running');
  
  // The actual monitoring loop is now handled by startFileMonitoring()
  // This ensures consistent 1-second checking regardless of how monitoring was started
}

function stopContinuousMonitoring() {
  if (continuousTimeout) {
    clearTimeout(continuousTimeout);
    continuousTimeout = null;
  }
  
  // Note: We don't clear continuousCheckInterval here anymore
  // because it's now managed by startFileMonitoring() and should continue
  // running for auto mode functionality
  
  stopContinuousCountdown();
  
  // Immediately return to normal animation after countdown reset
  updateStatusBar();
}

function startContinuousCountdown() {
  // Clear any existing countdown interval without resetting endTime
  if (continuousCountdownInterval) {
    clearInterval(continuousCountdownInterval);
    continuousCountdownInterval = null;
  }
  
  continuousCountdownInterval = setInterval(() => {
    if (continuousEndTime > 0 && Date.now() < continuousEndTime) {
      // Always update status bar - don't skip during wait mode
      // The wait animation will temporarily override this display
      updateStatusBar();
    } else {
      // Countdown finished
      stopContinuousCountdown();
    }
  }, COUNTDOWN_UPDATE_INTERVAL_MS); // Update every second
}

function stopContinuousCountdown() {
  if (continuousCountdownInterval) {
    clearInterval(continuousCountdownInterval);
    continuousCountdownInterval = null;
  }
  continuousEndTime = 0;
}

function resetContinuousTimer() {
  if (isContinuousMode) {
    lastOutputChange = Date.now();
    console.log('Output changed - stopping continuous countdown');
    stopContinuousMonitoring(); // Stop countdown when output changes
  }
}

// Cache for last dialog content to avoid re-reading if unchanged
let lastDialogCache: { content: string; timestamp: number } | null = null;
const DIALOG_CACHE_TTL = 500; // Cache for 500ms

// Rate limiting for checkForIdlePromptInLog to prevent excessive calls
let lastIdleCheckTime = 0;
const IDLE_CHECK_RATE_LIMIT_MS = 1000; // Minimum 1000ms between checks (reduced frequency)
let idleCheckInProgress = false;

async function checkForIdlePromptInLog() {
  if (!isContinuousMode || !outputLogPath) {
    return;
  }
  
  // Rate limiting: skip if called too frequently or already in progress
  const now = Date.now();
  if (idleCheckInProgress || now - lastIdleCheckTime < IDLE_CHECK_RATE_LIMIT_MS) {
    return;
  }
  
  lastIdleCheckTime = now;
  idleCheckInProgress = true;
  
  try {
    const fs = require('fs').promises;
    
    // Check if file exists asynchronously
    try {
      await fs.access(outputLogPath);
    } catch {
      return; // File doesn't exist
    }
    
    // Read only the last 5KB of the file to find recent dialogs
    const stats = await fs.stat(outputLogPath);
    const readSize = Math.min(stats.size, 5120); // 5KB max
    const startPos = Math.max(0, stats.size - readSize);
    
    const fileHandle = await fs.open(outputLogPath, 'r');
    const buffer = Buffer.alloc(readSize);
    await fileHandle.read(buffer, 0, readSize, startPos);
    await fileHandle.close();
    
    const content = buffer.toString('utf8');
    
    // Find the last occurrence of ╭─ (dialog box start)
    const lastBoxStart = content.lastIndexOf('╭─');
    if (lastBoxStart === -1) {
      return; // No dialog box found
    }
    
    // Extract from the last ╭─ to the end
    const lastDialog = content.substring(lastBoxStart);
    
    // Check cache to avoid reprocessing same dialog
    if (lastDialogCache && 
        lastDialogCache.content === lastDialog && 
        now - lastDialogCache.timestamp < DIALOG_CACHE_TTL) {
      return; // Same dialog, skip processing
    }
    
    // Update cache
    lastDialogCache = { content: lastDialog, timestamp: now };
    
    // Split into lines and check if it matches idle prompt pattern
    const lines = lastDialog.trim().split('\n');
    
    if (lines.length >= 3) {
      const dialogLines = lines.slice(0, 3).join('\n'); // Take first 3 lines of the dialog
      
      if (isIdlePromptPattern(dialogLines)) {
        consecutiveIdleCheckFailures = 0; // Reset failure counter
        lastFailureTime = 0; // Reset failure time
        
        // Do not start countdown if in Limit mode (usage limit detected)
        if (isContinuousPaused && continuousPauseReason === 'limit') {
          // Silent: In Limit mode, waiting for usage limit to be resolved
          return;
        }
        
        // Only start new countdown if one is not already active
        if (continuousEndTime === 0 || Date.now() >= continuousEndTime) {
          console.log('🟢 Starting continuous countdown - idle prompt detected');
          startContinuousCountdownForIdlePrompt();
        } else {
          // Silent: Countdown already active
        }
      } else {
        // Dialog is complete but not idle - count as failure immediately
        consecutiveIdleCheckFailures++;
        
        // Only update activity time for non-continuous pause scenarios
        if (!isContinuousPaused) {
          updateActivityTime(); // User is active
        }
        
        // Do not auto-resume immediately - let the user manually resume or wait for genuine slow response
        lastFailureTime = now;
        
        // Reset countdown only after max consecutive failures
        if (consecutiveIdleCheckFailures >= MAX_CONSECUTIVE_FAILURES) {
          // Silent: Countdown reset due to failures
          stopContinuousMonitoring();
          consecutiveIdleCheckFailures = 0; // Reset counter
          lastFailureTime = 0; // Reset failure time
        }
      }
    } else {
      // Dialog incomplete (less than 3 lines) - don't count towards reset, but don't clear failure count either
      // Silent: Dialog incomplete, skipping reset count
      // Don't modify consecutiveIdleCheckFailures here - preserve the count from previous complete dialogs
    }
  } catch (error) {
    // Silently ignore errors to avoid spam
  } finally {
    idleCheckInProgress = false;
  }
}

function isIdlePromptPattern(text: string): boolean {
  const lines = text.split('\n');
  
  if (lines.length !== 3) {
    return false;
  }
  
  // Check pattern: box with empty > prompt
  const topLine = lines[0].trim();
  const middleLine = lines[1].trim();
  const bottomLine = lines[2].trim();
  
  // Top line should start with ╭ and contain dashes
  if (!topLine.startsWith('╭') || !topLine.includes('─')) {
    return false;
  }
  
  // Middle line should be "│ > │" (empty prompt with only spaces)
  if (!middleLine.match(/^│\s*>\s*│\s*$/)) {
    return false;
  }
  
  // Bottom line should start with ╰ and contain dashes
  if (!bottomLine.startsWith('╰') || !bottomLine.includes('─')) {
    return false;
  }
  return true;
}

function sendContinueCommand() {
  if (!terminal) return;
  
  console.log('Sending Continue command to Claude');
  
  // Send "Continue." with language preservation
  // We'll use the same approach as auto-response but with Continue command
  const continueText = 'Continue.';
  
  // Send as individual characters to ensure proper handling
  continueText.split('').forEach((char, index) => {
    setTimeout(() => {
      terminal!.sendText(char, false);
    }, index * 50);
  });
  
  // Send newline after the command
  setTimeout(() => {
    terminal!.sendText('\n', false);
    
    // Record continue time AFTER sending the command to avoid immediate timing check
    setTimeout(() => {
      lastContinueTime = Date.now();
    }, 500); // Wait 500ms after command is sent
  }, continueText.length * 50 + 100);
  
  // Log the action
  const dialogContent = extractDialogFromLog();
  logSkippedQuestion(dialogContent, 'Continuous mode: Continue command sent');
  
  // Stop current countdown and wait for next idle prompt detection
  stopContinuousMonitoring();
  
  // Continuous monitoring will restart automatically when next idle prompt is detected
}

function checkResponseTiming() {
  if (!isContinuousMode || !lastContinueTime || !outputLogPath) {
    return;
  }
  
  // Return early if already paused to prevent automatic resume
  if (isContinuousPaused) {
    return;
  }
  
  const config = getConfiguration();
  const responseTime = Date.now() - lastContinueTime;
  const fastThreshold = config.fastResponseTimeoutSeconds * 1000;
  
  // Skip timing check if it's too soon after the Continue command (likely still processing)
  if (responseTime < 1000) {
    return; // Wait at least 1 second before checking timing
  }
  
  if (responseTime <= fastThreshold) {
    // Fast response detected
    if (config.enableFastResponsePause) {
      fastResponseCount++;
      console.log(`Fast response detected (${responseTime}ms), count: ${fastResponseCount}`);
      
      if (fastResponseCount >= config.fastResponseLimit) {
        pauseContinuousModeForFast();
      }
    }
  } else {
    // Reset counter on slow response
    fastResponseCount = 0;
    
    // Auto-resume disabled - user must manually resume or wait for next session
  }
  
  // Reset continue time after checking
  lastContinueTime = 0;
}

function pauseContinuousModeForFast() {
  if (isContinuousPaused) return;
  
  console.log('Auto-pausing Continuous mode due to fast responses');
  isContinuousPaused = true;
  continuousPauseReason = 'fast';
  fastResponseCount = 0;
  
  // Stop continuous monitoring
  stopContinuousMonitoring();
  
  // Pause caffeinate
  if (caffeineProcess && !isCaffeinePaused) {
    isCaffeinePaused = true;
    stopSleepPrevention();
  }
  
  // Update status bar
  updateStatusBar();
  
  // Show notification
  vscode.window.showInformationMessage(
    'Continuous mode paused due to fast responses. Use Command Palette > "Resume Continuous Mode" to resume manually.'
  );
}

function autoSwitchToLimitMode() {
  // Switch to temporary continuous mode (Limit mode)
  const wasAutoMode = isAutoModeEnabled && !isContinuousMode;
  
  isAutoModeEnabled = true;
  isContinuousMode = true;
  isContinuousPaused = true;
  continuousPauseReason = 'limit';
  
  // Update state
  context.globalState.update('claudeAutoMode', isAutoModeEnabled);
  context.globalState.update('claudeContinuousMode', isContinuousMode);
  
  // Start sleep prevention and monitoring if not already running
  if (wasAutoMode) {
    startSleepPrevention();
    startIdleMonitoring();
    
    if (outputLogPath) {
      startFileMonitoring();
    }
  }
  
  // Update status bar
  updateStatusBar();
  
  // Show notification
  vscode.window.showInformationMessage(
    'Usage limit detected - temporarily switched to Continuous mode. Will return to Auto mode when limit is resolved.'
  );
}

function returnToAutoMode() {
  // Return from Limit mode to Auto mode
  isAutoModeEnabled = true;
  isContinuousMode = false;
  isContinuousPaused = false;
  continuousPauseReason = null;
  
  // Update state
  context.globalState.update('claudeAutoMode', isAutoModeEnabled);
  context.globalState.update('claudeContinuousMode', isContinuousMode);
  
  // Stop continuous monitoring
  stopContinuousMonitoring();
  
  // Update status bar
  updateStatusBar();
  
  // Show notification
  vscode.window.showInformationMessage(
    'Usage limit resolved - returned to Auto mode.'
  );
}

function checkUsageLimit() {
  if (!outputLogPath) return;
  
  try {
    const fs = require('fs');
    const content = fs.readFileSync(outputLogPath, 'utf8');
    
    if (content.includes('Claude usage limit reached')) {
      const config = getConfiguration();
      
      if (config.enableUsageLimitAutoSwitch && !isContinuousMode) {
        console.log('Usage limit detected - switching Auto mode to temporary Limit mode (Continuous)');
        // Store original mode for later restoration
        context.globalState.update('originalModeBeforeLimit', 'auto');
        autoSwitchToLimitMode();
      } else if (isContinuousMode) {
        // In Continuous mode: Reset fast response count to prevent unwanted pausing
        if (fastResponseCount > 0) {
          console.log('Usage limit detected in Continuous mode - resetting fast response count');
          fastResponseCount = 0;
        }
        // Do nothing else - stay in Continuous mode
      }
    } else {
      // Check if limit has been resolved and we should return to original mode
      const originalMode = context.globalState.get('originalModeBeforeLimit', null);
      if (originalMode && isContinuousMode && continuousPauseReason === 'limit') {
        console.log('Usage limit resolved - returning to Auto mode');
        context.globalState.update('originalModeBeforeLimit', null);
        returnToAutoMode();
      }
    }
  } catch (error) {
    // Ignore file read errors
  }
}

function pauseContinuousMode() {
  // This function is now deprecated - kept for backward compatibility
  // Use pauseContinuousModeForFast() instead
  pauseContinuousModeForFast();
}

function resumeContinuousMode() {
  if (!isContinuousPaused) return;
  
  // Add stack trace to identify unexpected calls
  console.log(`Auto-resuming Continuous mode (was paused for: ${continuousPauseReason})`);
  console.trace('resumeContinuousMode called from:');
  
  isContinuousPaused = false;
  continuousPauseReason = null;
  fastResponseCount = 0;
  
  // Resume caffeinate if auto mode is enabled and it was paused due to idle (not continuous pause)
  if (isAutoModeEnabled && isCaffeinePaused) {
    console.log('Resuming sleep prevention after continuous mode resume');
    isCaffeinePaused = false;
    startSleepPrevention();
  }
  
  // Update status bar
  updateStatusBar();
  
  // Continuous monitoring will restart automatically when idle prompt is detected
}

function hasDestructiveCommand(text: string, config?: { customBlacklist?: string[] }): boolean {
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
  
  // Check built-in patterns
  const hasBuiltInPattern = destructivePatterns.some(pattern => pattern.test(text));
  
  // Check custom blacklist patterns
  if (config?.customBlacklist) {
    const hasCustomPattern = config.customBlacklist.some(patternStr => {
      try {
        const pattern = new RegExp(patternStr, 'i');
        return pattern.test(text);
      } catch (error) {
        debugLog('Invalid regex pattern in custom blacklist:', patternStr, error);
        return false;
      }
    });
    
    if (hasCustomPattern) {
      return true;
    }
  }
  
  return hasBuiltInPattern;
}

function cleanupTerminal() {
  console.log('Cleaning up Claude terminal');
  
  // Show updated dashboard
  showDashboardNotification();
  
  terminal = null;
  
  // Stop file monitoring when terminal is closed
  if (fileWatcher) {
    fileWatcher.dispose();
    fileWatcher = null;
  }
  
  // Update status bar (keep Auto Mode setting unchanged)
  updateStatusBar();
  
  // Clear state
  clearState();
}

function clearState() {
  outputBuffer = '';
  lastProcessedOutput = '';
  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
  // Stop continuous monitoring and countdown
  stopContinuousMonitoring();
  // Clear continuous check interval
  if (continuousCheckInterval) {
    clearInterval(continuousCheckInterval);
    continuousCheckInterval = null;
  }
  // Reset failure counters
  consecutiveIdleCheckFailures = 0;
  lastFailureTime = 0;
  // Clear dialog cache and rate limiting state
  lastDialogCache = null;
  lastIdleCheckTime = 0;
  idleCheckInProgress = false;
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
  stopIdleMonitoring();
  
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