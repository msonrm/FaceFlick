import 'flick_key.dart';

/// 顔の状態を管理するクラス
class FaceState {
  /// 顔のX方向の傾き（左右）-1.0 〜 1.0
  final double headRotationX;

  /// 顔のY方向の傾き（上下）-1.0 〜 1.0
  final double headRotationY;

  /// 顔のZ方向の傾き（首かしげ）-1.0 〜 1.0
  final double headRotationZ;

  /// 口の開き具合 0.0 〜 1.0
  final double mouthOpenRatio;

  /// 顔が検出されているか
  final bool isFaceDetected;

  const FaceState({
    this.headRotationX = 0.0,
    this.headRotationY = 0.0,
    this.headRotationZ = 0.0,
    this.mouthOpenRatio = 0.0,
    this.isFaceDetected = false,
  });

  /// 口が開いているとみなす閾値
  static const double mouthOpenThreshold = 0.3;

  /// グリッド選択の感度（この角度以上で隣のセルへ移動）
  static const double gridSensitivity = 15.0; // 度

  /// フリック判定の感度
  static const double flickSensitivity = 20.0; // 度

  /// 口が開いているか
  bool get isMouthOpen => mouthOpenRatio > mouthOpenThreshold;

  /// 顔の向きから3x4グリッドの位置を計算
  /// 戻り値: (row, col) または null（範囲外）
  (int row, int col)? getGridPosition() {
    if (!isFaceDetected) return null;

    // headRotationY（上下）を行に、headRotationX（左右）を列にマッピング
    // 角度を-45度〜+45度の範囲でグリッドにマッピング

    // 列の計算（左右）: -45〜-15 -> 0, -15〜+15 -> 1, +15〜+45 -> 2
    int col;
    if (headRotationY < -gridSensitivity) {
      col = 0;  // 左
    } else if (headRotationY > gridSensitivity) {
      col = 2;  // 右
    } else {
      col = 1;  // 中央
    }

    // 行の計算（上下）: 4行に分割
    // -60〜-30 -> 0, -30〜0 -> 1, 0〜30 -> 2, 30〜60 -> 3
    int row;
    if (headRotationX < -30) {
      row = 0;  // 上
    } else if (headRotationX < 0) {
      row = 1;
    } else if (headRotationX < 30) {
      row = 2;
    } else {
      row = 3;  // 下
    }

    return (row, col);
  }

  /// 基準位置からのフリック方向を計算
  FlickDirection getFlickDirection(FaceState baseState) {
    if (!isFaceDetected || !baseState.isFaceDetected) {
      return FlickDirection.none;
    }

    final deltaX = headRotationX - baseState.headRotationX;  // 上下
    final deltaY = headRotationY - baseState.headRotationY;  // 左右

    // 最も大きな変化を持つ方向を採用
    if (deltaX.abs() > flickSensitivity || deltaY.abs() > flickSensitivity) {
      if (deltaX.abs() > deltaY.abs()) {
        // 上下方向が優勢
        return deltaX < 0 ? FlickDirection.up : FlickDirection.down;
      } else {
        // 左右方向が優勢
        return deltaY < 0 ? FlickDirection.left : FlickDirection.right;
      }
    }

    return FlickDirection.none;
  }

  FaceState copyWith({
    double? headRotationX,
    double? headRotationY,
    double? headRotationZ,
    double? mouthOpenRatio,
    bool? isFaceDetected,
  }) {
    return FaceState(
      headRotationX: headRotationX ?? this.headRotationX,
      headRotationY: headRotationY ?? this.headRotationY,
      headRotationZ: headRotationZ ?? this.headRotationZ,
      mouthOpenRatio: mouthOpenRatio ?? this.mouthOpenRatio,
      isFaceDetected: isFaceDetected ?? this.isFaceDetected,
    );
  }

  @override
  String toString() {
    return 'FaceState(x: ${headRotationX.toStringAsFixed(1)}, '
        'y: ${headRotationY.toStringAsFixed(1)}, '
        'mouth: ${mouthOpenRatio.toStringAsFixed(2)}, '
        'detected: $isFaceDetected)';
  }
}

/// 入力状態を管理するクラス
enum InputPhase {
  /// 待機中（口が閉じている）
  idle,
  /// キー確認中（口を開けて同じキーで2秒待機中）
  waiting,
  /// キー選択完了（2秒経過、フリック待ち）
  selecting,
  /// フリック中（口を開いたまま移動）
  flicking,
}

class InputState {
  final InputPhase phase;
  final FaceState? selectStartState;  // 選択開始時の顔の状態
  final (int, int)? selectedCell;     // 選択中のセル
  final FlickDirection flickDirection;
  final DateTime? waitStartTime;      // 待機開始時刻
  final double waitProgress;          // 待機進捗 (0.0 ~ 1.0)

  const InputState({
    this.phase = InputPhase.idle,
    this.selectStartState,
    this.selectedCell,
    this.flickDirection = FlickDirection.none,
    this.waitStartTime,
    this.waitProgress = 0.0,
  });

  InputState copyWith({
    InputPhase? phase,
    FaceState? selectStartState,
    (int, int)? selectedCell,
    FlickDirection? flickDirection,
    DateTime? waitStartTime,
    double? waitProgress,
  }) {
    return InputState(
      phase: phase ?? this.phase,
      selectStartState: selectStartState ?? this.selectStartState,
      selectedCell: selectedCell ?? this.selectedCell,
      flickDirection: flickDirection ?? this.flickDirection,
      waitStartTime: waitStartTime ?? this.waitStartTime,
      waitProgress: waitProgress ?? this.waitProgress,
    );
  }
}
