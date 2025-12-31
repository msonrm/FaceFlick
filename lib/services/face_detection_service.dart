import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' show Size;

import 'package:camera/camera.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

import '../models/face_state.dart';

/// 顔検出サービス
class FaceDetectionService {
  late final FaceDetector _faceDetector;
  bool _isProcessing = false;

  final _faceStateController = StreamController<FaceState>.broadcast();
  Stream<FaceState> get faceStateStream => _faceStateController.stream;

  FaceDetectionService() {
    _faceDetector = FaceDetector(
      options: FaceDetectorOptions(
        enableClassification: true,  // 口の開閉検出に必要
        enableLandmarks: true,       // ランドマーク検出
        enableTracking: true,        // 顔追跡
        performanceMode: FaceDetectorMode.fast,
      ),
    );
  }

  /// カメラ画像から顔を検出
  Future<void> processImage(CameraImage image, CameraDescription camera) async {
    if (_isProcessing) return;
    _isProcessing = true;

    try {
      final inputImage = _convertCameraImage(image, camera);
      if (inputImage == null) {
        _isProcessing = false;
        return;
      }

      final faces = await _faceDetector.processImage(inputImage);

      if (faces.isEmpty) {
        _faceStateController.add(const FaceState(isFaceDetected: false));
      } else {
        final face = faces.first;
        final faceState = _extractFaceState(face);
        _faceStateController.add(faceState);
      }
    } catch (e) {
      print('Face detection error: $e');
    } finally {
      _isProcessing = false;
    }
  }

  /// CameraImageをInputImageに変換
  InputImage? _convertCameraImage(CameraImage image, CameraDescription camera) {
    final format = InputImageFormatValue.fromRawValue(image.format.raw);
    if (format == null) return null;

    // カメラの回転を取得
    final rotation = InputImageRotationValue.fromRawValue(camera.sensorOrientation);
    if (rotation == null) return null;

    return InputImage.fromBytes(
      bytes: _concatenatePlanes(image.planes),
      metadata: InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: rotation,
        format: format,
        bytesPerRow: image.planes.first.bytesPerRow,
      ),
    );
  }

  /// 画像のプレーンを連結
  Uint8List _concatenatePlanes(List<Plane> planes) {
    final bytes = <int>[];
    for (final plane in planes) {
      bytes.addAll(plane.bytes);
    }
    return Uint8List.fromList(bytes);
  }

  /// Faceオブジェクトから顔の状態を抽出
  FaceState _extractFaceState(Face face) {
    // 顔の回転角度（度）
    final rotX = face.headEulerAngleX ?? 0.0;  // 上下の傾き
    final rotY = face.headEulerAngleY ?? 0.0;  // 左右の傾き
    final rotZ = face.headEulerAngleZ ?? 0.0;  // 首かしげ

    // 口の開き具合を計算
    final mouthOpenRatio = _calculateMouthOpenRatio(face);

    return FaceState(
      headRotationX: rotX,
      headRotationY: rotY,
      headRotationZ: rotZ,
      mouthOpenRatio: mouthOpenRatio,
      isFaceDetected: true,
    );
  }

  /// 口の開き具合を計算（0.0〜1.0）
  double _calculateMouthOpenRatio(Face face) {
    // ランドマークから口の開き具合を推定
    final upperLip = face.landmarks[FaceLandmarkType.noseBase];
    final lowerLip = face.landmarks[FaceLandmarkType.bottomMouth];

    if (upperLip == null || lowerLip == null) {
      // ランドマークが取れない場合は 0 を返す
      return 0.0;
    }

    // 上唇と下唇の距離から開き具合を計算
    final distance = (lowerLip.position.y - upperLip.position.y).abs();

    // 顔のサイズで正規化
    final faceHeight = face.boundingBox.height;
    final normalizedDistance = distance / faceHeight;

    // 0.05〜0.15の範囲を0〜1にマッピング
    const minRatio = 0.05;
    const maxRatio = 0.15;
    final ratio = ((normalizedDistance - minRatio) / (maxRatio - minRatio))
        .clamp(0.0, 1.0);

    return ratio;
  }

  /// リソースを解放
  void dispose() {
    _faceDetector.close();
    _faceStateController.close();
  }
}
