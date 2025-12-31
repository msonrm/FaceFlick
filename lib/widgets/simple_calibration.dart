import 'dart:async';
import 'package:flutter/material.dart';
import '../models/calibration.dart';

/// シンプルなキャリブレーションウィジェット
/// ①正面を向く → ②口を開けて上下左右に動かす → 自動で範囲検出
class SimpleCalibration extends StatefulWidget {
  final double currentX;  // rotX（上下）
  final double currentY;  // rotY（左右）
  final double currentMouth;
  final bool isFaceDetected;
  final void Function(CalibrationData) onComplete;
  final VoidCallback onCancel;

  const SimpleCalibration({
    super.key,
    required this.currentX,
    required this.currentY,
    required this.currentMouth,
    required this.isFaceDetected,
    required this.onComplete,
    required this.onCancel,
  });

  @override
  State<SimpleCalibration> createState() => _SimpleCalibrationState();
}

enum SimpleCalibrationStep {
  intro,
  settingCenter,
  detectingRange,
  done,
}

class _SimpleCalibrationState extends State<SimpleCalibration> {
  SimpleCalibrationStep _step = SimpleCalibrationStep.intro;

  // 中央位置
  double _centerX = 0;
  double _centerY = 0;

  // 検出された範囲（上下左右の最大値）
  double _minX = 0;  // 上方向の最小値
  double _maxX = 0;  // 下方向の最大値
  double _minY = 0;  // 左方向の最小値
  double _maxY = 0;  // 右方向の最大値

  // 口の閾値検出用
  double _maxMouth = 0;

  // サンプリング用
  final List<double> _samplesX = [];
  final List<double> _samplesY = [];
  Timer? _captureTimer;

  // 範囲検出中のフラグ
  bool _isDetecting = false;
  int _countdown = 3;

  // 検出時間
  static const int _detectDuration = 8; // 8秒間検出
  int _remainingTime = _detectDuration;

  @override
  void dispose() {
    _captureTimer?.cancel();
    super.dispose();
  }

  void _startCenterCapture() {
    if (!widget.isFaceDetected) return;

    setState(() {
      _step = SimpleCalibrationStep.settingCenter;
      _countdown = 3;
      _samplesX.clear();
      _samplesY.clear();
    });

    // 3秒カウントダウンしてサンプリング
    _captureTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }

      // サンプリング
      if (widget.isFaceDetected) {
        _samplesX.add(widget.currentX);
        _samplesY.add(widget.currentY);
      }

      setState(() {
        _countdown--;
      });

      if (_countdown <= 0) {
        timer.cancel();
        _finishCenterCapture();
      }
    });
  }

  void _finishCenterCapture() {
    if (_samplesX.isEmpty) {
      setState(() {
        _step = SimpleCalibrationStep.intro;
      });
      return;
    }

    // 平均値を計算
    _centerX = _samplesX.reduce((a, b) => a + b) / _samplesX.length;
    _centerY = _samplesY.reduce((a, b) => a + b) / _samplesY.length;

    // 範囲の初期値を中央に設定
    _minX = _centerX;
    _maxX = _centerX;
    _minY = _centerY;
    _maxY = _centerY;

    setState(() {
      _step = SimpleCalibrationStep.detectingRange;
      _isDetecting = false;
    });
  }

  void _startRangeDetection() {
    setState(() {
      _isDetecting = true;
      _remainingTime = _detectDuration;
      _maxMouth = 0;
    });

    // 範囲検出開始
    _captureTimer = Timer.periodic(const Duration(milliseconds: 100), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }

      // 顔が検出されている間、範囲を更新
      if (widget.isFaceDetected && widget.currentMouth > 0.1) {
        setState(() {
          // 上下の範囲を更新
          if (widget.currentX < _minX) _minX = widget.currentX;
          if (widget.currentX > _maxX) _maxX = widget.currentX;

          // 左右の範囲を更新
          if (widget.currentY < _minY) _minY = widget.currentY;
          if (widget.currentY > _maxY) _maxY = widget.currentY;

          // 口の最大開き
          if (widget.currentMouth > _maxMouth) {
            _maxMouth = widget.currentMouth;
          }
        });
      }
    });

    // 残り時間カウントダウン
    Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        _captureTimer?.cancel();
        return;
      }

      setState(() {
        _remainingTime--;
      });

      if (_remainingTime <= 0) {
        timer.cancel();
        _captureTimer?.cancel();
        _finishRangeDetection();
      }
    });
  }

  void _finishRangeDetection() {
    setState(() {
      _step = SimpleCalibrationStep.done;
    });

    // 少し待ってから完了
    Future.delayed(const Duration(milliseconds: 1500), () {
      if (mounted) {
        _completeCalibration();
      }
    });
  }

  void _completeCalibration() {
    // 範囲を計算（中央からの距離）
    final rangeUp = (_centerX - _minX).abs();
    final rangeDown = (_maxX - _centerX).abs();
    final rangeLeft = (_centerY - _minY).abs();
    final rangeRight = (_maxY - _centerY).abs();

    // 上下・左右の平均を取る
    final rangeY = ((rangeUp + rangeDown) / 2).clamp(10.0, 60.0);
    final rangeX = ((rangeLeft + rangeRight) / 2).clamp(10.0, 50.0);

    // 口の閾値
    final mouthThreshold = (_maxMouth * 0.3).clamp(0.1, 0.5);

    // 軸の対応:
    // - centerX/rangeX は normalizeX(rotY) で使用 → rotY（左右）のデータを格納
    // - centerY/rangeY は normalizeY(rotX) で使用 → rotX（上下）のデータを格納
    final calibration = CalibrationData(
      centerX: _centerY,  // rotY（左右）の中央値
      centerY: _centerX,  // rotX（上下）の中央値
      rangeX: rangeX,     // 左右の範囲
      rangeY: rangeY,     // 上下の範囲
      mouthThreshold: mouthThreshold,
    );

    widget.onComplete(calibration);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black.withOpacity(0.95),
      child: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 40),

            // タイトル
            const Text(
              'かんたんキャリブレーション',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),

            const SizedBox(height: 40),

            // メインコンテンツ
            Expanded(
              child: _buildStepContent(),
            ),

            // 進捗インジケーター
            _buildProgressIndicator(),

            const SizedBox(height: 20),

            // キャンセルボタン
            TextButton(
              onPressed: widget.onCancel,
              child: const Text('キャンセル', style: TextStyle(color: Colors.grey)),
            ),

            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildStepContent() {
    switch (_step) {
      case SimpleCalibrationStep.intro:
        return _buildIntroStep();
      case SimpleCalibrationStep.settingCenter:
        return _buildCenterStep();
      case SimpleCalibrationStep.detectingRange:
        return _buildRangeStep();
      case SimpleCalibrationStep.done:
        return _buildDoneStep();
    }
  }

  Widget _buildIntroStep() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 32),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.grey.shade900,
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Column(
            children: [
              Icon(Icons.face, size: 64, color: Colors.blue),
              SizedBox(height: 24),
              Text(
                '2ステップで完了',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              SizedBox(height: 16),
              Text(
                '① 正面を向いて固定\n② 口を開けて顔を動かす',
                style: TextStyle(fontSize: 16, color: Colors.white70, height: 1.5),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
        const SizedBox(height: 40),
        ElevatedButton.icon(
          onPressed: widget.isFaceDetected ? _startCenterCapture : null,
          icon: const Icon(Icons.play_arrow),
          label: const Text('開始'),
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 16),
            backgroundColor: Colors.blue,
          ),
        ),
        if (!widget.isFaceDetected)
          const Padding(
            padding: EdgeInsets.only(top: 16),
            child: Text('顔が検出されていません', style: TextStyle(color: Colors.red)),
          ),
      ],
    );
  }

  Widget _buildCenterStep() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.center_focus_strong, size: 80, color: Colors.blue),
        const SizedBox(height: 32),
        const Text(
          '正面を向いてください',
          style: TextStyle(fontSize: 24, color: Colors.white, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),
        const Text(
          'この位置が中央になります',
          style: TextStyle(fontSize: 16, color: Colors.white70),
        ),
        const SizedBox(height: 40),
        Container(
          width: 100,
          height: 100,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.blue.shade700,
          ),
          child: Center(
            child: Text(
              '$_countdown',
              style: const TextStyle(
                fontSize: 48,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildRangeStep() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // 範囲表示
        Container(
          width: 200,
          height: 250,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey.shade700, width: 2),
            borderRadius: BorderRadius.circular(12),
          ),
          child: CustomPaint(
            painter: _RangeVisualizerPainter(
              centerX: _centerX,
              centerY: _centerY,
              currentX: widget.currentX,
              currentY: widget.currentY,
              minX: _minX,
              maxX: _maxX,
              minY: _minY,
              maxY: _maxY,
              isFaceDetected: widget.isFaceDetected,
              isMouthOpen: widget.currentMouth > 0.1,
            ),
          ),
        ),

        const SizedBox(height: 24),

        if (!_isDetecting) ...[
          const Text(
            '口を開けたまま\n上下左右に顔を動かしてください',
            style: TextStyle(fontSize: 18, color: Colors.white, height: 1.5),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          const Text(
            '動ける範囲ギリギリまで動かしましょう',
            style: TextStyle(fontSize: 14, color: Colors.white54),
          ),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            onPressed: _startRangeDetection,
            icon: const Icon(Icons.motion_photos_on),
            label: const Text('範囲検出を開始'),
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              backgroundColor: Colors.green,
            ),
          ),
        ] else ...[
          Text(
            '残り $_remainingTime 秒',
            style: const TextStyle(fontSize: 32, color: Colors.green, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),
          const Text(
            '顔を上下左右に動かしてください',
            style: TextStyle(fontSize: 16, color: Colors.white70),
          ),
          const SizedBox(height: 8),
          Text(
            widget.currentMouth > 0.1 ? '👄 口: 開いています' : '⚠️ 口を開けてください',
            style: TextStyle(
              fontSize: 14,
              color: widget.currentMouth > 0.1 ? Colors.green : Colors.orange,
            ),
          ),
          const SizedBox(height: 16),
          // 検出範囲の表示
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.grey.shade900,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '上下: ${(_maxX - _minX).toStringAsFixed(1)}°  左右: ${(_maxY - _minY).toStringAsFixed(1)}°',
              style: const TextStyle(color: Colors.white70, fontFamily: 'monospace'),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildDoneStep() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.check_circle, size: 100, color: Colors.green),
        const SizedBox(height: 32),
        const Text(
          'キャリブレーション完了！',
          style: TextStyle(fontSize: 24, color: Colors.white, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.grey.shade900,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            children: [
              Text(
                '検出範囲',
                style: TextStyle(color: Colors.grey.shade500, fontSize: 12),
              ),
              const SizedBox(height: 8),
              Text(
                '上下: ${(_maxX - _minX).toStringAsFixed(1)}°',
                style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
              ),
              Text(
                '左右: ${(_maxY - _minY).toStringAsFixed(1)}°',
                style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildProgressIndicator() {
    final steps = [
      SimpleCalibrationStep.intro,
      SimpleCalibrationStep.settingCenter,
      SimpleCalibrationStep.detectingRange,
      SimpleCalibrationStep.done,
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

/// 範囲可視化用のペインター
class _RangeVisualizerPainter extends CustomPainter {
  final double centerX, centerY;
  final double currentX, currentY;
  final double minX, maxX, minY, maxY;
  final bool isFaceDetected;
  final bool isMouthOpen;

  _RangeVisualizerPainter({
    required this.centerX,
    required this.centerY,
    required this.currentX,
    required this.currentY,
    required this.minX,
    required this.maxX,
    required this.minY,
    required this.maxY,
    required this.isFaceDetected,
    required this.isMouthOpen,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final centerPx = Offset(size.width / 2, size.height / 2);

    // 範囲の可視化（検出された範囲を矩形で表示）
    final rangeX = (maxX - minX).clamp(1.0, 100.0);
    final rangeY = (maxY - minY).clamp(1.0, 100.0);

    if (rangeX > 1 || rangeY > 1) {
      final rangePaint = Paint()
        ..color = Colors.green.withOpacity(0.3)
        ..style = PaintingStyle.fill;

      // 検出範囲を画面サイズにマッピング
      final scaleX = size.width / 60;  // 60度を画面幅に
      final scaleY = size.height / 80; // 80度を画面高さに

      final left = centerPx.dx + (minY - centerY) * scaleX;
      final right = centerPx.dx + (maxY - centerY) * scaleX;
      final top = centerPx.dy + (minX - centerX) * scaleY;
      final bottom = centerPx.dy + (maxX - centerX) * scaleY;

      canvas.drawRect(
        Rect.fromLTRB(left, top, right, bottom),
        rangePaint,
      );

      // 範囲の枠線
      final borderPaint = Paint()
        ..color = Colors.green
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2;
      canvas.drawRect(
        Rect.fromLTRB(left, top, right, bottom),
        borderPaint,
      );
    }

    // 中央マーク
    final centerMarkPaint = Paint()
      ..color = Colors.blue
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    canvas.drawLine(
      Offset(centerPx.dx - 10, centerPx.dy),
      Offset(centerPx.dx + 10, centerPx.dy),
      centerMarkPaint,
    );
    canvas.drawLine(
      Offset(centerPx.dx, centerPx.dy - 10),
      Offset(centerPx.dx, centerPx.dy + 10),
      centerMarkPaint,
    );

    // 現在位置
    if (isFaceDetected) {
      final scaleX = size.width / 60;
      final scaleY = size.height / 80;

      final cursorX = centerPx.dx + (currentY - centerY) * scaleX;
      final cursorY = centerPx.dy + (currentX - centerX) * scaleY;

      final cursorPaint = Paint()
        ..color = isMouthOpen ? Colors.red : Colors.orange
        ..style = PaintingStyle.fill;

      canvas.drawCircle(Offset(cursorX, cursorY), 8, cursorPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _RangeVisualizerPainter oldDelegate) => true;
}
