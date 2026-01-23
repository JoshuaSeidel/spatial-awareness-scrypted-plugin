import { AlertDetails, AlertType } from '../models/alert';
import { GlobalTrackingId } from '../models/tracked-object';

export function hasMeaningfulAlertChange(prev: AlertDetails, next: AlertDetails): boolean {
  return (
    prev.fromCameraId !== next.fromCameraId ||
    prev.toCameraId !== next.toCameraId ||
    prev.cameraId !== next.cameraId ||
    prev.objectLabel !== next.objectLabel ||
    prev.pathDescription !== next.pathDescription ||
    JSON.stringify(prev.involvedLandmarks || []) !== JSON.stringify(next.involvedLandmarks || [])
  );
}

export function getActiveAlertKey(
  type: AlertType,
  ruleId: string,
  trackedId: GlobalTrackingId
): string {
  return `${type}:${ruleId}:${trackedId}`;
}

export function shouldSendUpdateNotification(
  enabled: boolean,
  lastNotified: number,
  now: number,
  cooldownMs: number
): boolean {
  if (!enabled) return false;
  if (cooldownMs <= 0) return true;
  return now - lastNotified >= cooldownMs;
}
