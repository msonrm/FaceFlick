import 'dart:async';
import '../models/face_state.dart';
import '../models/flick_key.dart';

/// 顔の状態から入力を管理するクラス
class InputManager {
  InputState _state = const InputState();
  FaceState? _lastFaceState;
  (int, int)? _lastGridPosition;

  /// キー選択確定までの待機時間（ミリ秒）
  static const int waitDurationMs = 2000;

  final _inputController = StreamController<String>.broadcast();
  final _stateController = StreamController<InputState>.broadcast();

  Stream<String> get inputStream => _inputController.stream;
  Stream<InputState> get stateStream => _stateController.stream;

  InputState get currentState => _state;

  /// 顔の状態を更新（グリッド位置はキャリブレーション済みの値を外部から渡す）
  void updateFaceState(FaceState faceState, {(int, int)? gridPosition}) {
    final previousMouthOpen = _lastFaceState?.isMouthOpen ?? false;
    final currentMouthOpen = faceState.isMouthOpen;

    // グリッド位置を保存
    _lastGridPosition = gridPosition ?? faceState.getGridPosition();

    switch (_state.phase) {
      case InputPhase.idle:
        _handleIdlePhase(faceState, previousMouthOpen, currentMouthOpen);
        break;
      case InputPhase.waiting:
        _handleWaitingPhase(faceState, previousMouthOpen, currentMouthOpen);
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
    // 口が開いた瞬間 -> 待機開始
    if (!prevMouth && currMouth) {
      final gridPos = _lastGridPosition;
      if (gridPos != null) {
        _updateState(InputState(
          phase: InputPhase.waiting,
          selectedCell: gridPos,
          waitStartTime: DateTime.now(),
          waitProgress: 0.0,
          flickDirection: FlickDirection.none,
        ));
      }
    }
  }

  /// 待機フェーズの処理（2秒待ち）
  void _handleWaitingPhase(FaceState faceState, bool prevMouth, bool currMouth) {
    // 口を閉じた -> キャンセル
    if (!currMouth) {
      _updateState(const InputState(phase: InputPhase.idle));
      return;
    }

    final gridPos = _lastGridPosition;
    final selectedCell = _state.selectedCell;

    // セルが変わった -> 待機リセット
    if (gridPos != null && selectedCell != null && gridPos != selectedCell) {
      _updateState(InputState(
        phase: InputPhase.waiting,
        selectedCell: gridPos,
        waitStartTime: DateTime.now(),
        waitProgress: 0.0,
        flickDirection: FlickDirection.none,
      ));
      return;
    }

    // 待機時間を計算
    final waitStart = _state.waitStartTime;
    if (waitStart != null) {
      final elapsed = DateTime.now().difference(waitStart).inMilliseconds;
      final progress = (elapsed / waitDurationMs).clamp(0.0, 1.0);

      if (elapsed >= waitDurationMs) {
        // 2秒経過 -> 選択確定、フリック待ちへ
        _updateState(_state.copyWith(
          phase: InputPhase.selecting,
          selectStartState: faceState,
          waitProgress: 1.0,
        ));
      } else {
        // 進捗を更新
        _updateState(_state.copyWith(waitProgress: progress));
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

  /// リソースを解放
  void dispose() {
    _inputController.close();
    _stateController.close();
  }
}
