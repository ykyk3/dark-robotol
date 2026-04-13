export const CONFIG = {
  GRID_COLS: 10, // 横（自陣5 + 敵陣5）
  GRID_ROWS: 6, // 縦（6ライン）
  CELL_PX: 48,

  TEAM_SIZE: 3,

  // 陣地: 左が自陣、右が敵陣
  TERRITORY_X: 5, // 自陣: x < 5, 敵陣: x >= 5

  DAMAGE_VARIANCE_MIN: 0.85,
  DAMAGE_VARIANCE_MAX: 1.15,
  DEFENSE_FACTOR: 100,

  SCAN_VISIBLE_DURATION: 1,

  COLORS: {
    BG_DARK: '#0a0a0f',
    BG_PURPLE: '#1a0a2e',
    ACCENT_RED: '#dc143c',
    ACCENT_BLUE: '#00d4ff',
    ACCENT_GREEN: '#39ff14',
    GRID_LINE: '#1a1a2e',
    GRID_LINE_LIGHT: '#2a2a4e',
    PLAYER_UNIT: '#00d4ff',
    ENEMY_UNIT: '#dc143c',
    ENEMY_SCANNED: '#ff4466',
    MOVE_RANGE: 'rgba(0, 212, 255, 0.15)',
    ATTACK_RANGE: 'rgba(220, 20, 60, 0.2)',
    SCAN_RANGE: 'rgba(57, 255, 20, 0.15)',
  },
} as const;
