import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, ThemeName, Theme } from './themes';

interface ThemeContextType {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (themeName: ThemeName) => void;
  animationsEnabled: boolean;
  setAnimationsEnabled: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeName, setThemeNameState] = useState<ThemeName>('terminal');
  const [animationsEnabled, setAnimationsEnabledState] = useState(true);
  const [theme, setThemeState] = useState<Theme>(getTheme('terminal'));

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('app_theme');
      const savedAnimations = await AsyncStorage.getItem('theme_animations');
      
      if (savedTheme && (savedTheme === 'terminal' || savedTheme === 'windows95' || savedTheme === 'windowsXP' || savedTheme === 'macOS9')) {
        setThemeNameState(savedTheme as ThemeName);
        setThemeState(getTheme(savedTheme as ThemeName));
      }
      
      if (savedAnimations !== null) {
        setAnimationsEnabledState(savedAnimations === 'true');
      }
    } catch (error) {
      console.error('Error loading theme:', error);
    }
  };

  const setTheme = async (newThemeName: ThemeName) => {
    try {
      await AsyncStorage.setItem('app_theme', newThemeName);
      setThemeNameState(newThemeName);
      setThemeState(getTheme(newThemeName));
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  const setAnimationsEnabled = async (enabled: boolean) => {
    try {
      await AsyncStorage.setItem('theme_animations', enabled.toString());
      setAnimationsEnabledState(enabled);
    } catch (error) {
      console.error('Error saving animation preference:', error);
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        themeName,
        setTheme,
        animationsEnabled,
        setAnimationsEnabled,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
