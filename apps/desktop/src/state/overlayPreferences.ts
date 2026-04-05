import { create } from "zustand";
import type { OverlayPreferencesDto } from "@lyribolsa/contracts";

const defaultPreferences: OverlayPreferencesDto = {
  opacity: 0.75,
  fontSize: 28,
  alwaysOnTop: true
};

interface OverlayPreferencesState {
  preferences: OverlayPreferencesDto;
  setPreferences: (preferences: OverlayPreferencesDto) => void;
}

export const useOverlayPreferencesStore = create<OverlayPreferencesState>((set) => ({
  preferences: defaultPreferences,
  setPreferences: (preferences) => set({ preferences })
}));
