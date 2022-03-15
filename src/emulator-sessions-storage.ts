import { CookieJar, DOMWindow } from "jsdom";
import { PageViewEvent } from "./browser-emulator";

export type GtagFunction = (action: string, value: string, params?: any, callback?: ()=> void)=> void;

interface EmulatedSession {
  state: "idle" | "updating" | "finishing";
  window?: DOMWindow;
  gtag?: GtagFunction;
  beaconCallback?: ()=> void;
  cookieJar?: CookieJar;
  timeout: ReturnType<typeof setTimeout> | null;
}

interface QueuedEmulationRequest {
  event: PageViewEvent;
  callback?: (gtag: GtagFunction)=> Promise<void>;
}

const sessions: Record<string, EmulatedSession> = {};
const queues: Record<string, QueuedEmulationRequest[]> = {};

export function getBrowserSession(userId: string): EmulatedSession | undefined {
  return sessions[userId];
}

export function setBrowserSession(userId: string, value: Partial<EmulatedSession>): void {
  if (value.timeout !== undefined && sessions[userId].timeout) clearTimeout(sessions[userId].timeout!);
  if (!sessions[userId]) sessions[userId] = { state: "updating", timeout: null };
  sessions[userId] = { ...sessions[userId], ...value };
}

export function removeBrowserSession(userId: string) {
  delete sessions[userId];
}

export function popFromEmulationRequestsQueue(userId: string): QueuedEmulationRequest | undefined {
  if (queues[userId] === undefined) return undefined;
  const popped = queues[userId].shift();
  if (queues[userId].length === 0) delete queues[userId];
  return popped;
}

export function pushToEmulationRequestsQueue(request: QueuedEmulationRequest): void {
  const { userId } = request.event;
  if (!queues[userId]) queues[userId] = [];
  queues[userId].push(request);
}

export function getStaleQueueUserId(): string | undefined {
  const userIds = Object.keys(queues);
  for (const userId of userIds) if (sessions[userId] === undefined) return userId;
  return undefined;
}

export function getSessionsNumber(): number {
  return Object.keys(sessions).length;
}
