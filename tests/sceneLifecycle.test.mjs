import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const plugin = require('../plugins/withSceneLifecycle.js');

/** The app delegate exactly as the installed Expo's template generates it. If Expo
 *  changes the template, this is where it shows — before a build, not after one. */
function templateAppDelegate() {
  const into = mkdtempSync(path.join(tmpdir(), 'expo-template-'));
  execFileSync('tar', ['-xzf', require.resolve('expo/template.tgz'), '-C', into]);
  return readFileSync(path.join(into, 'package/ios/HelloWorld/AppDelegate.swift'), 'utf8');
}

test('the template app delegate is turned into one a scene can start', () => {
  const before = templateAppDelegate();
  const after = plugin.adoptScenes(before);

  assert.match(after, /class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider \{/);
  // The two things iOS 27 will not launch an app for doing in its app delegate.
  assert.doesNotMatch(after, /UIWindow\(frame:/);
  assert.doesNotMatch(after, /startReactNative/);
  // What the scene delegate reads is still there.
  assert.match(after, /var window: UIWindow\?/);
  assert.match(after, /var reactNativeFactory: RCTReactNativeFactory\?/);
  assert.match(after, /reactNativeFactory = factory/);
  assert.match(after, /return super\.application\(application, didFinishLaunchingWithOptions: launchOptions\)/);
  // Balanced: nothing was cut out of the middle of a block.
  assert.equal((after.match(/\{/g) ?? []).length, (after.match(/\}/g) ?? []).length);
  assert.equal((after.match(/#if /g) ?? []).length, (after.match(/#endif/g) ?? []).length);
});

test('doing it twice changes nothing more', () => {
  const once = plugin.adoptScenes(templateAppDelegate());
  assert.equal(plugin.adoptScenes(once), once);
});

test('a template it does not recognise stops the build instead of passing through', () => {
  assert.throws(() => plugin.adoptScenes('class AppDelegate: UIResponder {}'), /does not launch on iOS 27/);
  const moved = templateAppDelegate().replace('window = UIWindow(frame: UIScreen.main.bounds)', 'window = makeWindow()');
  assert.throws(() => plugin.adoptScenes(moved), /makes its window/);
});

test('the scene configuration names the delegate the plugin adds', () => {
  const [scene] = plugin.SCENE_MANIFEST.UISceneConfigurations.UIWindowSceneSessionRoleApplication;
  assert.equal(scene.UISceneDelegateClassName, '$(PRODUCT_MODULE_NAME).SceneDelegate');
  assert.equal(plugin.SCENE_MANIFEST.UIApplicationSupportsMultipleScenes, false);
});

test('the app is configured to use it', () => {
  const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  assert.ok(app.expo.plugins.includes('./plugins/withSceneLifecycle'));
});
