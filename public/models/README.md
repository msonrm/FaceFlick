# VRMモデル配置ディレクトリ

このディレクトリにVRMモデルを配置してください。

## VRMモデルの入手方法

### オプション 1: VRoid Hubから無料モデルをダウンロード

1. [VRoid Hub](https://hub.vroid.com/) にアクセス
2. CC0またはCC-BYライセンスのモデルを検索
3. モデルをダウンロード
4. このディレクトリに `avatar.vrm` として保存

### オプション 2: VRoid Studioで作成

1. [VRoid Studio](https://vroid.com/studio) をダウンロード・インストール
2. 簡単なアバターを作成
3. VRM形式でエクスポート
4. このディレクトリに `avatar.vrm` として保存

### オプション 3: サンプルモデル（開発用）

開発・テスト用に軽量なサンプルVRMを以下から入手できます：
- [Three-VRM Sample Models](https://github.com/pixiv/three-vrm/tree/dev/packages/three-vrm/examples/models)

## 配置するファイル名

デフォルトでは `avatar.vrm` という名前で配置してください。

```
public/models/avatar.vrm
```

別の名前を使用する場合は、コード内の `modelUrl` を変更してください。

## 注意事項

- VRMモデルのライセンスを必ず確認してください
- 商用利用する場合は、モデルのライセンスが商用利用可能か確認してください
- モデルのファイルサイズが大きいと読み込みに時間がかかります（推奨: 10MB以下）
