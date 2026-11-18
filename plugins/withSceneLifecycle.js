/**
 * Start the app through a scene, as iOS 27 requires.
 *
 * An app built with the iOS 27 SDK that does not adopt the scene life cycle does
 * not launch: UIKit ends it before a single line of ours runs, with "UIScene life
 * cycle is required for apps built with this SDK". That is what App Review saw as
 * a crash on launch for 3.0.0 (9) — on an iPad, but it is every device on iOS 27.
 * It went unnoticed because the simulator used day to day was still on iOS 26.
 *
 * Expo's iOS template for SDK 57 still makes its window in the app delegate. The
 * pieces that do it the new way arrived in a patch release (`ExpoAppSceneDelegate`,
 * expo 57.0.33) and the template only picked them up in SDK 58. The native project
 * here is generated — `ios/` is not checked in, and EAS runs prebuild from this
 * config — so the change has to be made to what prebuild generates, which is what
 * this plugin does. It makes the same three edits the SDK 58 template ships with:
 *
 *   1. Info.plist names a scene configuration and its delegate.
 *   2. A SceneDelegate is added to the app target. It is Expo's own: it makes the
 *      window from the scene, starts React Native in it, and hands links and
 *      life-cycle events back to the app delegate so nothing that listened there
 *      stops hearing them.
 *   3. The app delegate stops making a window of its own and says where the
 *      factory is, so the scene delegate can find it.
 *
 * Each edit checks that it found what it meant to change and stops the build if
 * it did not. A template that moved on without this noticing would otherwise
 * produce an app that builds, uploads, and does not open.
 *
 * Remove this file, and its line in app.json, when the project moves to SDK 58.
 */

const { withAppDelegate, withInfoPlist, withXcodeProject, IOSConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SCENE_DELEGATE = `internal import Expo

// Added by plugins/withSceneLifecycle.js. The work is in ExpoAppSceneDelegate.
@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
}
`;

/** What the SDK 57 template does in the app delegate and a scene delegate now
 *  does instead. Matched loosely on whitespace, exactly on what it calls. */
const OWN_WINDOW = /\n#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\(\s*\n\s*withModuleName: "main",\s*\n\s*in: window,\s*\n\s*launchOptions: launchOptions\)\s*\n#endif\n/;

const fail = (what) => {
  throw new Error(
    `withSceneLifecycle: ${what}. The iOS template has changed since this plugin was written; `
    + 'without the scene life cycle the app does not launch on iOS 27, so this stops the build '
    + 'rather than let it through. See plugins/withSceneLifecycle.js.',
  );
};

/** The app delegate as the scene life cycle needs it. Exported for the test. */
function adoptScenes(source) {
  // Already done — a second prebuild over the same files, or a template (SDK 58
  // onwards) that ships this way.
  if (source.includes('ExpoReactNativeFactoryProvider')) return source;

  const declared = 'class AppDelegate: ExpoAppDelegate {';
  if (!source.includes(declared)) fail('could not find the AppDelegate class declaration');
  if (!OWN_WINDOW.test(source)) fail('could not find where the AppDelegate makes its window');

  return source
    .replace(declared, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {')
    .replace(OWN_WINDOW, [
      '',
      '    // No window here: the scene delegate makes it and starts React Native in it',
      '    // (plugins/withSceneLifecycle.js). iOS 27 does not launch an app that does this itself.',
      '',
    ].join('\n'));
}

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      },
    ],
  },
};

function withSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return mod;
  });

  config = withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') fail('the AppDelegate is not Swift');
    mod.modResults.contents = adoptScenes(mod.modResults.contents);
    return mod;
  });

  config = withXcodeProject(config, (mod) => {
    const { platformProjectRoot, projectName } = mod.modRequest;
    const file = path.join(platformProjectRoot, projectName, 'SceneDelegate.swift');
    fs.writeFileSync(file, SCENE_DELEGATE);
    // Written to disk is not enough: a file the target does not compile is a
    // class the Info.plist names and the app cannot find.
    if (!mod.modResults.hasFile(`${projectName}/SceneDelegate.swift`)) {
      mod.modResults = IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: `${projectName}/SceneDelegate.swift`,
        groupName: projectName,
        project: mod.modResults,
      });
    }
    return mod;
  });

  return config;
}

module.exports = withSceneLifecycle;
module.exports.adoptScenes = adoptScenes;
module.exports.SCENE_MANIFEST = SCENE_MANIFEST;
