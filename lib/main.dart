import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:permission_handler/permission_handler.dart';

import 'models/face_state.dart';
import 'models/flick_key.dart';
import 'services/face_detection_service.dart';
import 'services/input_manager.dart';
import 'widgets/flick_keyboard.dart';
import 'widgets/camera_preview.dart';

late List<CameraDescription> cameras;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // カメラの取得
  cameras = await availableCameras();

  runApp(const FaceFlickApp());
}

class FaceFlickApp extends StatelessWidget {
  const FaceFlickApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FaceFlick',
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: Colors.black,
        colorScheme: ColorScheme.dark(
          primary: Colors.blue,
          secondary: Colors.blueAccent,
        ),
      ),
      home: const FaceFlickHomePage(),
      debugShowCheckedModeBanner: false,
    );
  }
}

class FaceFlickHomePage extends StatefulWidget {
  const FaceFlickHomePage({super.key});

  @override
  State<FaceFlickHomePage> createState() => _FaceFlickHomePageState();
}

class _FaceFlickHomePageState extends State<FaceFlickHomePage> {
  CameraController? _cameraController;
  CameraDescription? _frontCamera;
  final _faceDetectionService = FaceDetectionService();
  final _inputManager = InputManager();

  String _inputText = '';
  FaceState _currentFaceState = const FaceState();
  InputState _inputState = const InputState();
  bool _isInitialized = false;
  bool _showDebug = true;

  @override
  void initState() {
    super.initState();
    _initializeCamera();
    _setupListeners();
  }

  void _setupListeners() {
    // 顔の状態を監視
    _faceDetectionService.faceStateStream.listen((faceState) {
      setState(() {
        _currentFaceState = faceState;
      });
      _inputManager.updateFaceState(faceState);
    });

    // 入力状態を監視
    _inputManager.stateStream.listen((inputState) {
      setState(() {
        _inputState = inputState;
      });
    });

    // 入力を監視
    _inputManager.inputStream.listen((char) {
      setState(() {
        if (char == '⌫') {
          // バックスペース
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
    // カメラ権限をリクエスト
    final status = await Permission.camera.request();
    if (!status.isGranted) {
      // 権限がない場合
      return;
    }

    // フロントカメラを探す
    _frontCamera = cameras.firstWhere(
      (camera) => camera.lensDirection == CameraLensDirection.front,
      orElse: () => cameras.first,
    );

    if (_frontCamera == null) return;

    _cameraController = CameraController(
      _frontCamera!,
      ResolutionPreset.medium,
      enableAudio: false,
      imageFormatGroup: ImageFormatGroup.nv21,
    );

    try {
      await _cameraController!.initialize();

      // 画像ストリームを開始
      await _cameraController!.startImageStream((image) {
        _faceDetectionService.processImage(image, _frontCamera!);
      });

      setState(() {
        _isInitialized = true;
      });
    } catch (e) {
      print('Camera initialization error: $e');
    }
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    _faceDetectionService.dispose();
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
        child: Column(
          children: [
            // 入力テキスト表示
            _buildInputDisplay(),

            // カメラプレビュー
            Expanded(
              flex: 2,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: CameraPreviewWidget(
                  controller: _cameraController,
                  showDebugInfo: _showDebug,
                  debugText: _buildDebugText(),
                ),
              ),
            ),

            // フリックキーボード
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

            // 使い方ガイド
            if (_showDebug) _buildUsageGuide(),
          ],
        ),
      ),
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

  (int, int)? _getSelectedCell() {
    if (_inputState.phase != InputPhase.idle) {
      return _inputState.selectedCell;
    }
    return _currentFaceState.getGridPosition();
  }

  String _buildDebugText() {
    return '''
顔検出: ${_currentFaceState.isFaceDetected ? 'あり' : 'なし'}
傾きX: ${_currentFaceState.headRotationX.toStringAsFixed(1)}°
傾きY: ${_currentFaceState.headRotationY.toStringAsFixed(1)}°
口開き: ${(_currentFaceState.mouthOpenRatio * 100).toStringAsFixed(0)}%
状態: ${_inputState.phase.name}
''';
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
        children: [
          Text(
            '使い方:',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          ),
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
