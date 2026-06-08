# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: research-studio-flow.spec.ts >> Deep Research → Studio E2E >> Research completes then Studio shows document
- Location: tests/research-studio-flow.spec.ts:9:7

# Error details

```
Error: browserType.launch: Target page, context or browser has been closed
Browser logs:

<launching> /Users/ngophucuong/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-edgeupdater --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --no-sandbox --user-data-dir=/var/folders/db/1ptxcz1s01bg034ncxrtjp_w0000gn/T/playwright_chromiumdev_profile-MctksK --remote-debugging-pipe --no-startup-window
<launched> pid=99764
[pid=99764][err] [0609/002644.041503:ERROR:third_party/crashpad/crashpad/util/mach/bootstrap.cc:65] bootstrap_check_in org.chromium.crashpad.child_port_handshake.99768.11110162.YXKDNPABPYLKSYRQ: Permission denied (1100)
[pid=99764][err] [0609/002644.137662:ERROR:third_party/crashpad/crashpad/util/file/file_io.cc:103] ReadExactly: expected 4, observed 0
[pid=99764][err] [0609/002644.138321:ERROR:third_party/crashpad/crashpad/util/mach/bootstrap.cc:65] bootstrap_check_in org.chromium.crashpad.child_port_handshake.99766.11110160.BGRTJUNRVUCBVSGT: Permission denied (1100)
[pid=99764][err] [0609/002644.282877:ERROR:third_party/crashpad/crashpad/util/file/file_io.cc:103] ReadExactly: expected 4, observed 0
[pid=99764][err] [0609/002644.283286:ERROR:third_party/crashpad/crashpad/util/file/file_io_posix.cc:208] open /Users/ngophucuong/Library/Application Support/Google/Chrome for Testing/Crashpad/settings.dat: Operation not permitted (1)
[pid=99764][err] [0609/002644.283394:ERROR:third_party/crashpad/crashpad/util/file/file_io_posix.cc:208] open /Users/ngophucuong/Library/Application Support/Google/Chrome for Testing/Crashpad/settings.dat: Operation not permitted (1)
[pid=99764][err] Received signal 6
[pid=99764][err]  [0x000117e87c1c]
[pid=99764][err]  [0x000117e8bd54]
[pid=99764][err]  [0x00019c0b96a4]
[pid=99764][err]  [0x00019c07f88c]
[pid=99764][err]  [0x00019bf88a3c]
[pid=99764][err]  [0x0001a2ecd9e4]
[pid=99764][err]  [0x0001a2eca6e8]
[pid=99764][err]  [0x0001a0e42304]
[pid=99764][err]  [0x0001a0e42f80]
[pid=99764][err]  [0x0001a0e41fe0]
[pid=99764][err]  [0x0001a0e454ac]
[pid=99764][err]  [0x0001a005ae80]
[pid=99764][err]  [0x0001a0058d10]
[pid=99764][err]  [0x0001a0058844]
[pid=99764][err]  [0x0001132a47ac]
[pid=99764][err]  [0x000113cafd44]
[pid=99764][err]  [0x000113cafb38]
[pid=99764][err]  [0x000112ebc760]
[pid=99764][err]  [0x0001124ff670]
[pid=99764][err]  [0x000110b7581c]
[pid=99764][err]  [0x000102fac85c]
[pid=99764][err]  [0x00019bcdeb98]
[pid=99764][err] [end of stack trace]
[pid=99764] <process did exit: exitCode=null, signal=SIGABRT>
[pid=99764] starting temporary directories cleanup
Call log:
  - <launching> /Users/ngophucuong/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-edgeupdater --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --no-sandbox --user-data-dir=/var/folders/db/1ptxcz1s01bg034ncxrtjp_w0000gn/T/playwright_chromiumdev_profile-MctksK --remote-debugging-pipe --no-startup-window
  - <launched> pid=99764
  - [pid=99764][err] [0609/002644.041503:ERROR:third_party/crashpad/crashpad/util/mach/bootstrap.cc:65] bootstrap_check_in org.chromium.crashpad.child_port_handshake.99768.11110162.YXKDNPABPYLKSYRQ: Permission denied (1100)
  - [pid=99764][err] [0609/002644.137662:ERROR:third_party/crashpad/crashpad/util/file/file_io.cc:103] ReadExactly: expected 4, observed 0
  - [pid=99764][err] [0609/002644.138321:ERROR:third_party/crashpad/crashpad/util/mach/bootstrap.cc:65] bootstrap_check_in org.chromium.crashpad.child_port_handshake.99766.11110160.BGRTJUNRVUCBVSGT: Permission denied (1100)
  - [pid=99764][err] [0609/002644.282877:ERROR:third_party/crashpad/crashpad/util/file/file_io.cc:103] ReadExactly: expected 4, observed 0
  - [pid=99764][err] [0609/002644.283286:ERROR:third_party/crashpad/crashpad/util/file/file_io_posix.cc:208] open /Users/ngophucuong/Library/Application Support/Google/Chrome for Testing/Crashpad/settings.dat: Operation not permitted (1)
  - [pid=99764][err] [0609/002644.283394:ERROR:third_party/crashpad/crashpad/util/file/file_io_posix.cc:208] open /Users/ngophucuong/Library/Application Support/Google/Chrome for Testing/Crashpad/settings.dat: Operation not permitted (1)
  - [pid=99764][err] Received signal 6
  - [pid=99764][err]  [0x000117e87c1c]
  - [pid=99764][err]  [0x000117e8bd54]
  - [pid=99764][err]  [0x00019c0b96a4]
  - [pid=99764][err]  [0x00019c07f88c]
  - [pid=99764][err]  [0x00019bf88a3c]
  - [pid=99764][err]  [0x0001a2ecd9e4]
  - [pid=99764][err]  [0x0001a2eca6e8]
  - [pid=99764][err]  [0x0001a0e42304]
  - [pid=99764][err]  [0x0001a0e42f80]
  - [pid=99764][err]  [0x0001a0e41fe0]
  - [pid=99764][err]  [0x0001a0e454ac]
  - [pid=99764][err]  [0x0001a005ae80]
  - [pid=99764][err]  [0x0001a0058d10]
  - [pid=99764][err]  [0x0001a0058844]
  - [pid=99764][err]  [0x0001132a47ac]
  - [pid=99764][err]  [0x000113cafd44]
  - [pid=99764][err]  [0x000113cafb38]
  - [pid=99764][err]  [0x000112ebc760]
  - [pid=99764][err]  [0x0001124ff670]
  - [pid=99764][err]  [0x000110b7581c]
  - [pid=99764][err]  [0x000102fac85c]
  - [pid=99764][err]  [0x00019bcdeb98]
  - [pid=99764][err] [end of stack trace]
  - [pid=99764] <process did exit: exitCode=null, signal=SIGABRT>
  - [pid=99764] starting temporary directories cleanup
  - [pid=99764] <gracefully close start>
  - [pid=99764] <kill>
  - [pid=99764] <skipped force kill spawnedProcess.killed=false processClosed=true>
  - [pid=99764] finished temporary directories cleanup
  - [pid=99764] <gracefully close end>

```