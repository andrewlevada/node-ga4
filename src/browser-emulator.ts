import { JSDOM, DOMWindow, CookieJar } from "jsdom";
import https from "https";
import { getBrowserSession, getSessionsNumber,
  getStaleQueueUserId, GtagFunction,
  popFromEmulationRequestsQueue,
  pushToEmulationRequestsQueue,
  removeBrowserSession,
  setBrowserSession } from "./emulator-sessions-storage";
import { sendBeacon } from "./send-beacon";
import { config } from "./config";

export interface PageViewEvent {
  userId: string;
  url: string | null;
}

export interface Event {
  userId: string;
  name: string;
  params?: any;
}

export interface UserPropertyUpdated {
  userId: string;
  properties: Record<string, any>;
}

const debugLog = false;

export function emulateSendEvent(event: Event): Promise<void> {
  return emulatePageView({ userId: event.userId, url: `/${event.name}` },
    gtag => new Promise(resolve => {
      setBrowserSession(event.userId, { beaconCallback: resolve });
      if (event.params === undefined) event.params = {};
      event.params.event_timeout = 0;
      gtag("event", event.name, event.params);
    }));
}

export function emulateUserPropertiesUpdate(event: UserPropertyUpdated): Promise<void> {
  return emulatePageView({ userId: event.userId, url: null },
    gtag => new Promise(resolve => {
      setBrowserSession(event.userId, { beaconCallback: undefined });
      event.properties = { ...event.properties, crm_id: event.userId };
      gtag("set", "user_properties", event.properties);
      gtag("get", config().measurementId, "user_properties", resolve);
    }));
}

export function emulatePageView(e: PageViewEvent, callback?: (gtag: GtagFunction)=> Promise<void>): Promise<void> {
  const checkHash = Math.floor(Math.random() * 10000);

  const session = getBrowserSession(e.userId);
  if ((session && session.state !== "idle") || isSessionLimitReached()) {
    if (debugLog) console.log(`emulate view QUEUE ${checkHash}`);
    pushToEmulationRequestsQueue({ callback, event: e });
    return Promise.resolve();
  }
  if (debugLog) console.log(`emulate view start NOW ${checkHash}, ${e.url}`);

  setBrowserSession(e.userId, { state: "updating" });
  return (!session || shouldPageNavigate(e, session.window) ? createNewPage(e) : Promise.resolve()).then(() => {
    if (debugLog) console.log(`emulate view DONE SETUP ${checkHash}`);
    (callback ? callback(getBrowserSession(e.userId)!.gtag!) : Promise.resolve()).then(() => {
      setBrowserSession(e.userId, { state: "idle" });
      if (debugLog) console.log(`emulate view DONE ${checkHash}`);
      if (tryRunQueuedViews(e.userId)) return;
      setBrowserSession(e.userId, { timeout: setTimeout(() => {
        if (getBrowserSession(e.userId)?.state !== "idle") return;
        setBrowserSession(e.userId, { state: "finishing" });
        if (debugLog) console.log(`emulate view TO ${checkHash}`);
        const s = getBrowserSession(e.userId)!;
          s.window!.close();
          config().storeCookie(e.userId, JSON.stringify(s.cookieJar!.toJSON())).then(() => {
            removeBrowserSession(e.userId);
            if (!tryRunQueuedViews(e.userId)) tryRunStaleQueuedViews();
          });
      }, config().sessionIdleTime) });
    });
  });
}

function createNewPage(event: PageViewEvent): Promise<void> {
  const session = getBrowserSession(event.userId);
  const oldCookieJar = session?.cookieJar;
  if (session && session.window) session.window.close();

  return config().retrieveCookie(event.userId).then(cookies => {
    if (!event.url) event.url = "/";
    const title = config().titlesMap ? config().titlesMap![event.url] || "404" : event.url;
    const { window, cookieJar } = new JSDOM(getHtml(title), {
      url: constructEmulatedUrl(event), cookieJar: oldCookieJar || (cookies ? CookieJar.fromJSON(cookies) : undefined),
    });

    return new Promise(resolve => {
      https.get("https://www.googletagmanager.com/gtag/js?id=G-HYFTVXK74M", res => {
        res.on("data", gtagScript => {
          const { document, navigator } = window;
          const self = window;

          // Here are several hacky patches to make analytics work in JSDom
          Object.defineProperty(document, "visibilityState", {
            get() { return "visible"; },
          });

          navigator.sendBeacon = (url, data) => {
            if (debugLog) console.log("Sending out beacon!");
            sendBeacon(url as string, data);
            const callback = getBrowserSession(event.userId)?.beaconCallback;
            if (callback) callback();
            return true;
          };

          try {
            eval(gtagScript);
          } catch (ex) {
            console.error("Exception occurred in analytics while evaling gtag.js");
            console.error(ex);
          }

          window.dataLayer = window.dataLayer || [];
          window.gtag = function gtag() { window.dataLayer.push(arguments); };

          setBrowserSession(event.userId, { window, gtag: window.gtag, cookieJar, beaconCallback: resolve });

          window.gtag("js", new Date());
          window.gtag("config", config().measurementId, { user_id: event.userId, transport_type: "beacon" });
          if (config().crmIdPropertyName) {
            const props: Record<string, string> = {};
            props[config().crmIdPropertyName!] = event.userId;
            window.gtag("set", "user_properties", props);
          }
        })
      }).end();
    });
  });
}

function shouldPageNavigate(event: PageViewEvent, window: DOMWindow | undefined): boolean {
  if (!window) return true;
  return event.url !== null && window.location.pathname !== constructEmulatedUrl(event);
}

function constructEmulatedUrl(event: PageViewEvent): string {
  return `${config().baseUrl}${event.url}`;
}

function isSessionLimitReached(): boolean {
  return getSessionsNumber() >= 10;
}

function tryRunStaleQueuedViews(): void {
  if (isSessionLimitReached()) return;
  const userId = getStaleQueueUserId();
  if (!userId) return;
  tryRunQueuedViews(userId);
}

function tryRunQueuedViews(userId: string): boolean {
  if (isSessionLimitReached()) return false;
  const request = popFromEmulationRequestsQueue(userId);
  if (!request) return false;
  emulatePageView(request.event, request.callback).then();
  return true;
}

function getHtml(title: string) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
</head>
<body><p>OK</p></body>
</html>
`;
}
