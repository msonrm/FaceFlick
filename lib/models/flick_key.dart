/// フリック入力のキー定義
class FlickKey {
  final String center;     // 中央（タップ）
  final String? up;        // 上フリック
  final String? down;      // 下フリック
  final String? left;      // 左フリック
  final String? right;     // 右フリック

  const FlickKey({
    required this.center,
    this.up,
    this.down,
    this.left,
    this.right,
  });

  String? getCharByDirection(FlickDirection direction) {
    switch (direction) {
      case FlickDirection.none:
        return center;
      case FlickDirection.up:
        return up ?? center;
      case FlickDirection.down:
        return down ?? center;
      case FlickDirection.left:
        return left ?? center;
      case FlickDirection.right:
        return right ?? center;
    }
  }
}

enum FlickDirection { none, up, down, left, right }

/// 日本語フリック入力のキー配列（3x4）
class FlickKeyboard {
  static const List<List<FlickKey>> keys = [
    // 1行目
    [
      FlickKey(center: 'あ', up: 'い', down: 'う', left: 'え', right: 'お'),
      FlickKey(center: 'か', up: 'き', down: 'く', left: 'け', right: 'こ'),
      FlickKey(center: 'さ', up: 'し', down: 'す', left: 'せ', right: 'そ'),
    ],
    // 2行目
    [
      FlickKey(center: 'た', up: 'ち', down: 'つ', left: 'て', right: 'と'),
      FlickKey(center: 'な', up: 'に', down: 'ぬ', left: 'ね', right: 'の'),
      FlickKey(center: 'は', up: 'ひ', down: 'ふ', left: 'へ', right: 'ほ'),
    ],
    // 3行目
    [
      FlickKey(center: 'ま', up: 'み', down: 'む', left: 'め', right: 'も'),
      FlickKey(center: 'や', up: '（', down: 'ゆ', left: '）', right: 'よ'),
      FlickKey(center: 'ら', up: 'り', down: 'る', left: 'れ', right: 'ろ'),
    ],
    // 4行目
    [
      FlickKey(center: '゛', up: '゜', down: '小', left: '　', right: '　'),
      FlickKey(center: 'わ', up: 'を', down: 'ん', left: 'ー', right: '〜'),
      FlickKey(center: '⌫', up: '　', down: '　', left: '　', right: '　'),  // バックスペース
    ],
  ];

  static FlickKey? getKey(int row, int col) {
    if (row >= 0 && row < keys.length && col >= 0 && col < keys[row].length) {
      return keys[row][col];
    }
    return null;
  }
}
