/**
 * The one switch for connecting MemQ to another app.
 *
 * It was read straight from process.env in three places, which is how a feature
 * ends up half shown: the entry in Settings behind one check, the screen behind
 * another, and the guidance behind nothing at all. A build either connects or it
 * does not, so there is one answer here and everything asks it.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Whether this build connects to anything. Anything but exactly "true" is off. */
export const mcpEnabled = process.env.EXPO_PUBLIC_MCP_ENABLED === 'true';

/** A value counts as configured only if it looks like a URL. An unset name does
 *  arrive here as undefined — checked, not assumed — but an empty or half-written
 *  one would otherwise reach `new URL()` and throw, which a screen then reports as
 *  a failure to retry rather than as nothing being set up. */
function configuredUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/$/, '');
  return trimmed && /^https?:\/\/[^\s]+$/i.test(trimmed) ? trimmed : undefined;
}

/** Where the app manages the connections that already exist. */
export const mcpBrokerUrl = configuredUrl(process.env.EXPO_PUBLIC_MCP_BROKER_URL);

/** The address a person enters in the other app. Only a build that was given one
 *  can show one, so the guidance never names a server this app cannot point at. */
export const mcpServerUrl = configuredUrl(process.env.EXPO_PUBLIC_MCP_SERVER_URL);

/** Whether the guidance has been waved away.
 *
 * It introduces itself once, the first time someone makes a lesson, and after that
 * only if they want it — so the answer has to outlive the session. It is a
 * preference about this device, not account data, so it lives here rather than in
 * the database, and a failure to read it just means the guidance shows again.
 */
const SEEN_KEY = 'memq.mcpGuidance.dismissed.v1';

export async function mcpGuidanceDismissed(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(SEEN_KEY)) === '1'; } catch { return false; }
}

export async function setMcpGuidanceDismissed(dismissed: boolean): Promise<void> {
  try {
    if (dismissed) await AsyncStorage.setItem(SEEN_KEY, '1');
    else await AsyncStorage.removeItem(SEEN_KEY);
  } catch { /* a preference, not data */ }
}
