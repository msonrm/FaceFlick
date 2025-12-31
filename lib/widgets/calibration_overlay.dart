import 'dart:async';
import 'package:flutter/material.dart';
import '../models/calibration.dart';

/// キャリブレーションオーバーレイウィジェット
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

  // キャリブレーション中の値
  double _centerX = 0;
  double _centerY = 0;
  double _leftX = 0;
  double _rightX = 0;
  double _topY = 0;
  double _bottomY = 0;
  double _maxMouth = 0;

  // サンプリング用
  final List<double> _samples = [];
  Timer? _captureTimer;

  @override
  void dispose() {
    _captureTimer?.cancel();
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
      _samples.clear();
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
    Timer.periodic(const Duration(milliseconds: 100), (timer) {
      if (_countdown <= 0 || !mounted) {
        timer.cancel();
        return;
      }
      if (widget.isFaceDetected) {
        _samples.add(_getCurrentValue());
      }
    });
  }

  double _getCurrentValue() {
    switch (_step) {
      case CalibrationStep.settingCenter:
      case CalibrationStep.settingLeft:
      case CalibrationStep.settingRight:
        return widget.currentY; // Y軸（左右）
      case CalibrationStep.settingTop:
      case CalibrationStep.settingBottom:
        return widget.currentX; // X軸（上下）
      case CalibrationStep.settingMouth:
        return widget.currentMouth;
      default:
        return 0;
    }
  }

  void _finishCapture() {
    if (_samples.isEmpty) {
      setState(() {
        _isCapturing = false;
      });
      return;
    }

    // 平均値を計算
    final avg = _samples.reduce((a, b) => a + b) / _samples.length;

    setState(() {
      switch (_step) {
        case CalibrationStep.settingCenter:
          _centerX = widget.currentX;
          _centerY = widget.currentY;
          break;
        case CalibrationStep.settingLeft:
          _leftX = avg;
          break;
        case CalibrationStep.settingRight:
          _rightX = avg;
          break;
        case CalibrationStep.settingTop:
          _topY = avg;
          break;
        case CalibrationStep.settingBottom:
          _bottomY = avg;
          break;
        case CalibrationStep.settingMouth:
          _maxMouth = avg;
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
    // 範囲を計算
    final rangeX = ((_rightX - _leftX).abs() / 2).clamp(10.0, 60.0);
    final rangeY = ((_bottomY - _topY).abs() / 2).clamp(10.0, 60.0);
    final mouthThreshold = (_maxMouth * 0.5).clamp(0.1, 0.8);

    final calibration = CalibrationData(
      centerX: _centerX,
      centerY: _centerY,
      rangeX: rangeX,
      rangeY: rangeY,
      mouthThreshold: mouthThreshold,
    );

    widget.onComplete(calibration);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black87,
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // タイトル
            const Text(
              'キャリブレーション',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 32),

            // 指示
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              decoration: BoxDecoration(
                color: Colors.blue.shade800,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                _step.instruction,
                style: const TextStyle(
                  fontSize: 20,
                  color: Colors.white,
                ),
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 32),

            // カウントダウンまたはボタン
            if (_isCapturing)
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.green.shade700,
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
                  const SizedBox(height: 8),
                  if (!widget.isFaceDetected)
                    const Text(
                      '顔が検出されていません',
                      style: TextStyle(color: Colors.red),
                    ),
                ],
              ),

            const SizedBox(height: 32),

            // 現在の値を表示（デバッグ用）
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.grey.shade900,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  Text(
                    '現在の値: X=${widget.currentX.toStringAsFixed(1)}° Y=${widget.currentY.toStringAsFixed(1)}°',
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                  Text(
                    '口: ${(widget.currentMouth * 100).toStringAsFixed(0)}%',
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 32),

            // キャンセルボタン
            TextButton(
              onPressed: widget.onCancel,
              child: const Text('キャンセル', style: TextStyle(color: Colors.grey)),
            ),

            // プログレス表示
            const SizedBox(height: 16),
            _buildProgressIndicator(),
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
