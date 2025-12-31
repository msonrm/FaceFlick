import 'dart:async';
import 'dart:html' as html;
import 'dart:js' as js;

import 'package:flutter/material.dart';

import 'models/face_state.dart';
import 'models/flick_key.dart';
import 'services/input_manager.dart';
import 'widgets/flick_keyboard.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
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

  @override
  void initState() {
    super.initState();
    _setupListeners();
    _initializeCamera();
  }

  void _setupListeners() {
    _inputManager.stateStream.listen((inputState) {
      setState(() {
        _inputState = inputState;
      });
    });

    _inputManager.inputStream.listen((char) {
      setState(() {
        if (char == '⌫') {
          if (_inputText.isNotEmpty) {
            _inputText = _inputText.substring(0, _inputText.length - 1);
          }
        } else {
          _inputText += char;
        }
      });
    });
  }

  Future<void> _initializeCamera() async {
    try {
      // MediaPipeを初期化
      js.context.callMethod('initMediaPipe');

      // 少し待機してMediaPipeの初期化完了を待つ
      await Future.delayed(const Duration(milliseconds: 500));

      final mediaStream = await html.window.navigator.mediaDevices?.getUserMedia({
        'video': {
          'facingMode': 'user',
          'width': {'ideal': 640},
          'height': {'ideal': 480},
        }
      });

      if (mediaStream != null) {
        _videoElement = html.VideoElement()
          ..id = 'faceVideo'
          ..srcObject = mediaStream
          ..autoplay = true
          ..setAttribute('playsinline', 'true')
          ..style.position = 'absolute'
          ..style.top = '0'
          ..style.left = '0'
          ..style.width = '100%'
          ..style.height = '100%'
          ..style.objectFit = 'cover'
          ..style.transform = 'scaleX(-1)'; // ミラー表示

        await _videoElement!.play();

        setState(() {
          _isInitialized = true;
          _statusMessage = '顔を検出中...';
        });

        _startProcessing();
      }
    } catch (e) {
      setState(() {
        _statusMessage = 'カメラのアクセス許可が必要です';
      });
      print('Camera error: $e');
    }
  }

  void _startProcessing() {
    _processingTimer = Timer.periodic(const Duration(milliseconds: 50), (_) {
      _processFrame();
    });
  }

  void _processFrame() {
    if (!_isInitialized || _videoElement == null) return;

    // MediaPipeで処理
    js.context.callMethod('processVideoFrame', [_videoElement]);

    // 結果を取得
    final result = js.context.callMethod('getLastFaceData');
    if (result != null) {
      try {
        final jsResult = result as js.JsObject;
        final detected = jsResult['detected'] as bool? ?? false;

        FaceState faceState;
        if (detected) {
          faceState = FaceState(
            headRotationX: (jsResult['headRotationX'] as num?)?.toDouble() ?? 0.0,
            headRotationY: (jsResult['headRotationY'] as num?)?.toDouble() ?? 0.0,
            headRotationZ: (jsResult['headRotationZ'] as num?)?.toDouble() ?? 0.0,
            mouthOpenRatio: (jsResult['mouthOpenRatio'] as num?)?.toDouble() ?? 0.0,
            isFaceDetected: true,
          );
        } else {
          faceState = const FaceState(isFaceDetected: false);
        }

        setState(() {
          _currentFaceState = faceState;
          if (faceState.isFaceDetected) {
            _statusMessage = '顔を検出しました';
          } else {
            _statusMessage = '顔を検出中...';
          }
        });

        _inputManager.updateFaceState(faceState);
      } catch (e) {
        // 結果のパースエラーは無視
      }
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
              // ビデオ要素を表示するHtmlElementView
              if (_isInitialized && _videoElement != null)
                HtmlElementView(
                  viewType: 'videoElement',
                  onPlatformViewCreated: (id) {
                    // ビデオ要素を登録
                  },
                ),
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
