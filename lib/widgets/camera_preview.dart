import 'package:flutter/material.dart';
import 'package:camera/camera.dart';

/// カメラプレビューウィジェット
class CameraPreviewWidget extends StatelessWidget {
  final CameraController? controller;
  final bool showDebugInfo;
  final String? debugText;

  const CameraPreviewWidget({
    super.key,
    this.controller,
    this.showDebugInfo = false,
    this.debugText,
  });

  @override
  Widget build(BuildContext context) {
    if (controller == null || !controller!.value.isInitialized) {
      return Container(
        color: Colors.black,
        child: const Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    return Stack(
      children: [
        // カメラプレビュー
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: AspectRatio(
            aspectRatio: controller!.value.aspectRatio,
            child: CameraPreview(controller!),
          ),
        ),
        // デバッグ情報
        if (showDebugInfo && debugText != null)
          Positioned(
            bottom: 8,
            left: 8,
            right: 8,
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                debugText!,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontFamily: 'monospace',
                ),
              ),
            ),
          ),
        // 顔検出ガイド
        Center(
          child: Container(
            width: 200,
            height: 250,
            decoration: BoxDecoration(
              border: Border.all(
                color: Colors.white.withOpacity(0.5),
                width: 2,
              ),
              borderRadius: BorderRadius.circular(100),
            ),
          ),
        ),
      ],
    );
  }
}
