import 'dart:async';
import '../models/face_state.dart';
import '../models/flick_key.dart';

/// 顔の状態から入力を管理するクラス
class InputManager {
  InputState _state = const InputState();
  FaceState? _lastFaceState;

  final _inputController = StreamController<String>.broadcast();
  final _stateController = StreamController<InputState>.broadcast();

  Stream<String> get inputStream => _inputController.stream;
  Stream<InputState> get stateStream => _stateController.stream;

  InputState get currentState => _state;

  /// 顔の状態を更新
  void updateFaceState(FaceState faceState) {
    final previousMouthOpen = _lastFaceState?.isMouthOpen ?? false;
    final currentMouthOpen = faceState.isMouthOpen;

    switch (_state.phase) {
      case InputPhase.idle:
        _handleIdlePhase(faceState, previousMouthOpen, currentMouthOpen);
        break;
      case InputPhase.selecting:
        _handleSelectingPhase(faceState, previousMouthOpen, currentMouthOpen);
        break;
      case InputPhase.flicking:
        _handleFlickingPhase(faceState, previousMouthOpen, currentMouthOpen);
        break;
    }

    _lastFaceState = faceState;
  }

  /// 待機フェーズの処理
  void _handleIdlePhase(FaceState faceState, bool prevMouth, bool currMouth) {
    // 口が開いた瞬間 -> 選択開始
    if (!prevMouth && currMouth) {
      final gridPos = faceState.getGridPosition();
      if (gridPos != null) {
        _updateState(_state.copyWith(
          phase: InputPhase.selecting,
          selectStartState: faceState,
          selectedCell: gridPos,
          flickDirection: FlickDirection.none,
        ));
      }
    }
  }

  /// 選択フェーズの処理
  void _handleSelectingPhase(FaceState faceState, bool prevMouth, bool currMouth) {
    if (!currMouth) {
      // 口を閉じた -> 入力確定（フリックなし）
      _confirmInput(FlickDirection.none);
      return;
    }

    // フリック方向を検出
    if (_state.selectStartState != null) {
      final direction = faceState.getFlickDirection(_state.selectStartState!);
      if (direction != FlickDirection.none) {
        // フリックを検出 -> フリックフェーズへ
        _updateState(_state.copyWith(
          phase: InputPhase.flicking,
          flickDirection: direction,
        ));
      }
    }
  }

  /// フリックフェーズの処理
  void _handleFlickingPhase(FaceState faceState, bool prevMouth, bool currMouth) {
    if (!currMouth) {
      // 口を閉じた -> 入力確定（フリック方向込み）
      _confirmInput(_state.flickDirection);
      return;
    }

    // フリック方向を更新
    if (_state.selectStartState != null) {
      final direction = faceState.getFlickDirection(_state.selectStartState!);
      if (direction != _state.flickDirection) {
        _updateState(_state.copyWith(flickDirection: direction));
      }
    }
  }

  /// 入力を確定
  void _confirmInput(FlickDirection direction) {
    final cell = _state.selectedCell;
    if (cell != null) {
      final key = FlickKeyboard.getKey(cell.$1, cell.$2);
      if (key != null) {
        final char = key.getCharByDirection(direction);
        if (char != null) {
          _inputController.add(char);
        }
      }
    }

    // 状態をリセット
    _updateState(const InputState(phase: InputPhase.idle));
  }

  /// 状態を更新して通知
  void _updateState(InputState newState) {
    _state = newState;
    _stateController.add(_state);
  }

  /// グリッド位置を取得（外部からの参照用）
  (int, int)? getGridPosition(FaceState faceState) {
    return faceState.getGridPosition();
  }

  /// リソースを解放
  void dispose() {
    _inputController.close();
    _stateController.close();
  }
}
