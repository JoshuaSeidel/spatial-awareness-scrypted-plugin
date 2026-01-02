import { MixinDeviceBase, MixinDeviceOptions, Setting, Settings, SettingValue } from ".";
export interface SettingsMixinDeviceOptions<T> extends MixinDeviceOptions<T & Settings> {
    group: string;
    groupKey: string;
}
export declare abstract class SettingsMixinDeviceBase<T> extends MixinDeviceBase<T & Settings> implements Settings {
    settingsGroup: string;
    settingsGroupKey: string;
    constructor(options: SettingsMixinDeviceOptions<T>);
    abstract getMixinSettings(): Promise<Setting[]>;
    abstract putMixinSetting(key: string, value: SettingValue): Promise<boolean | void>;
    getSettings(): Promise<Setting[]>;
    putSetting(key: string, value: SettingValue): Promise<void>;
    release(): Promise<void>;
}
