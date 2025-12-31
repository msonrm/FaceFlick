/// キャリブレーション設定
class CalibrationData {
  /// 中央位置（正面を向いた時）のX座標
  final double centerX;

  /// 中央位置のY座標
  final double centerY;

  /// X軸（左右）の最大範囲（度）
  final double rangeX;

  /// Y軸（上下）の最大範囲（度）
  final double rangeY;

  /// 口を開いたと判定する閾値
  final double mouthThreshold;

  const CalibrationData({
    this.centerX = 0.0,
    this.centerY = 0.0,
    this.rangeX = 30.0,
    this.rangeY = 40.0,
    this.mouthThreshold = 0.3,
  });

  /// 生の顔データからキャリブレーション済みの値を計算
  /// 戻り値: (-1.0 ~ 1.0) に正規化された値
  double normalizeX(double rawX) {
    final offset = rawX - centerX;
    return (offset / rangeX).clamp(-1.0, 1.0);
  }

  double normalizeY(double rawY) {
    final offset = rawY - centerY;
    return (offset / rangeY).clamp(-1.0, 1.0);
  }

  /// 正規化された座標からグリッド位置を計算
  /// X: -1.0(左) ~ 1.0(右) -> 列 0, 1, 2
  /// Y: -1.0(上) ~ 1.0(下) -> 行 0, 1, 2, 3
  /// ゼロ座標は「な」キー（row=1, col=1）に対応
  (int row, int col)? getGridPosition(double normalizedX, double normalizedY) {
    // 列の計算（3列）- 中央列が 0
    int col;
    if (normalizedX < -0.33) {
      col = 0;  // 左
    } else if (normalizedX > 0.33) {
      col = 2;  // 右
    } else {
      col = 1;  // 中央
    }

    // 行の計算（4行）- 「な」(row=1)が 0 になるよう調整
    // 各行の範囲: row0[-1.0,-0.25), row1[-0.25,0.25), row2[0.25,0.75), row3[0.75,1.0]
    int row;
    if (normalizedY < -0.25) {
      row = 0;  // 上（あ/か/さ）
    } else if (normalizedY < 0.25) {
      row = 1;  // 「な」行（た/な/は）← 0 はここ
    } else if (normalizedY < 0.75) {
      row = 2;  // ま/や/ら
    } else {
      row = 3;  // 下（゛/わ/⌫）
    }

    return (row, col);
  }

  /// 口が開いているか判定
  bool isMouthOpen(double mouthRatio) {
    return mouthRatio > mouthThreshold;
  }

  CalibrationData copyWith({
    double? centerX,
    double? centerY,
    double? rangeX,
    double? rangeY,
    double? mouthThreshold,
  }) {
    return CalibrationData(
      centerX: centerX ?? this.centerX,
      centerY: centerY ?? this.centerY,
      rangeX: rangeX ?? this.rangeX,
      rangeY: rangeY ?? this.rangeY,
      mouthThreshold: mouthThreshold ?? this.mouthThreshold,
    );
  }

  /// JSONに変換
  Map<String, dynamic> toJson() {
    return {
      'centerX': centerX,
      'centerY': centerY,
      'rangeX': rangeX,
      'rangeY': rangeY,
      'mouthThreshold': mouthThreshold,
    };
  }

  /// JSONから生成
  factory CalibrationData.fromJson(Map<String, dynamic> json) {
    return CalibrationData(
      centerX: (json['centerX'] as num?)?.toDouble() ?? 0.0,
      centerY: (json['centerY'] as num?)?.toDouble() ?? 0.0,
      rangeX: (json['rangeX'] as num?)?.toDouble() ?? 30.0,
      rangeY: (json['rangeY'] as num?)?.toDouble() ?? 40.0,
      mouthThreshold: (json['mouthThreshold'] as num?)?.toDouble() ?? 0.3,
    );
  }

  @override
  String toString() {
    return 'Calibration(center: ($centerX, $centerY), range: ($rangeX, $rangeY), mouth: $mouthThreshold)';
  }
}

/// キャリブレーションの状態
enum CalibrationStep {
  /// 待機中
  idle,
  /// 中央位置を設定中
  settingCenter,
  /// 左端を設定中
  settingLeft,
  /// 右端を設定中
  settingRight,
  /// 上端を設定中
  settingTop,
  /// 下端を設定中
  settingBottom,
  /// 口の閾値を設定中
  settingMouth,
  /// 完了
  done,
}

extension CalibrationStepExtension on CalibrationStep {
  String get instruction {
    switch (this) {
      case CalibrationStep.idle:
        return 'キャリブレーションを開始します';
      case CalibrationStep.settingCenter:
        return '正面を向いて口を開けてください';
      case CalibrationStep.settingLeft:
        return '左を向いて口を開けてください';
      case CalibrationStep.settingRight:
        return '右を向いて口を開けてください';
      case CalibrationStep.settingTop:
        return '上を向いて口を開けてください';
      case CalibrationStep.settingBottom:
        return '下を向いて口を開けてください';
      case CalibrationStep.settingMouth:
        return '口を大きく開けてください';
      case CalibrationStep.done:
        return 'キャリブレーション完了！';
    }
  }

  CalibrationStep get next {
    switch (this) {
      case CalibrationStep.idle:
        return CalibrationStep.settingCenter;
      case CalibrationStep.settingCenter:
        return CalibrationStep.settingLeft;
      case CalibrationStep.settingLeft:
        return CalibrationStep.settingRight;
      case CalibrationStep.settingRight:
        return CalibrationStep.settingTop;
      case CalibrationStep.settingTop:
        return CalibrationStep.settingBottom;
      case CalibrationStep.settingBottom:
        return CalibrationStep.settingMouth;
      case CalibrationStep.settingMouth:
        return CalibrationStep.done;
      case CalibrationStep.done:
        return CalibrationStep.done;
    }
  }
}
