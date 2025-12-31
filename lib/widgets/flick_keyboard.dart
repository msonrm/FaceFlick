import 'package:flutter/material.dart';
import '../models/flick_key.dart';
import '../models/face_state.dart';

/// フリックキーボードウィジェット
class FlickKeyboardWidget extends StatelessWidget {
  final (int, int)? selectedCell;
  final FlickDirection flickDirection;
  final InputPhase inputPhase;
  final VoidCallback? onBackspace;

  const FlickKeyboardWidget({
    super.key,
    this.selectedCell,
    this.flickDirection = FlickDirection.none,
    this.inputPhase = InputPhase.idle,
    this.onBackspace,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.grey.shade900,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(
          FlickKeyboard.keys.length,
          (row) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                FlickKeyboard.keys[row].length,
                (col) => _buildKeyCell(row, col),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildKeyCell(int row, int col) {
    final key = FlickKeyboard.keys[row][col];
    final isSelected = selectedCell == (row, col);
    final isSelecting = isSelected && inputPhase == InputPhase.selecting;
    final isFlicking = isSelected && inputPhase == InputPhase.flicking;

    return Container(
      width: 80,
      height: 80,
      margin: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: _getCellColor(isSelected, isSelecting, isFlicking),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isSelected ? Colors.blue : Colors.grey.shade700,
          width: isSelected ? 2 : 1,
        ),
        boxShadow: isSelected
            ? [
                BoxShadow(
                  color: Colors.blue.withOpacity(0.3),
                  blurRadius: 8,
                  spreadRadius: 2,
                )
              ]
            : null,
      ),
      child: Stack(
        children: [
          // 中央の文字
          Center(
            child: Text(
              key.center,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: isSelected ? Colors.white : Colors.grey.shade300,
              ),
            ),
          ),
          // フリック方向の表示
          if (isSelected) ..._buildFlickIndicators(key),
          // フリック中のハイライト
          if (isFlicking) _buildFlickHighlight(key),
        ],
      ),
    );
  }

  Color _getCellColor(bool isSelected, bool isSelecting, bool isFlicking) {
    if (isFlicking) return Colors.blue.shade700;
    if (isSelecting) return Colors.blue.shade800;
    if (isSelected) return Colors.grey.shade800;
    return Colors.grey.shade850;
  }

  List<Widget> _buildFlickIndicators(FlickKey key) {
    return [
      // 上
      if (key.up != null)
        Positioned(
          top: 4,
          left: 0,
          right: 0,
          child: Center(
            child: Text(
              key.up!,
              style: TextStyle(
                fontSize: 12,
                color: flickDirection == FlickDirection.up
                    ? Colors.yellow
                    : Colors.grey.shade500,
              ),
            ),
          ),
        ),
      // 下
      if (key.down != null)
        Positioned(
          bottom: 4,
          left: 0,
          right: 0,
          child: Center(
            child: Text(
              key.down!,
              style: TextStyle(
                fontSize: 12,
                color: flickDirection == FlickDirection.down
                    ? Colors.yellow
                    : Colors.grey.shade500,
              ),
            ),
          ),
        ),
      // 左
      if (key.left != null)
        Positioned(
          left: 4,
          top: 0,
          bottom: 0,
          child: Center(
            child: Text(
              key.left!,
              style: TextStyle(
                fontSize: 12,
                color: flickDirection == FlickDirection.left
                    ? Colors.yellow
                    : Colors.grey.shade500,
              ),
            ),
          ),
        ),
      // 右
      if (key.right != null)
        Positioned(
          right: 4,
          top: 0,
          bottom: 0,
          child: Center(
            child: Text(
              key.right!,
              style: TextStyle(
                fontSize: 12,
                color: flickDirection == FlickDirection.right
                    ? Colors.yellow
                    : Colors.grey.shade500,
              ),
            ),
          ),
        ),
    ];
  }

  Widget _buildFlickHighlight(FlickKey key) {
    final char = key.getCharByDirection(flickDirection);
    if (char == null || flickDirection == FlickDirection.none) {
      return const SizedBox.shrink();
    }

    Alignment alignment;
    switch (flickDirection) {
      case FlickDirection.up:
        alignment = Alignment.topCenter;
        break;
      case FlickDirection.down:
        alignment = Alignment.bottomCenter;
        break;
      case FlickDirection.left:
        alignment = Alignment.centerLeft;
        break;
      case FlickDirection.right:
        alignment = Alignment.centerRight;
        break;
      case FlickDirection.none:
        alignment = Alignment.center;
        break;
    }

    return Align(
      alignment: alignment,
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: Colors.yellow.withOpacity(0.8),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(
          char,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: Colors.black,
          ),
        ),
      ),
    );
  }
}
