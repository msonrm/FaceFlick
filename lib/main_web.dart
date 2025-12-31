import 'dart:async';
import 'dart:html' as html;
import 'dart:js_util' as js_util;
import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';

import 'models/face_state.dart';
import 'models/flick_key.dart';
import 'services/input_manager.dart';
import 'widgets/flick_keyboard.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // ビデオ要素のビューファクトリを登録
  ui_web.platformViewRegistry.registerViewFactory(
    'video-element',
    (int viewId) {
      final video = html.VideoElement()
        ..id = 'faceVideo-$viewId'
        ..autoplay = true
        ..setAttribute('playsinline', 'true')
        ..style.width = '100%'
        ..style.height = '100%'
        ..style.objectFit = 'cover'
        ..style.transform = 'scaleX(-1)';
      return video;
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
  String _statusMessage = 'カメラを初期化中...';

  html.VideoElement? _videoElement;
  Timer? _processingTimer;
  int? _videoViewId;

  @override
  void initState() {
    super.initState();
    _setupListeners();
    _initializeMediaPipe();
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

  Future<void> _initializeMediaPipe() async {
    try {
      // MediaPipeを初期化
      final initFunc = js_util.getProperty(html.window, 'initMediaPipe');
      if (initFunc != null) {
        await js_util.promiseToFuture(js_util.callMethod(html.window, 'initMediaPipe', []));
      }

      // 初期化完了を待つ
      await Future.delayed(const Duration(seconds: 1));

      setState(() {
        _statusMessage = 'カメラを起動中...';
      });

      await _initializeCamera();
    } catch (e) {
      print('MediaPipe initialization error: $e');
      setState(() {
        _statusMessage = 'MediaPipe初期化エラー: $e';
      });
    }
  }

  Future<void> _initializeCamera() async {
    try {
      final mediaStream = await html.window.navigator.mediaDevices?.getUserMedia({
        'video': {
          'facingMode': 'user',
          'width': {'ideal': 640},
          'height': {'ideal': 480},
        }
      });

      if (mediaStream != null) {
        setState(() {
          _isInitialized = true;
          _statusMessage = '顔を検出中...';
        });

        // 少し待ってからビデオ要素を取得
        await Future.delayed(const Duration(milliseconds: 500));

        // ビデオ要素を取得してストリームを設定
        _videoElement = html.document.querySelector('video[id^="faceVideo"]') as html.VideoElement?;
        if (_videoElement != null) {
          _videoElement!.srcObject = mediaStream;
          await _videoElement!.play();
          _startProcessing();
        } else {
          // ビデオ要素が見つからない場合は直接作成
          _videoElement = html.VideoElement()
            ..srcObject = mediaStream
            ..autoplay = true
            ..setAttribute('playsinline', 'true');
          html.document.body?.append(_videoElement!);
          _videoElement!.style.display = 'none';
          await _videoElement!.play();
          _startProcessing();
        }
      }
    } catch (e) {
      setState(() {
        _statusMessage = 'カメラのアクセス許可が必要です';
      });
      print('Camera error: $e');
    }
  }

  void _startProcessing() {
    _processingTimer = Timer.periodic(const Duration(milliseconds: 100), (_) {
      _processFrame();
    });
  }

  void _processFrame() {
    if (!_isInitialized || _videoElement == null) return;

    try {
      // MediaPipeで処理
      js_util.callMethod(html.window, 'processVideoFrame', [_videoElement]);

      // 結果を取得
      final result = js_util.callMethod(html.window, 'getLastFaceData', []);

      if (result != null) {
        final detected = js_util.getProperty(result, 'detected') as bool? ?? false;

        FaceState faceState;
        if (detected) {
          final rotX = js_util.getProperty(result, 'headRotationX');
          final rotY = js_util.getProperty(result, 'headRotationY');
          final rotZ = js_util.getProperty(result, 'headRotationZ');
          final mouth = js_util.getProperty(result, 'mouthOpenRatio');

          faceState = FaceState(
            headRotationX: (rotX as num?)?.toDouble() ?? 0.0,
            headRotationY: (rotY as num?)?.toDouble() ?? 0.0,
            headRotationZ: (rotZ as num?)?.toDouble() ?? 0.0,
            mouthOpenRatio: (mouth as num?)?.toDouble() ?? 0.0,
            isFaceDetected: true,
          );
        } else {
          faceState = const FaceState(isFaceDetected: false);
        }

        if (mounted) {
          setState(() {
            _currentFaceState = faceState;
            if (faceState.isFaceDetected) {
              _statusMessage = '顔を検出しました';
            } else {
              _statusMessage = '顔を検出中...';
            }
          });
        }

        _inputManager.updateFaceState(faceState);
      }
    } catch (e) {
      // エラーは無視
    }
  }

  @override
  void dispose() {
    _processingTimer?.cancel();
    _videoElement?.srcObject?.getTracks().forEach((track) => track.stop());
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
      body: SafeArea(
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
              // ビデオ要素を表示
              if (_isInitialized)
                const HtmlElementView(viewType: 'video-element'),
              // フォールバック表示
              if (!_isInitialized)
                Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const CircularProgressIndicator(),
                      const SizedBox(height: 16),
                      Text(_statusMessage),
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
      child: Text(
        '傾きX: ${_currentFaceState.headRotationX.toStringAsFixed(1)}° | '
        '傾きY: ${_currentFaceState.headRotationY.toStringAsFixed(1)}° | '
        '口: ${(_currentFaceState.mouthOpenRatio * 100).toStringAsFixed(0)}% | '
        '状態: ${_inputState.phase.name}',
        style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
      ),
    );
  }

  (int, int)? _getSelectedCell() {
    if (_inputState.phase != InputPhase.idle) {
      return _inputState.selectedCell;
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
