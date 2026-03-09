const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const net = require("node:net");

const SERVER_HOST = "127.0.0.1";
const DEFAULT_SERVER_PORT = 3847;
const SERVER_READY_TIMEOUT_MS = app.isPackaged ? 30_000 : 120_000;

let mainWindow = null;
let serverProcess = null;
let serverOrigin = "";
let isQuitting = false;

function getAppRoot() {
  return app.getAppPath();
}

function getDataRoot() {
  return app.isPackaged ? app.getPath("userData") : getAppRoot();
}

function getServerWorkingDir() {
  return app.isPackaged ? process.resourcesPath : getAppRoot();
}

function getPlaywrightBrowsersPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, ".playwright-browsers")
    : path.join(getAppRoot(), ".playwright-browsers");
}

function getBundledNodePath() {
  return path.join(
    process.resourcesPath,
    "node-runtime",
    process.platform === "win32" ? "node.exe" : "node"
  );
}

function getPackagedNodeFallback() {
  return {
    command: process.execPath,
    commandArgs: [],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
    },
  };
}

function canUseLocalPlaywrightBrowsers() {
  return fs.existsSync(getPlaywrightBrowsersPath());
}

function getNextBin() {
  return require.resolve("next/dist/bin/next");
}

function getNodeCommand() {
  if (!app.isPackaged) {
    return {
      command:
        process.env.TRAWL_NODE_BINARY ||
        process.env.npm_node_execpath ||
        "node",
      commandArgs: [],
      env: {},
    };
  }

  const bundledNode = getBundledNodePath();
  if (fs.existsSync(bundledNode)) {
    return {
      command: bundledNode,
      commandArgs: [],
      env: {},
    };
  }

  return getPackagedNodeFallback();
}

function stopServer() {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  serverProcess.kill("SIGTERM");

  setTimeout(() => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill("SIGKILL");
    }
  }, 5_000).unref();
}

function findAvailablePort(preferredPort) {
  return new Promise((resolvePort, rejectPort) => {
    const attempt = (port) => {
      const tester = net.createServer();

      tester.once("error", (error) => {
        if (error && error.code === "EADDRINUSE") {
          attempt(port + 1);
          return;
        }

        rejectPort(error);
      });

      tester.once("listening", () => {
        tester.close(() => resolvePort(port));
      });

      tester.listen(port, SERVER_HOST);
    };

    attempt(preferredPort);
  });
}

function waitForServer(origin) {
  const startedAt = Date.now();

  return new Promise((resolveReady, rejectReady) => {
    const poll = () => {
      if (!serverProcess) {
        rejectReady(new Error("Next.js server process was not started."));
        return;
      }

      if (serverProcess.exitCode !== null) {
        rejectReady(
          new Error(`Next.js server exited early with code ${serverProcess.exitCode}.`)
        );
        return;
      }

      const request = http.get(origin, (response) => {
        response.resume();
        resolveReady();
      });

      request.on("error", () => {
        if (Date.now() - startedAt >= SERVER_READY_TIMEOUT_MS) {
          rejectReady(new Error(`Timed out waiting for ${origin} to accept connections.`));
          return;
        }

        setTimeout(poll, 400);
      });

      request.setTimeout(2_000, () => {
        request.destroy();

        if (Date.now() - startedAt >= SERVER_READY_TIMEOUT_MS) {
          rejectReady(new Error(`Timed out waiting for ${origin} to accept connections.`));
          return;
        }

        setTimeout(poll, 400);
      });
    };

    poll();
  });
}

function pipeServerLogs() {
  if (!serverProcess) {
    return;
  }

  serverProcess.stdout?.on("data", (chunk) => {
    process.stdout.write(`[next] ${chunk}`);
  });

  serverProcess.stderr?.on("data", (chunk) => {
    process.stderr.write(`[next] ${chunk}`);
  });
}

function formatStartupError(error, command) {
  const details = [
    `Command: ${command.command}`,
    error.code ? `Code: ${error.code}` : null,
    error.message ? `Message: ${error.message}` : null,
  ].filter(Boolean);

  return `Failed to launch the local Next.js server.\n\n${details.join("\n")}`;
}

async function startServer() {
  const port = await findAvailablePort(
    Number.parseInt(process.env.TRAWL_DESKTOP_PORT || "", 10) || DEFAULT_SERVER_PORT
  );
  serverOrigin = `http://${SERVER_HOST}:${port}`;

  const nextArgs = [getNextBin(), app.isPackaged ? "start" : "dev", "-p", String(port), "-H", SERVER_HOST];
  const baseEnv = {
    ...process.env,
    HOSTNAME: SERVER_HOST,
    NODE_ENV: app.isPackaged ? "production" : "development",
    PORT: String(port),
    TRAWL_APP_DIR: getAppRoot(),
    TRAWL_DATA_DIR: getDataRoot(),
    TRAWL_ELECTRON: "1",
  };

  if (canUseLocalPlaywrightBrowsers()) {
    baseEnv.PLAYWRIGHT_BROWSERS_PATH = getPlaywrightBrowsersPath();
  }

  const primaryCommand = getNodeCommand();
  let retriedWithFallback = false;

  const launchServer = (nodeCommand) => {
    const child = spawn(nodeCommand.command, [...nodeCommand.commandArgs, ...nextArgs], {
      cwd: getServerWorkingDir(),
      env: {
        ...baseEnv,
        ...nodeCommand.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess = child;
    pipeServerLogs();

    child.once("error", (error) => {
      if (isQuitting || serverProcess !== child) {
        return;
      }

      if (
        app.isPackaged &&
        !retriedWithFallback &&
        nodeCommand.command !== process.execPath &&
        error.code === "ENOENT"
      ) {
        retriedWithFallback = true;
        launchServer(getPackagedNodeFallback());
        return;
      }

      void dialog.showErrorBox("Unable to start Trawl", formatStartupError(error, nodeCommand));
      app.quit();
    });

    child.once("exit", (code, signal) => {
      if (isQuitting || serverProcess !== child) {
        return;
      }

      const reason =
        signal != null
          ? `signal ${signal}`
          : code != null
            ? `exit code ${code}`
            : "an unknown reason";

      void dialog.showErrorBox(
        "Trawl stopped",
        `The local Next.js server stopped unexpectedly (${reason}).`
      );
      app.quit();
    });
  };

  launchServer(primaryCommand);

  await waitForServer(serverOrigin);
}

function handleExternalNavigation(window) {
  const isInternalUrl = (targetUrl) => {
    try {
      return new URL(targetUrl).origin === serverOrigin;
    } catch {
      return false;
    }
  };

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) {
      return { action: "allow" };
    }

    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isInternalUrl(url)) {
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#0a0a0a",
    title: "Trawl",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  handleExternalNavigation(mainWindow);
  await mainWindow.loadURL(serverOrigin);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  stopServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (!mainWindow) {
    await createWindow();
  }
});

app
  .whenReady()
  .then(async () => {
    await startServer();
    await createWindow();
  })
  .catch((error) => {
    dialog.showErrorBox(
      "Unable to start Trawl",
      error instanceof Error ? error.message : String(error)
    );
    app.quit();
  });
