import { DEFAULT_THEME, type Theme } from "@razzia/common/types/theme"
import { create } from "zustand"

interface ThemeState {
  theme: Theme
  setTheme: (_theme: Theme) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: DEFAULT_THEME,
  setTheme: (theme) => set({ theme }),
}))
