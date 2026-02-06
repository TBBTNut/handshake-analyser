// Theme definitions for the modem emulator app
export type ThemeName = 'terminal' | 'windows95' | 'windowsXP' | 'macOS9';

export interface Theme {
  name: ThemeName;
  displayName: string;
  icon: string;
  
  // Colors
  background: string;
  surface: string;
  surfaceLight: string;
  surfaceDark: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderLight: string;
  borderDark: string;
  success: string;
  error: string;
  warning: string;
  info: string;
  
  // Typography
  fontFamily: string;
  fontSize: {
    small: number;
    medium: number;
    large: number;
    xlarge: number;
  };
  
  // Borders
  borderWidth: number;
  borderRadius: number;
  
  // Shadows
  shadow: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
  
  // Button styles
  button: {
    background: string;
    border: string;
    borderWidth: number;
    borderRadius: number;
    padding: number;
    shadow: boolean;
  };
  
  // Special effects
  inset: boolean;  // 3D inset effect (Win95/XP)
  gradient: boolean;  // Gradient backgrounds (XP/Mac)
  glow: boolean;  // Glow effects (Mac)
}

export const themes: Record<ThemeName, Theme> = {
  terminal: {
    name: 'terminal',
    displayName: 'Terminal',
    icon: 'terminal',
    
    background: '#000000',
    surface: '#111111',
    surfaceLight: '#222222',
    surfaceDark: '#000000',
    primary: '#00ff00',
    secondary: '#0f0',
    accent: '#00ff00',
    text: '#00ff00',
    textSecondary: '#0f0',
    textMuted: '#888888',
    border: '#00ff00',
    borderLight: '#00ff00',
    borderDark: '#008800',
    success: '#00ff00',
    error: '#ff0000',
    warning: '#ffff00',
    info: '#00ffff',
    
    fontFamily: 'Courier',
    fontSize: {
      small: 12,
      medium: 14,
      large: 16,
      xlarge: 20,
    },
    
    borderWidth: 1,
    borderRadius: 8,
    
    shadow: {
      shadowColor: '#00ff00',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 2,
    },
    
    button: {
      background: '#00ff00',
      border: '#00ff00',
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      shadow: false,
    },
    
    inset: false,
    gradient: false,
    glow: true,
  },
  
  windows95: {
    name: 'windows95',
    displayName: 'Windows 95',
    icon: 'desktop-outline',
    
    background: '#008080',  // Teal background
    surface: '#c0c0c0',     // Classic gray
    surfaceLight: '#ffffff',
    surfaceDark: '#808080',
    primary: '#000080',     // Navy blue
    secondary: '#0000ff',
    accent: '#000080',
    text: '#000000',
    textSecondary: '#000000',
    textMuted: '#808080',
    border: '#000000',
    borderLight: '#ffffff',
    borderDark: '#808080',
    success: '#008000',
    error: '#ff0000',
    warning: '#ffff00',
    info: '#0000ff',
    
    fontFamily: 'System',
    fontSize: {
      small: 11,
      medium: 12,
      large: 14,
      xlarge: 16,
    },
    
    borderWidth: 2,
    borderRadius: 0,
    
    shadow: {
      shadowColor: '#000000',
      shadowOffset: { width: 2, height: 2 },
      shadowOpacity: 0.5,
      shadowRadius: 0,
      elevation: 0,
    },
    
    button: {
      background: '#c0c0c0',
      border: '#000000',
      borderWidth: 2,
      borderRadius: 0,
      padding: 12,
      shadow: false,
    },
    
    inset: true,
    gradient: false,
    glow: false,
  },
  
  windowsXP: {
    name: 'windowsXP',
    displayName: 'Windows XP',
    icon: 'desktop',
    
    background: '#5a7fbe',  // XP blue
    surface: '#ece9d8',     // Luna gray
    surfaceLight: '#ffffff',
    surfaceDark: '#d4d0c8',
    primary: '#0054e3',     // XP blue
    secondary: '#73a2ff',
    accent: '#ff6b00',      // XP orange
    text: '#000000',
    textSecondary: '#000000',
    textMuted: '#7a7a7a',
    border: '#003c74',
    borderLight: '#ffffff',
    borderDark: '#7a96df',
    success: '#37844a',
    error: '#e81123',
    warning: '#ffc83d',
    info: '#0078d7',
    
    fontFamily: 'System',
    fontSize: {
      small: 11,
      medium: 13,
      large: 15,
      xlarge: 18,
    },
    
    borderWidth: 1,
    borderRadius: 4,
    
    shadow: {
      shadowColor: '#000000',
      shadowOffset: { width: 1, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 3,
      elevation: 3,
    },
    
    button: {
      background: '#ece9d8',
      border: '#003c74',
      borderWidth: 1,
      borderRadius: 4,
      padding: 14,
      shadow: true,
    },
    
    inset: true,
    gradient: true,
    glow: false,
  },
  
  macOS9: {
    name: 'macOS9',
    displayName: 'Mac OS 9',
    icon: 'logo-apple',
    
    background: '#dddddd',  // Platinum
    surface: '#dddddd',
    surfaceLight: '#ffffff',
    surfaceDark: '#999999',
    primary: '#0066cc',     // Mac blue
    secondary: '#6699cc',
    accent: '#ff3b30',      // Mac red
    text: '#000000',
    textSecondary: '#333333',
    textMuted: '#666666',
    border: '#000000',
    borderLight: '#ffffff',
    borderDark: '#666666',
    success: '#34c759',
    error: '#ff3b30',
    warning: '#ff9500',
    info: '#5ac8fa',
    
    fontFamily: 'System',
    fontSize: {
      small: 10,
      medium: 12,
      large: 14,
      xlarge: 16,
    },
    
    borderWidth: 1,
    borderRadius: 8,
    
    shadow: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 2,
      elevation: 2,
    },
    
    button: {
      background: '#dddddd',
      border: '#000000',
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      shadow: true,
    },
    
    inset: true,
    gradient: true,
    glow: true,
  },
};

export const getTheme = (themeName: ThemeName): Theme => {
  return themes[themeName] || themes.terminal;
};
