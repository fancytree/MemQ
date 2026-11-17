import { requireNativeModule } from 'expo-modules-core';

type OutputVolumeModule = {
  /** How loud the phone is set, 0 to 1. */
  get(): Promise<number>;
};

export default requireNativeModule<OutputVolumeModule>('OutputVolume');
