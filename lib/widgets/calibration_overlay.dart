import 'dart:async';
import 'package:flutter/material.dart';
import '../models/calibration.dart';

/// キャリブレーションオーバーレイウィジェット（改善版）
class CalibrationOverlay extends StatefulWidget {
  final double currentX;
  final double currentY;
  final double currentMouth;
  final bool isFaceDetected;
  final void Function(CalibrationData) onComplete;
  final VoidCallback onCancel;

  const CalibrationOverlay({
    super.key,
    required this.currentX,
    required this.currentY,
    required this.currentMouth,
    required this.isFaceDetected,
    required this.onComplete,
    required this.onCancel,
  });

  @override
  State<CalibrationOverlay> createState() => _CalibrationOverlayState();
}

class _CalibrationOverlayState extends State<CalibrationOverlay> {
  CalibrationStep _step = CalibrationStep.idle;
  bool _isCapturing = false;
  int _countdown = 0;

  // キャリブレーション値
  double _centerX = 0;
  double _centerY = 0;
  double _leftY = 0;
  double _rightY = 0;
  double _topX = 0;
  double _bottomX = 0;
  double _maxMouth = 0;

  // 計算された範囲
  double _rangeX = 30.0;
  double _rangeY = 25.0;

  // サンプリング用
  final List<double> _samplesX = [];
  final List<double> _samplesY = [];
  final List<double> _samplesMouth = [];
  Timer? _captureTimer;
  Timer? _sampleTimer;

  @override
  void dispose() {
    _captureTimer?.cancel();
    _sampleTimer?.cancel();
    super.dispose();
  }

  void _startCalibration() {
    setState(() {
      _step = CalibrationStep.settingCenter;
    });
  }

  void _captureCurrentPosition() {
    if (_isCapturing || !widget.isFaceDetected) return;

    setState(() {
      _isCapturing = true;
      _countdown = 3;
      _samplesX.clear();
      _samplesY.clear();
      _samplesMouth.clear();
    });

    // 3秒カウントダウン
    _captureTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }

      setState(() {
        _countdown--;
      });

      if (_countdown <= 0) {
        timer.cancel();
        _finishCapture();
      }
    });

    // サンプリング開始
    _sampleTimer = Timer.periodic(const Duration(milliseconds: 100), (timer) {
      if (_countdown <= 0 || !mounted) {
        timer.cancel();
        return;
      }
      if (widget.isFaceDetected) {
        _samplesX.add(widget.currentX);
        _samplesY.add(widget.currentY);
        _samplesMouth.add(widget.currentMouth);
      }
    });
  }

  void _finishCapture() {
    if (_samplesX.isEmpty) {
      setState(() {
        _isCapturing = false;
      });
      return;
    }

    // 平均値を計算
    final avgX = _samplesX.reduce((a, b) => a + b) / _samplesX.length;
    final avgY = _samplesY.reduce((a, b) => a + b) / _samplesY.length;
    final avgMouth = _samplesMouth.reduce((a, b) => a + b) / _samplesMouth.length;

    setState(() {
      switch (_step) {
        case CalibrationStep.settingCenter:
          // 中央位置を設定（ゼロリセット）
          _centerX = avgX;
          _centerY = avgY;
          break;

        case CalibrationStep.settingLeft:
          // 左端を設定、左右幅を仮確定
          _leftY = avgY;
          final leftDist = (_centerY - _leftY).abs();
          _rangeY = leftDist.clamp(10.0, 50.0);
          break;

        case CalibrationStep.settingRight:
          // 右端を設定、左右幅を確定
          _rightY = avgY;
          final rightDist = (_rightY - _centerY).abs();
          final leftDist = (_centerY - _leftY).abs();
          _rangeY = ((leftDist + rightDist) / 2).clamp(10.0, 50.0);
          break;

        case CalibrationStep.settingTop:
          // 上端を設定、上下幅を仮確定
          _topX = avgX;
          final topDist = (_centerX - _topX).abs();
          // 4行あるので上下は広めに
          _rangeX = (topDist * 2).clamp(15.0, 60.0);
          break;

        case CalibrationStep.settingBottom:
          // 下端を設定、上下幅を確定
          _bottomX = avgX;
          final bottomDist = (_bottomX - _centerX).abs();
          final topDist = (_centerX - _topX).abs();
          _rangeX = ((topDist + bottomDist) / 2 * 1.5).clamp(15.0, 60.0);
          break;

        case CalibrationStep.settingMouth:
          // 口の最大開き
          _maxMouth = avgMouth;
          break;

        default:
          break;
      }

      _isCapturing = false;
      _step = _step.next;

      if (_step == CalibrationStep.done) {
        _completeCalibration();
      }
    });
  }

  void _completeCalibration() {
    final mouthThreshold = (_maxMouth * 0.4).clamp(0.1, 0.7);

    // 軸の対応:
    // - centerX/rangeX は normalizeX(rotY) で使用 → rotY（左右）のデータを格納
    // - centerY/rangeY は normalizeY(rotX) で使用 → rotX（上下）のデータを格納
    // _centerY は rotY の平均、_centerX は rotX の平均なのでスワップが必要
    final calibration = CalibrationData(
      centerX: _centerY,  // rotY（左右）の中央値
      centerY: _centerX,  // rotX（上下）の中央値
      rangeX: _rangeY,    // 左右の範囲
      rangeY: _rangeX,    // 上下の範囲
      mouthThreshold: mouthThreshold,
    );

    widget.onComplete(calibration);
  }

  // 現在の位置を正規化（-1.0 〜 1.0）
  double _getNormalizedX() {
    if (_step == CalibrationStep.idle || _step == CalibrationStep.settingCenter) {
      return 0;
    }
    return ((widget.currentY - _centerY) / _rangeY).clamp(-1.5, 1.5);
  }

  double _getNormalizedY() {
    if (_step == CalibrationStep.idle || _step == CalibrationStep.settingCenter) {
      return 0;
    }
    return ((widget.currentX - _centerX) / _rangeX).clamp(-1.5, 1.5);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black.withOpacity(0.95),
      child: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 20),
            // タイトル
            const Text(
              'キャリブレーション',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 16),

            // 指示
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 32),
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.blue.shade800,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                _step.instruction,
                style: const TextStyle(fontSize: 18, color: Colors.white),
                textAlign: TextAlign.center,
              ),
            ),

            const SizedBox(height: 24),

            // グリッドと十字
            Expanded(
              child: Center(
                child: AspectRatio(
                  aspectRatio: 3 / 4,
                  child: Container(
                    margin: const EdgeInsets.all(32),
                    child: CustomPaint(
                      painter: _CalibrationGridPainter(
                        normalizedX: _getNormalizedX(),
                        normalizedY: _getNormalizedY(),
                        isFaceDetected: widget.isFaceDetected,
                        currentStep: _step,
                      ),
                      child: Container(),
                    ),
                  ),
                ),
              ),
            ),

            // 現在の値
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.symmetric(horizontal: 32),
              decoration: BoxDecoration(
                color: Colors.grey.shade900,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  Text(
                    '位置: (${widget.currentY.toStringAsFixed(1)}, ${widget.currentX.toStringAsFixed(1)})',
                    style: const TextStyle(color: Colors.white70, fontSize: 12, fontFamily: 'monospace'),
                  ),
                  Text(
                    '範囲: X=${_rangeX.toStringAsFixed(1)} Y=${_rangeY.toStringAsFixed(1)} | 口: ${(widget.currentMouth * 100).toStringAsFixed(0)}%',
                    style: const TextStyle(color: Colors.white70, fontSize: 12, fontFamily: 'monospace'),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // ボタン類
            if (_isCapturing)
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.green.shade700,
                ),
                child: Center(
                  child: Text(
                    '$_countdown',
                    style: const TextStyle(
                      fontSize: 40,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
              )
            else if (_step == CalibrationStep.idle)
              ElevatedButton.icon(
                onPressed: _startCalibration,
                icon: const Icon(Icons.play_arrow),
                label: const Text('開始'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                ),
              )
            else if (_step == CalibrationStep.done)
              const Icon(Icons.check_circle, color: Colors.green, size: 64)
            else
              Column(
                children: [
                  ElevatedButton.icon(
                    onPressed: widget.isFaceDetected ? _captureCurrentPosition : null,
                    icon: const Icon(Icons.camera),
                    label: const Text('記録'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                      backgroundColor: Colors.green,
                    ),
                  ),
                  if (!widget.isFaceDetected)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text('顔が検出されていません', style: TextStyle(color: Colors.red)),
                    ),
                ],
              ),

            const SizedBox(height: 16),

            // プログレス
            _buildProgressIndicator(),

            const SizedBox(height: 16),

            // キャンセルボタン
            TextButton(
              onPressed: widget.onCancel,
              child: const Text('スキップ', style: TextStyle(color: Colors.grey)),
            ),

            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildProgressIndicator() {
    final steps = [
      CalibrationStep.settingCenter,
      CalibrationStep.settingLeft,
      CalibrationStep.settingRight,
      CalibrationStep.settingTop,
      CalibrationStep.settingBottom,
      CalibrationStep.settingMouth,
    ];

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: steps.map((step) {
        final isCompleted = step.index < _step.index;
        final isCurrent = step == _step;

        return Container(
          width: 12,
          height: 12,
          margin: const EdgeInsets.symmetric(horizontal: 4),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isCompleted
                ? Colors.green
                : isCurrent
                    ? Colors.blue
                    : Colors.grey.shade700,
          ),
        );
      }).toList(),
    );
  }
}

/// キャリブレーショングリッドを描画
class _CalibrationGridPainter extends CustomPainter {
  final double normalizedX;
  final double normalizedY;
  final bool isFaceDetected;
  final CalibrationStep currentStep;

  _CalibrationGridPainter({
    required this.normalizedX,
    required this.normalizedY,
    required this.isFaceDetected,
    required this.currentStep,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final gridPaint = Paint()
      ..color = Colors.grey.shade700
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;

    final cellWidth = size.width / 3;
    final cellHeight = size.height / 4;

    // グリッドを描画
    for (int row = 0; row <= 4; row++) {
      canvas.drawLine(
        Offset(0, row * cellHeight),
        Offset(size.width, row * cellHeight),
        gridPaint,
      );
    }
    for (int col = 0; col <= 3; col++) {
      canvas.drawLine(
        Offset(col * cellWidth, 0),
        Offset(col * cellWidth, size.height),
        gridPaint,
      );
    }

    // 「な」のセル（中央、row=1, col=1）をハイライト
    final naCellPaint = Paint()
      ..color = Colors.blue.withOpacity(0.3)
      ..style = PaintingStyle.fill;
    canvas.drawRect(
      Rect.fromLTWH(cellWidth, cellHeight, cellWidth, cellHeight),
      naCellPaint,
    );

    // セルのラベルを描画
    final labels = [
      ['あ', 'か', 'さ'],
      ['た', 'な', 'は'],
      ['ま', 'や', 'ら'],
      ['゛', 'わ', '⌫'],
    ];

    final textStyle = TextStyle(
      color: Colors.grey.shade500,
      fontSize: 16,
    );

    for (int row = 0; row < 4; row++) {
      for (int col = 0; col < 3; col++) {
        final textSpan = TextSpan(text: labels[row][col], style: textStyle);
        final textPainter = TextPainter(
          text: textSpan,
          textDirection: TextDirection.ltr,
        );
        textPainter.layout();
        textPainter.paint(
          canvas,
          Offset(
            col * cellWidth + (cellWidth - textPainter.width) / 2,
            row * cellHeight + (cellHeight - textPainter.height) / 2,
          ),
        );
      }
    }

    // 十字カーソルを描画
    if (isFaceDetected && currentStep != CalibrationStep.idle) {
      // 正規化座標をピクセル座標に変換
      final centerX = size.width / 2;
      final centerY = size.height / 2;

      // -1.0〜1.0 を画面座標にマッピング（中央が0）
      final cursorX = centerX + (normalizedX * size.width / 2);
      final cursorY = centerY + (normalizedY * size.height / 2);

      final crossPaint = Paint()
        ..color = Colors.red
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2;

      // 横線
      canvas.drawLine(
        Offset(cursorX - 15, cursorY),
        Offset(cursorX + 15, cursorY),
        crossPaint,
      );
      // 縦線
      canvas.drawLine(
        Offset(cursorX, cursorY - 15),
        Offset(cursorX, cursorY + 15),
        crossPaint,
      );

      // 中心点
      final dotPaint = Paint()
        ..color = Colors.red
        ..style = PaintingStyle.fill;
      canvas.drawCircle(Offset(cursorX, cursorY), 4, dotPaint);
    }

    // ステップに応じたガイド表示
    _drawStepGuide(canvas, size, cellWidth, cellHeight);
  }

  void _drawStepGuide(Canvas canvas, Size size, double cellWidth, double cellHeight) {
    final guidePaint = Paint()
      ..color = Colors.yellow.withOpacity(0.5)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;

    switch (currentStep) {
      case CalibrationStep.settingCenter:
        // 中央の「な」を強調
        canvas.drawRect(
          Rect.fromLTWH(cellWidth, cellHeight, cellWidth, cellHeight),
          guidePaint,
        );
        break;
      case CalibrationStep.settingLeft:
        // 左列を強調
        canvas.drawRect(
          Rect.fromLTWH(0, 0, cellWidth, size.height),
          guidePaint,
        );
        break;
      case CalibrationStep.settingRight:
        // 右列を強調
        canvas.drawRect(
          Rect.fromLTWH(cellWidth * 2, 0, cellWidth, size.height),
          guidePaint,
        );
        break;
      case CalibrationStep.settingTop:
        // 上行を強調
        canvas.drawRect(
          Rect.fromLTWH(0, 0, size.width, cellHeight),
          guidePaint,
        );
        break;
      case CalibrationStep.settingBottom:
        // 下行を強調
        canvas.drawRect(
          Rect.fromLTWH(0, cellHeight * 3, size.width, cellHeight),
          guidePaint,
        );
        break;
      default:
        break;
    }
  }

  @override
  bool shouldRepaint(covariant _CalibrationGridPainter oldDelegate) {
    return normalizedX != oldDelegate.normalizedX ||
        normalizedY != oldDelegate.normalizedY ||
        isFaceDetected != oldDelegate.isFaceDetected ||
        currentStep != oldDelegate.currentStep;
  }
}
