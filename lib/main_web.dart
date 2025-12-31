import 'dart:async';
import 'dart:html' as html;
import 'dart:js_util' as js_util;
import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';

import 'models/calibration.dart';
import 'models/face_state.dart';
import 'models/flick_key.dart';
import 'services/input_manager.dart';
import 'widgets/calibration_overlay.dart';
import 'widgets/flick_keyboard.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // カメラビデオ要素のビューファクトリを登録
  ui_web.platformViewRegistry.registerViewFactory(
    'camera-view',
    (int viewId) {
      final container = html.DivElement()
        ..style.width = '100%'
        ..style.height = '100%'
        ..style.backgroundColor = 'black'
        ..style.display = 'flex'
        ..style.alignItems = 'center'
        ..style.justifyContent = 'center';

      // カメラビデオを複製して表示
      final video = html.VideoElement()
        ..id = 'displayVideo-$viewId'
        ..style.width = '100%'
        ..style.height = '100%'
        ..style.objectFit = 'cover'
        ..style.transform = 'scaleX(-1)'
        ..setAttribute('playsinline', 'true')
        ..setAttribute('autoplay', 'true')
        ..muted = true;

      container.append(video);

      // カメラビデオのストリームを共有
      Timer.periodic(const Duration(milliseconds: 100), (timer) {
        final sourceVideo = html.document.getElementById('cameraVideo') as html.VideoElement?;
        if (sourceVideo != null && sourceVideo.srcObject != null && video.srcObject == null) {
          video.srcObject = sourceVideo.srcObject;
          video.play();
          timer.cancel();
        }
      });

      return container;
    },
  );

  runApp(const FaceFlickWebApp());
}

class FaceFlickWebApp extends StatelessWidget {
  const FaceFlickWebApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FaceFlick',
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF1a1a2e),
        colorScheme: const ColorScheme.dark(
          primary: Colors.blue,
          secondary: Colors.blueAccent,
        ),
      ),
      home: const FaceFlickWebPage(),
      debugShowCheckedModeBanner: false,
    );
  }
}

class FaceFlickWebPage extends StatefulWidget {
  const FaceFlickWebPage({super.key});

  @override
  State<FaceFlickWebPage> createState() => _FaceFlickWebPageState();
}

class _FaceFlickWebPageState extends State<FaceFlickWebPage> {
  final _inputManager = InputManager();

  String _inputText = '';
  FaceState _currentFaceState = const FaceState();
  InputState _inputState = const InputState();
  bool _isInitialized = false;
  bool _showDebug = true;
  bool _showCalibration = false;
  String _statusMessage = '初期化中...';

  // キャリブレーションデータ
  CalibrationData _calibration = const CalibrationData();
  bool _isCalibrated = false;

  // 生の顔データ（キャリブレーション用）
  double _rawFaceX = 0;
  double _rawFaceY = 0;
  double _rawMouth = 0;

  Timer? _processingTimer;

  @override
  void initState() {
    super.initState();
    _setupListeners();
    _initialize();
  }

  void _setupListeners() {
    _inputManager.stateStream.listen((inputState) {
      if (mounted) {
        setState(() {
          _inputState = inputState;
        });
      }
    });

    _inputManager.inputStream.listen((char) {
      if (mounted) {
        setState(() {
          if (char == '⌫') {
            if (_inputText.isNotEmpty) {
              _inputText = _inputText.substring(0, _inputText.length - 1);
            }
          } else {
            _inputText += char;
          }
        });
      }
    });
  }

  Future<void> _initialize() async {
    try {
      setState(() {
        _statusMessage = 'MediaPipe初期化中...';
      });

      // MediaPipeを初期化
      final initResult = await js_util.promiseToFuture(
        js_util.callMethod(html.window, 'initMediaPipe', [])
      );
      print('MediaPipe init result: $initResult');

      setState(() {
        _statusMessage = 'カメラ起動中...';
      });

      // カメラを開始
      final cameraResult = await js_util.promiseToFuture(
        js_util.callMethod(html.window, 'startCamera', [])
      );
      print('Camera start result: $cameraResult');

      if (cameraResult == true) {
        setState(() {
          _isInitialized = true;
          _statusMessage = 'キャリブレーションしてください';
          _showCalibration = true; // 初回はキャリブレーションを表示
        });

        // 顔検出結果のポーリングを開始
        _startPolling();
      } else {
        setState(() {
          _statusMessage = 'カメラの起動に失敗しました';
        });
      }
    } catch (e) {
      print('Initialization error: $e');
      setState(() {
        _statusMessage = 'エラー: $e';
      });
    }
  }

  void _startPolling() {
    _processingTimer = Timer.periodic(const Duration(milliseconds: 50), (_) {
      _pollFaceData();
    });
  }

  void _pollFaceData() {
    if (!_isInitialized) return;

    try {
      final result = js_util.callMethod(html.window, 'getLastFaceData', []);

      if (result != null) {
        final detected = js_util.getProperty(result, 'detected') as bool? ?? false;

        if (detected) {
          final rotX = (js_util.getProperty(result, 'headRotationX') as num?)?.toDouble() ?? 0.0;
          final rotY = (js_util.getProperty(result, 'headRotationY') as num?)?.toDouble() ?? 0.0;
          final mouth = (js_util.getProperty(result, 'mouthOpenRatio') as num?)?.toDouble() ?? 0.0;

          // 生データを保存（キャリブレーション用）
          _rawFaceX = rotX;
          _rawFaceY = rotY;
          _rawMouth = mouth;

          // キャリブレーション済みの場合は正規化
          FaceState faceState;
          if (_isCalibrated) {
            final normalizedX = _calibration.normalizeX(rotY); // Y軸（左右）
            final normalizedY = _calibration.normalizeY(rotX); // X軸（上下）
            final gridPos = _calibration.getGridPosition(normalizedX, normalizedY);
            final isMouthOpen = _calibration.isMouthOpen(mouth);

            faceState = FaceState(
              headRotationX: normalizedY * 45,
              headRotationY: normalizedX * 45,
              headRotationZ: 0.0,
              mouthOpenRatio: isMouthOpen ? 0.5 : 0.0,
              isFaceDetected: true,
            );
          } else {
            faceState = FaceState(
              headRotationX: rotX,
              headRotationY: rotY,
              headRotationZ: 0.0,
              mouthOpenRatio: mouth,
              isFaceDetected: true,
            );
          }

          if (mounted) {
            setState(() {
              _currentFaceState = faceState;
              if (!_showCalibration) {
                _statusMessage = '顔を検出しました';
              }
            });
          }

          if (!_showCalibration) {
            _inputManager.updateFaceState(faceState);
          }
        } else {
          if (mounted) {
            setState(() {
              _currentFaceState = const FaceState(isFaceDetected: false);
              if (!_showCalibration) {
                _statusMessage = '顔を検出中...';
              }
            });
          }
        }
      }
    } catch (e) {
      // エラーは無視
    }
  }

  void _onCalibrationComplete(CalibrationData calibration) {
    setState(() {
      _calibration = calibration;
      _isCalibrated = true;
      _showCalibration = false;
      _statusMessage = '準備完了';
    });
    print('Calibration complete: $calibration');
  }

  void _onCalibrationCancel() {
    setState(() {
      _showCalibration = false;
      if (!_isCalibrated) {
        // デフォルトのキャリブレーションを使用
        _calibration = CalibrationData(
          centerX: _rawFaceX,
          centerY: _rawFaceY,
          rangeX: 25.0,
          rangeY: 30.0,
          mouthThreshold: 0.25,
        );
        _isCalibrated = true;
      }
    });
  }

  @override
  void dispose() {
    _processingTimer?.cancel();
    _inputManager.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('FaceFlick'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          // キャリブレーションボタン
          IconButton(
            icon: const Icon(Icons.tune),
            onPressed: () => setState(() => _showCalibration = true),
            tooltip: 'キャリブレーション',
          ),
          IconButton(
            icon: Icon(_showDebug ? Icons.bug_report : Icons.bug_report_outlined),
            onPressed: () => setState(() => _showDebug = !_showDebug),
          ),
          IconButton(
            icon: const Icon(Icons.clear),
            onPressed: () => setState(() => _inputText = ''),
          ),
        ],
      ),
      body: Stack(
        children: [
          // メインコンテンツ
          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isWide = constraints.maxWidth > 800;

                if (isWide) {
                  return _buildWideLayout();
                } else {
                  return _buildNarrowLayout();
                }
              },
            ),
          ),
          // キャリブレーションオーバーレイ
          if (_showCalibration)
            CalibrationOverlay(
              currentX: _rawFaceX,
              currentY: _rawFaceY,
              currentMouth: _rawMouth,
              isFaceDetected: _currentFaceState.isFaceDetected,
              onComplete: _onCalibrationComplete,
              onCancel: _onCalibrationCancel,
            ),
        ],
      ),
    );
  }

  Widget _buildWideLayout() {
    return Row(
      children: [
        Expanded(
          flex: 1,
          child: Column(
            children: [
              _buildInputDisplay(),
              Expanded(child: _buildCameraPreview()),
              if (_showDebug) _buildDebugInfo(),
            ],
          ),
        ),
        Expanded(
          flex: 1,
          child: Column(
            children: [
              if (_showDebug) _buildUsageGuide(),
              Expanded(
                child: Center(
                  child: FlickKeyboardWidget(
                    selectedCell: _getSelectedCell(),
                    flickDirection: _inputState.flickDirection,
                    inputPhase: _inputState.phase,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildNarrowLayout() {
    return Column(
      children: [
        _buildInputDisplay(),
        Expanded(flex: 2, child: _buildCameraPreview()),
        if (_showDebug) _buildDebugInfo(),
        Expanded(
          flex: 3,
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: FlickKeyboardWidget(
              selectedCell: _getSelectedCell(),
              flickDirection: _inputState.flickDirection,
              inputPhase: _inputState.phase,
            ),
          ),
        ),
        if (_showDebug) _buildUsageGuide(),
      ],
    );
  }

  Widget _buildInputDisplay() {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey.shade900,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade700),
      ),
      child: Text(
        _inputText.isEmpty ? 'ここに入力が表示されます' : _inputText,
        style: TextStyle(
          fontSize: 20,
          color: _inputText.isEmpty ? Colors.grey : Colors.white,
        ),
      ),
    );
  }

  Widget _buildCameraPreview() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Container(
          color: Colors.black,
          child: Stack(
            children: [
              // カメラビュー
              if (_isInitialized)
                const Positioned.fill(
                  child: HtmlElementView(viewType: 'camera-view'),
                ),
              // ローディング表示
              if (!_isInitialized)
                Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const CircularProgressIndicator(),
                      const SizedBox(height: 16),
                      Text(_statusMessage, style: const TextStyle(color: Colors.white)),
                    ],
                  ),
                ),
              // 顔検出ガイド
              Center(
                child: Container(
                  width: 150,
                  height: 200,
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: _currentFaceState.isFaceDetected
                          ? Colors.green.withOpacity(0.8)
                          : Colors.white.withOpacity(0.5),
                      width: 2,
                    ),
                    borderRadius: BorderRadius.circular(75),
                  ),
                ),
              ),
              // ステータス表示
              Positioned(
                bottom: 8,
                left: 8,
                right: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _statusMessage,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: _currentFaceState.isFaceDetected ? Colors.green : Colors.white,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDebugInfo() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Text(
            '生データ X: ${_rawFaceX.toStringAsFixed(1)}° Y: ${_rawFaceY.toStringAsFixed(1)}° 口: ${(_rawMouth * 100).toStringAsFixed(0)}%',
            style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Colors.white70),
          ),
          Text(
            '正規化 X: ${_currentFaceState.headRotationX.toStringAsFixed(1)}° Y: ${_currentFaceState.headRotationY.toStringAsFixed(1)}° | '
            '状態: ${_inputState.phase.name}',
            style: const TextStyle(fontSize: 10, fontFamily: 'monospace'),
          ),
        ],
      ),
    );
  }

  (int, int)? _getSelectedCell() {
    if (_inputState.phase != InputPhase.idle) {
      return _inputState.selectedCell;
    }
    if (_isCalibrated && _currentFaceState.isFaceDetected) {
      final normalizedX = _calibration.normalizeX(_rawFaceY);
      final normalizedY = _calibration.normalizeY(_rawFaceX);
      return _calibration.getGridPosition(normalizedX, normalizedY);
    }
    return _currentFaceState.getGridPosition();
  }

  Widget _buildUsageGuide() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.blue.shade900.withOpacity(0.5),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('使い方:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
          SizedBox(height: 4),
          Text('1. 顔を動かしてキーを選択', style: TextStyle(fontSize: 12)),
          Text('2. 口を開けてキーを押下', style: TextStyle(fontSize: 12)),
          Text('3. 口を開けたまま顔を動かしてフリック', style: TextStyle(fontSize: 12)),
          Text('4. 口を閉じて確定', style: TextStyle(fontSize: 12)),
        ],
      ),
    );
  }
}
