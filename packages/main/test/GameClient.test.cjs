const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the real launch code without starting Electron or a platform JVM.
const compiledModules = new Map(
  ["GameClient", "GameUpdater"].map((name) => [
    name,
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "../src/modules", `${name}.ts`), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      },
    ).outputText,
  ]),
);

function createClient(platform, arch, root) {
  const launches = [];
  const modules = new Map();
  const logger = { info() {}, debug() {}, warn() {}, error() {} };

  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const module = { exports: {} };
    modules.set(name, module.exports);
    const requireMock = (specifier) => {
      switch (specifier) {
        case "electron":
          return { app: { getPath: () => root } };
        case "electron-log":
          return logger;
        case "./GameUpdater.js":
          return load("GameUpdater");
        case "child_process":
          return {
            spawn(executable, args, options) {
              launches.push({ executable, args: Array.from(args), options });
              const child = new EventEmitter();
              queueMicrotask(() => child.emit("spawn"));
              return child;
            },
          };
        case "p-queue":
          // Downloads are outside the launch path under test.
          return class {};
        default:
          return require(specifier);
      }
    };

    vm.runInNewContext(compiledModules.get(name), {
      module,
      exports: module.exports,
      require: requireMock,
      process: { platform, arch, env: { PATH: "/review/bin" } },
    });
    return module.exports;
  }

  const client = new (load("GameClient").GameClient)();
  client.setGameUpdater({
    getGameStatus: async () => ({ isInstalled: true, needsUpdate: false }),
  });
  client.onSettingsUpdate({
    gameRamAllocation: 2,
    devModeEnabled: false,
    devGameArgs: 'CONFIGURATION_FILE="config with spaces.properties"',
  });
  return { client, launches };
}

const targets = [
  { platform: "darwin", arch: "x64", entry: "macos_x64", separator: ":", java: "jre/Contents/Home/bin/java" },
  { platform: "darwin", arch: "arm64", entry: "macos_arm64", separator: ":", java: "jre/Contents/Home/bin/java" },
  { platform: "linux", arch: "x64", entry: "linux_x64", separator: ":", java: "jre/bin/java" },
  { platform: "win32", arch: "x64", entry: "windows_x64", separator: ";", java: "jre/bin/java.exe" },
];

for (const target of targets) {
  const launchModes = target.platform === "darwin" ? ["game", "replay"] : ["game"];
  for (const mode of launchModes) {
    test(`${target.entry}: launch ${mode} with the bundled runtime`, async (t) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "launcher native runtime "));
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const gameRoot = path.join(root, "ArenaReturnsClient");
      const java = path.join(gameRoot, target.java);
      const keytool = path.join(path.dirname(java), "keytool");
      const replay = path.join(gameRoot, "game/replays/replay with spaces.rda");
      const includeLib = target.arch === "x64";
      const files = [
        java,
        keytool,
        replay,
        path.join(gameRoot, "game/core.jar"),
        path.join(gameRoot, "natives/shared.jar"),
        path.join(gameRoot, "natives", target.entry, "native.jar"),
        ...(includeLib ? [path.join(gameRoot, "lib/library.jar")] : []),
      ];
      for (const file of files) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, "fixture", { mode: 0o644 });
      }

      const { client, launches } = createClient(target.platform, target.arch, root);
      if (mode === "replay") await client.launchReplayOffline(replay);
      else await client.launchGame();

      assert.equal(launches.length, 1);
      const { executable, args, options } = launches[0];
      assert.equal(executable, java, "spawn the bundled Java executable directly");
      assert.equal(options.cwd, path.join(gameRoot, "game"));
      assert.equal(options.env.PATH, "/review/bin");

      const cpIndex = args.indexOf("-cp");
      assert.ok(cpIndex >= 0);
      const expectedClasspath = [
        ...(includeLib ? [path.join(gameRoot, "lib/library.jar")] : []),
        path.join(gameRoot, "natives/*"),
        path.join(gameRoot, "natives", target.entry, "*"),
        path.join(gameRoot, "game/core.jar"),
      ].join(target.separator);
      assert.equal(args[cpIndex + 1], expectedClasspath);
      assert.equal(
        args[cpIndex + 2],
        mode === "replay"
          ? "com.ankamagames.dofusarena.client.DofusArenaReplayPlayer"
          : "com.ankamagames.dofusarena.client.DofusArenaClient",
      );
      assert.ok(args.includes("-CONFIGURATION_FILE=config with spaces.properties"));
      if (mode === "replay") assert.ok(args.includes(`-REPLAY_FILE_PATH=${replay}`));

      const firstThreadIndex = args.indexOf("-XstartOnFirstThread");
      if (target.platform === "darwin") {
        assert.ok(firstThreadIndex >= 0 && firstThreadIndex < cpIndex);
        if (process.platform !== "win32") {
          assert.equal(fs.statSync(java).mode & 0o777, 0o755);
          assert.equal(fs.statSync(keytool).mode & 0o777, 0o755);
        }
      } else {
        assert.equal(firstThreadIndex, -1, "keep macOS JVM options platform-specific");
      }
    });
  }
}
