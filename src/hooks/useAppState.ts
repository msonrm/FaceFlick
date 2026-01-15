import { useReducer, useCallback } from 'react';
import {
  AppState,
  AppAction,
  CalibrationSettings,
  KeyPosition,
  FlickDirection,
  AppError,
} from '../types';
import {
  DEFAULT_LAYOUT_ID,
  getLayout,
  getKeyAt,
  getCharacter,
} from '../utils/keyboard-layout';
import { toggleCharacter } from '../utils/character-utils';
import { speakText, cancelSpeech, SpeechCallbacks } from '../utils/speech';

// ============================================
// 初期状態
// ============================================

const initialState: AppState = {
  phase: 'loading',
  input: {
    phase: 'idle',
    selectedKey: null,
    flickDirection: null,
    holdPosition: null,
    previewChar: null,
  },
  text: '',
  calibration: null,
  keyboardModeId: DEFAULT_LAYOUT_ID,
  faceDisplayMode: 'vrm',
  error: null,
};

// ============================================
// Reducer
// ============================================

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // ----------------------------------------
    // フェーズ遷移
    // ----------------------------------------
    case 'RESOURCES_LOADED':
      return {
        ...state,
        phase: 'calibrating',
      };

    case 'CALIBRATION_COMPLETE':
      return {
        ...state,
        phase: 'ready',
        calibration: action.settings,
      };

    case 'RECALIBRATE':
      return {
        ...state,
        phase: 'calibrating',
        calibration: null,
        input: {
          phase: 'idle',
          selectedKey: null,
          flickDirection: null,
          holdPosition: null,
          previewChar: null,
        },
      };

    // ----------------------------------------
    // 入力状態
    // ----------------------------------------
    case 'KEY_HOVER': {
      // ready状態でないとホバー無効
      if (state.phase !== 'ready') return state;
      // triggering/selecting/flicking中はホバー位置変更しない（ホールド位置で固定）
      if (state.input.phase !== 'idle') return state;

      return {
        ...state,
        input: {
          ...state.input,
          selectedKey: action.position,
        },
      };
    }

    case 'TRIGGER_DETECTED': {
      // トリガー検出（ホールド時間前）→ triggering状態へ
      if (state.phase !== 'ready') return state;
      // すでにtriggering以降の場合は無視
      if (state.input.phase !== 'idle') return state;

      return {
        ...state,
        input: {
          ...state.input,
          phase: 'triggering',
          selectedKey: action.position,
        },
      };
    }

    case 'TRIGGER_START': {
      if (state.phase !== 'ready') return state;

      const layout = getLayout(state.keyboardModeId);
      const key = getKeyAt(layout, action.position);
      const previewChar = key ? getCharacter(key, 'center') : null;

      return {
        ...state,
        input: {
          phase: 'selecting',
          selectedKey: action.position,
          flickDirection: 'center',
          holdPosition: action.holdPosition,
          previewChar,
        },
      };
    }

    case 'FLICK_DETECTED': {
      if (state.input.phase !== 'selecting' && state.input.phase !== 'flicking') {
        return state;
      }

      const layout = getLayout(state.keyboardModeId);
      const key = state.input.selectedKey ? getKeyAt(layout, state.input.selectedKey) : null;
      const previewChar = key ? getCharacter(key, action.direction) : null;

      return {
        ...state,
        input: {
          ...state.input,
          phase: 'flicking',
          flickDirection: action.direction,
          previewChar,
        },
      };
    }

    case 'TRIGGER_END': {
      // idle状態に戻す（文字入力はCHAR_INPUTで別途処理）
      return {
        ...state,
        input: {
          phase: 'idle',
          selectedKey: state.input.selectedKey, // 位置は維持
          flickDirection: null,
          holdPosition: null,
          previewChar: null,
        },
      };
    }

    // ----------------------------------------
    // テキスト操作
    // ----------------------------------------
    case 'CHAR_INPUT': {
      if (!action.char) return state;
      return {
        ...state,
        text: state.text + action.char,
      };
    }

    case 'BACKSPACE': {
      if (state.text.length === 0) return state;
      // 最後の1文字を削除
      const newText = [...state.text].slice(0, -1).join('');
      return {
        ...state,
        text: newText,
      };
    }

    case 'TOGGLE_MODIFIER': {
      if (state.text.length === 0) return state;
      const chars = [...state.text];
      const lastChar = chars[chars.length - 1];
      const toggled = toggleCharacter(lastChar);
      if (toggled === lastChar) return state; // 変換なし
      chars[chars.length - 1] = toggled;
      return {
        ...state,
        text: chars.join(''),
      };
    }

    case 'SPEAK_AND_CLEAR': {
      // 読み上げは副作用なのでここでは状態のみクリア
      // 実際の読み上げはdispatch側で行う
      return {
        ...state,
        text: '',
      };
    }

    // ----------------------------------------
    // 設定変更
    // ----------------------------------------
    case 'SET_KEYBOARD_MODE':
      return {
        ...state,
        keyboardModeId: action.modeId,
        // モード変更時は入力状態をリセット
        input: {
          phase: 'idle',
          selectedKey: null,
          flickDirection: null,
          holdPosition: null,
          previewChar: null,
        },
      };

    case 'SET_FACE_DISPLAY_MODE':
      return {
        ...state,
        faceDisplayMode: action.mode,
      };

    // ----------------------------------------
    // エラー
    // ----------------------------------------
    case 'SET_ERROR':
      return {
        ...state,
        error: action.error,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };

    default:
      return state;
  }
}

// ============================================
// Hook
// ============================================

export function useAppState() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // 読み上げ＆クリアのラッパー（副作用を含む）
  const speakAndClear = useCallback((callbacks?: SpeechCallbacks) => {
    if (state.text) {
      cancelSpeech();
      speakText(state.text, 'human_high', callbacks);
    }
    dispatch({ type: 'SPEAK_AND_CLEAR' });
  }, [state.text]);

  // 便利なディスパッチャー
  const actions = {
    resourcesLoaded: () => dispatch({ type: 'RESOURCES_LOADED' }),
    calibrationComplete: (settings: CalibrationSettings) =>
      dispatch({ type: 'CALIBRATION_COMPLETE', settings }),
    keyHover: (position: KeyPosition) =>
      dispatch({ type: 'KEY_HOVER', position }),
    triggerDetected: (position: KeyPosition) =>
      dispatch({ type: 'TRIGGER_DETECTED', position }),
    triggerStart: (position: KeyPosition, holdPosition: { yaw: number; pitch: number }) =>
      dispatch({ type: 'TRIGGER_START', position, holdPosition }),
    flickDetected: (direction: FlickDirection) =>
      dispatch({ type: 'FLICK_DETECTED', direction }),
    triggerEnd: () => dispatch({ type: 'TRIGGER_END' }),
    charInput: (char: string) => dispatch({ type: 'CHAR_INPUT', char }),
    backspace: () => dispatch({ type: 'BACKSPACE' }),
    toggleModifier: () => dispatch({ type: 'TOGGLE_MODIFIER' }),
    speakAndClear,
    setKeyboardMode: (modeId: string) =>
      dispatch({ type: 'SET_KEYBOARD_MODE', modeId }),
    setFaceDisplayMode: (mode: 'none' | 'vrm') =>
      dispatch({ type: 'SET_FACE_DISPLAY_MODE', mode }),
    setError: (error: AppError) => dispatch({ type: 'SET_ERROR', error }),
    clearError: () => dispatch({ type: 'CLEAR_ERROR' }),
    recalibrate: () => dispatch({ type: 'RECALIBRATE' }),
  };

  return { state, dispatch, actions };
}

export type AppActions = ReturnType<typeof useAppState>['actions'];
