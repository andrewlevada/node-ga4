import { config } from "./config";
import { emulatePageView, emulateSendEvent, emulateUserPropertiesUpdate } from "./browser-emulator";

export function logPageView(userId: string, path: string): Promise<void> {
  if (config().ignoreIds.includes(userId)) return Promise.resolve();
  return emulatePageView({ userId, url: path }).then();
}

export function logEvent(userId: string, name: string, params?: Record<string, any>): void {
  if (config().ignoreIds.includes(userId)) return;
  emulateSendEvent({ userId, name, params }).then();
}

export function logUserProperty(userId: string, property: string, value: string | number | boolean, logChangeEvent?: boolean): void {
  if (config().ignoreIds.includes(userId)) return;
  const o: Record<string, any> = {};
  o[property] = value;
  (logChangeEvent ? emulateSendEvent({
    userId,
    name: `${property}_change`,
    params: o,
  }) : Promise.resolve())
      .then(() => emulateUserPropertiesUpdate({ userId, properties: o }));
}
