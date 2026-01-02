export * from '../types/gen/index';
import type { DeviceState, EventListenerRegister, Logger, MediaObject, ScryptedInterface, ScryptedNativeId, ScryptedStatic, WritableDeviceState } from '../types/gen/index';
import { DeviceBase } from '../types/gen/index';
/**
 * @category Core Reference
 */
export declare class ScryptedDeviceBase extends DeviceBase {
    readonly nativeId?: string | undefined;
    private _storage;
    private _log;
    private _console;
    private _deviceState;
    constructor(nativeId?: string | undefined);
    get storage(): Storage;
    get log(): Logger;
    get console(): Console;
    createMediaObject(data: any, mimeType: string): Promise<MediaObject & {
        sourceId: string;
    }>;
    getMediaObjectConsole(mediaObject: MediaObject): Console | undefined;
    _lazyLoadDeviceState(): void;
    /**
     * Fire an event for this device.
     */
    onDeviceEvent(eventInterface: string, eventData: any): Promise<void>;
}
/**
 * @category Mixin Reference
 */
export interface MixinDeviceOptions<T> {
    mixinDevice: T;
    mixinProviderNativeId: ScryptedNativeId;
    mixinDeviceInterfaces: ScryptedInterface[];
    mixinStorageSuffix?: string;
    mixinDeviceState: WritableDeviceState;
}
/**
 * @category Mixin Reference
 */
export declare class MixinDeviceBase<T> extends DeviceBase implements DeviceState {
    mixinProviderNativeId: ScryptedNativeId;
    mixinDevice: T;
    mixinDeviceInterfaces: ScryptedInterface[];
    private _storage;
    private mixinStorageSuffix;
    private _log;
    private _console;
    private _deviceState;
    private _listeners;
    constructor(options: MixinDeviceOptions<T>);
    get storage(): Storage;
    get console(): Console;
    createMediaObject(data: any, mimeType: string): Promise<MediaObject & {
        sourceId: string;
    }>;
    getMediaObjectConsole(mediaObject: MediaObject): Console;
    /**
     * Fire an event for this device.
     */
    onDeviceEvent(eventInterface: string, eventData: any): Promise<void>;
    _lazyLoadDeviceState(): void;
    manageListener(listener: EventListenerRegister): void;
    release(): void;
}
export declare const sdk: ScryptedStatic;
export default sdk;
